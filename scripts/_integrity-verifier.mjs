#!/usr/bin/env node

/**
 * _integrity-verifier.mjs — Scripts-side port of memory/src/integrity-verifier.ts
 *
 * The .mjs scripts (memory-{gc,export,import}.mjs and their embedder
 * factory) cannot import the .ts module at runtime without a TS loader,
 * so this file mirrors the canonical lock-file parser, SHA-256 file
 * hasher, and `verifyEmbedderIntegrity` helper. Keep it in sync with
 * `memory/src/integrity-verifier.ts`.
 *
 * Per ADR-0003 §"Security requirements" (SR3) and threat T-06:
 *   `embeddings.lock` holds SHA-256 of ONNX files. First-use verification
 *   is fail-closed: on mismatch, no embedder weights stay loaded and the
 *   cached ONNX file is unlinked best-effort so subsequent attempts
 *   cannot trust a stale cache.
 *
 * Lock-file format:
 *   <sha256hex>  <filename/detector>
 * One entry per line. Lines starting with `#` are comments; blank lines
 * are ignored.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Error thrown when integrity verification fails. Callers MUST NOT
 * proceed with any operation that depends on the verified artifact.
 */
export class IntegrityVerificationError extends Error {
  constructor(message, entry) {
    super(message);
    this.name = "IntegrityVerificationError";
    this.code = "INTEGRITY_VERIFICATION_ERROR";
    this.entry = entry;
  }
}

/**
 * Parse a lock file into `{ sha256, target }` entries. Comments and
 * blank lines are stripped.
 *
 * @param {string} content  Raw text content of the lock file.
 * @returns {{sha256: string, target: string}[]}
 */
export function parseLockFile(content) {
  const entries = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const sha256 = parts[0];
    const target = parts.slice(1).join(" ");
    entries.push({ sha256, target });
  }
  return entries;
}

/**
 * Compute the hex-encoded SHA-256 of a file.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Verify a file's SHA-256 against an expected hex hash.
 *
 * @param {string} filePath
 * @param {string} expectedSha
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function verifyFileHash(filePath, expectedSha) {
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
    return {
      ok: false,
      message: `Failed to read or hash ${filePath}: ${err.message}`,
    };
  }
}

/**
 * Verify an ONNX embedder binary against `embeddings.lock` (SR3).
 *
 * Fail-closed semantics: on a non-ok result the caller MUST NOT keep any
 * embedder weights in memory and SHOULD unlink the cached ONNX file so
 * subsequent attempts cannot trust a stale cache.
 *
 * @param {string} lockFilePath  Path to `embeddings.lock`.
 * @param {string} onnxFilePath  Path to the ONNX model binary on disk.
 * @returns {Promise<{ ok: boolean, message: string, expectedSha: string|null }>}
 */
export async function verifyEmbedderIntegrity(lockFilePath, onnxFilePath) {
  let lockContent;
  try {
    lockContent = await readFile(lockFilePath, "utf-8");
  } catch (err) {
    return {
      ok: false,
      message: `Cannot read lock file at ${lockFilePath}: ${err.message}`,
      expectedSha: null,
    };
  }

  const entries = parseLockFile(lockContent);
  const fileName = onnxFilePath.split("/").pop() ?? onnxFilePath;
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
  return { ...result, expectedSha: entry.sha256 };
}
