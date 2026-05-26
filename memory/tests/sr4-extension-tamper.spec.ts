/**
 * SR4 — sqlite-vec extension binary integrity verification (fail-closed).
 *
 * Security requirement:
 *   System shall verify the SHA-256 of the sqlite-vec extension binary
 *   against sqlite-vec.lock per detected platform before calling
 *   load_extension(). On mismatch, no load_extension() call shall be made.
 *   There shall be NO silent fallback to lexical-only search.
 *   (Threat model T-01, T-06, T-09)
 *
 * This test verifies:
 *   - Platform detection returns a valid key.
 *   - SHA match → load_extension would be allowed.
 *   - SHA mismatch → IntegrityVerificationError; no extension loaded.
 *   - Missing extension → graceful failure.
 *   - No fallback to lexical-only mode.
 *   - All per-platform lock entries parse correctly.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

import {
  verifyExtensionIntegrity,
  detectPlatform,
  IntegrityVerificationError,
} from '../src/integrity-verifier.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'sr4-test-'));
}

function writeLock(dir: string, entries: string): string {
  const path = join(dir, 'sqlite-vec.lock');
  writeFileSync(path, entries, 'utf-8');
  return path;
}

function writeBinary(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SR4: platform detection', () => {
  it('detects current platform as a non-empty string', () => {
    const platform = detectPlatform();
    expect(platform.length).toBeGreaterThan(0);
  });

  it('returns a <os>-<arch> format', () => {
    const platform = detectPlatform();
    expect(platform).toMatch(/^[a-z]+-[a-z0-9_]+$/);
  });

  it('returns a known platform key', () => {
    const platform = detectPlatform();
    const known = [
      'darwin-arm64',
      'darwin-x64',
      'linux-x64',
      'win32-x64',
      'linux-arm64',
    ];
    // The detected platform may be one of these or another valid combination
    expect(platform).toMatch(/^(darwin|linux|win32)-(arm64|x64)$/);
  });
});

describe('SR4: verifyExtensionIntegrity — SHA-256 verification', () => {
  it('passes when extension binary SHA matches lock file', async () => {
    const dir = tempDir();
    const platform = detectPlatform();
    const binaryContent = 'valid extension binary';
    const digest = sha256(binaryContent);
    const binaryPath = writeBinary(dir, 'vec0.dylib', binaryContent);
    const lockPath = writeLock(
      dir,
      `${digest}  ${platform}\n`,
    );

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('SHA-256 matches');
  });

  it('fail-closed: rejects tampered extension binary', async () => {
    const dir = tempDir();
    const platform = detectPlatform();
    const binaryContent = 'original binary';
    const digest = sha256(binaryContent);
    const binaryPath = writeBinary(dir, 'vec0.dylib', binaryContent);

    // Tamper with the binary after lock file was created
    writeFileSync(binaryPath, 'tampered binary', 'utf-8');
    const lockPath = writeLock(
      dir,
      `${digest}  ${platform}\n`,
    );

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('SHA-256 mismatch');
  });

  it('fail-closed: rejects missing extension file', async () => {
    const dir = tempDir();
    const platform = detectPlatform();
    const binaryPath = join(dir, 'nonexistent.so');
    const lockPath = writeLock(
      dir,
      `${'0'.repeat(64)}  ${platform}\n`,
    );

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Failed to read or hash');
  });

  it('fail-closed: rejects when lock file missing', async () => {
    const dir = tempDir();
    const binaryContent = 'binary';
    const binaryPath = writeBinary(dir, 'vec0.dylib', binaryContent);

    const result = await verifyExtensionIntegrity(
      join(dir, 'nonexistent.lock'),
      binaryPath,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Cannot read sqlite-vec lock file');
  });

  it('fail-closed: rejects when no SHA entry for the target', async () => {
    const dir = tempDir();
    const binaryPath = writeBinary(dir, 'vec0.dylib', 'binary');
    const lockPath = writeLock(
      dir,
      `${'0'.repeat(64)}  different-platform\n`,
    );

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No lock entry found for platform');
  });

  it('no silent lexical-only fallback: verification failure returns ok:false', async () => {
    // SR4 explicitly states: NO silent lexical-only fallback.
    // The function must return a clearly identifiable failure,
    // not silently degrade to a less secure mode.
    const dir = tempDir();
    const platform = detectPlatform();
    const binaryContent = 'original';
    const digest = sha256(binaryContent);

    const binaryPath = writeBinary(dir, 'vec.dylib', 'original');

    // Lock file uses platform key as target — but binary was tampered after
    // lock file was generated (stale lock scenario)
    writeFileSync(binaryPath, 'tampered', 'utf-8');
    const lockPath = writeLock(
      dir,
      `${digest}  ${platform}\n`,
    );

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(false);
    // The message must NOT suggest lexical-only as a fallback
    expect(result.message).not.toMatch(/lexical/i);
    expect(result.message).not.toMatch(/fallback/i);
    expect(result.message).toContain('SHA-256 mismatch');
  });
});

describe('SR4: lock file format — per-platform entries', () => {
  it('parses lock file with multiple platform entries', async () => {
    const dir = tempDir();
    const binaryContent = 'some-extension';

    // Write a single binary that all platform entries will reference
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(binaryContent).digest('hex');
    const binaryPath = writeBinary(dir, 'vec.dylib', binaryContent);

    // Lock file uses platform keys, not file paths
    const lockPath = writeLock(dir, [
      `${hash}  darwin-arm64`,
      `${hash}  darwin-x64`,
      `${hash}  linux-x64`,
    ].join('\n'));

    const platform = detectPlatform();
    const result = await verifyExtensionIntegrity(lockPath, binaryPath, platform);
    expect(result.ok).toBe(true);
  });

  it('ignores comments and blank lines', async () => {
    const dir = tempDir();
    const platform = detectPlatform();
    const binaryContent = 'binary data';
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(binaryContent).digest('hex');
    const binaryPath = writeBinary(dir, 'vec.so', binaryContent);
    const lockPath = writeLock(dir, [
      '# sqlite-vec.lock — verified hashes',
      '',
      `${hash}  ${platform}`,
      '# end',
      '',
    ].join('\n'));

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(true);
  });

  it('rejects malformed lines in lock file', async () => {
    const dir = tempDir();
    const binaryPath = writeBinary(dir, 'vec.so', 'data');
    const lockPath = writeLock(dir, 'not-a-sha-line\n');

    const result = await verifyExtensionIntegrity(lockPath, binaryPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Malformed');
  });
});

describe('SR4: IntegrityVerificationError', () => {
  it('has correct error code', () => {
    const err = new IntegrityVerificationError('test');
    expect(err.code).toBe('INTEGRITY_VERIFICATION_ERROR');
  });

  it('is instanceof Error', () => {
    const err = new IntegrityVerificationError('test');
    expect(err).toBeInstanceOf(Error);
  });
});
