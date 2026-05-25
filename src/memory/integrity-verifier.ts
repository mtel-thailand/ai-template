/**
 * Integrity verifier for ONNX model weights and sqlite-vec extension.
 *
 * Per ADR-0003 §"Security requirements" (SR3, SR4) and threat model
 * (T-06, T-07):
 *
 * - **SR3.** `embeddings.lock` holds SHA-256 of ONNX files. First-use
 *   verification is fail-closed: on mismatch, no embedder weights are
 *   loaded and any prior cache is invalidated for subsequent attempts.
 *
 * - **SR4.** `sqlite-vec.lock` holds SHA-256 per platform binary.
 *   The `load_extension` wrapper is fail-closed: on mismatch, abort
 *   BEFORE any vec0 SQL is issued. NO silent fallback to lexical-only.
 *
 * Both lock files follow the format:
 *   <sha256hex>  <filename/detector>
 * One entry per line. Lines starting with '#' are comments.
 * Blank lines are ignored.
 */

import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

/**
 * A single entry parsed from a lock file.
 */
export interface LockEntry {
  /** Hex-encoded SHA-256 hash. */
  sha256: string;
  /** File path or platform detector string (e.g. "model.onnx" or "darwin-arm64"). */
  target: string;
}

/**
 * Result of a lock-file verification.
 */
export interface VerificationResult {
  /** Whether the verification passed. */
  ok: boolean;
  /** Human-readable explanation. */
  message: string;
  /** The specific entry that failed, if any. */
  failedEntry?: LockEntry;
}

/**
 * Result of verifying an embedder binary (ONNX weights).
 */
export interface EmbedderIntegrityResult extends VerificationResult {
  /** The expected SHA-256 from the lock file. */
  expectedSha: string | null;
}

/**
 * Result of verifying a sqlite-vec extension binary.
 */
export interface ExtensionIntegrityResult extends VerificationResult {
  /** The platform key that was matched. */
  platformKey: string | null;
}

/**
 * Error thrown when integrity verification fails.
 * This is a fail-closed error — the caller must not proceed with
 * any operation that depends on the verified artifact.
 */
export class IntegrityVerificationError extends Error {
  readonly code = 'INTEGRITY_VERIFICATION_ERROR';

  constructor(message: string, public readonly entry?: LockEntry) {
    super(message);
    this.name = 'IntegrityVerificationError';
  }
}

/**
 * Parse a lock file into its constituent entries.
 *
 * Format:
 *   # comment
 *   <sha256hex>  <target>
 *
 * @param content - Raw text content of the lock file
 * @returns Array of parsed LockEntry objects
 */
export function parseLockFile(content: string): LockEntry[] {
  const entries: LockEntry[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip blank lines and comments
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    // Split on whitespace: first token is SHA-256, rest is the target
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const sha256 = parts[0];
    // The target is the rest of the line after the hash
    const target = parts.slice(1).join(' ');

    entries.push({ sha256, target });
  }

  return entries;
}

/**
 * Compute the SHA-256 hash of a file at the given path.
 *
 * @param filePath - Absolute or relative path to the file
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256File(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify a file against its expected SHA-256 hash.
 *
 * @param filePath - Path to the file to verify
 * @param expectedSha - Expected hex-encoded SHA-256 hash
 * @returns VerificationResult
 */
export async function verifyFileHash(
  filePath: string,
  expectedSha: string,
): Promise<VerificationResult> {
  try {
    const actual = await sha256File(filePath);

    if (actual === expectedSha.toLowerCase()) {
      return { ok: true, message: `SHA-256 matches for ${filePath}` };
    }

    return {
      ok: false,
      message:
        `SHA-256 mismatch for ${filePath}. ` +
        `Expected: ${expectedSha}, got: ${actual}`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Failed to read or hash ${filePath}: ${errorMessage}`,
    };
  }
}

/**
 * Verify an ONNX model binary against the embeddings.lock file.
 *
 * This implements **SR3**: fail-closed on first use. On mismatch:
 * - Returns a non-ok result with the failed entry.
 * - The caller must NOT load any weights into memory.
 * - Any prior cache must not be trusted on retry without re-verification.
 *
 * @param lockFilePath - Path to the `embeddings.lock` file
 * @param onnxFilePath - Path to the ONNX model binary
 * @returns EmbedderIntegrityResult
 */
export async function verifyEmbedderIntegrity(
  lockFilePath: string,
  onnxFilePath: string,
): Promise<EmbedderIntegrityResult> {
  let lockContent: string;
  try {
    lockContent = await readFile(lockFilePath, 'utf-8');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Cannot read lock file at ${lockFilePath}: ${errorMessage}`,
      expectedSha: null,
    };
  }

  const entries = parseLockFile(lockContent);

  // Find the entry matching our ONNX file
  // Match against either the full path or just the filename
  const fileName = onnxFilePath.split('/').pop() ?? onnxFilePath;
  const entry = entries.find(
    (e) => e.target === onnxFilePath || e.target === fileName,
  );

  if (!entry) {
    return {
      ok: false,
      message: `No lock entry found for ${fileName} in ${lockFilePath}`,
      expectedSha: null,
    };
  }

  const result = await verifyFileHash(onnxFilePath, entry.sha256);

  return {
    ...result,
    expectedSha: entry.sha256,
  };
}

/**
 * Detect the current platform key for sqlite-vec extension lookup.
 *
 * Returns a string like "darwin-arm64", "linux-x64", "win32-x64".
 * Uses Node.js `process` properties.
 */
export function detectPlatform(): string {
  const { platform, arch } = process;
  const archMap: Record<string, string> = {
    x64: 'x64',
    arm64: 'arm64',
    ia32: 'x86',
  };

  const normArch = archMap[arch] ?? arch;
  const platformMap: Record<string, string> = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'win32',
  };

  const normPlatform = platformMap[platform] ?? platform;

  return `${normPlatform}-${normArch}`;
}

/**
 * Verify a sqlite-vec extension binary against the sqlite-vec.lock file.
 *
 * This implements **SR4**: fail-closed on mismatch. On mismatch:
 * - Returns a non-ok result.
 * - The caller must NOT issue any vec0 SQL.
 * - The SQLite connection must be closed or the process must exit non-zero.
 * - NO silent fallback to lexical-only mode is permitted.
 *
 * @param lockFilePath - Path to the `sqlite-vec.lock` file
 * @param extensionPath - Path to the sqlite-vec extension binary
 * @param platformKey - Optional platform override (auto-detected if omitted)
 * @returns ExtensionIntegrityResult
 */
export async function verifyExtensionIntegrity(
  lockFilePath: string,
  extensionPath: string,
  platformKey?: string,
): Promise<ExtensionIntegrityResult> {
  const detectedPlatform = platformKey ?? detectPlatform();

  let lockContent: string;
  try {
    lockContent = await readFile(lockFilePath, 'utf-8');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Cannot read sqlite-vec lock file at ${lockFilePath}: ${errorMessage}`,
      platformKey: detectedPlatform,
    };
  }

  const entries = parseLockFile(lockContent);

  // If no entries could be parsed at all, the lock file is malformed
  if (entries.length === 0) {
    return {
      ok: false,
      message: `Malformed lock file at ${lockFilePath}: no valid entries found`,
      platformKey: detectedPlatform,
    };
  }

  // Find the entry matching our platform
  const entry = entries.find((e) => e.target === detectedPlatform);

  if (!entry) {
    return {
      ok: false,
      message: `No lock entry found for platform "${detectedPlatform}" in ${lockFilePath}`,
      platformKey: detectedPlatform,
    };
  }

  const result = await verifyFileHash(extensionPath, entry.sha256);

  return {
    ...result,
    platformKey: detectedPlatform,
  };
}
