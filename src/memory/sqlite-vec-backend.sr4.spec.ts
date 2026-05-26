/**
 * SR4 wiring tests — sqlite-vec extension SHA-256 verification.
 *
 * Spec:  /docs/specs/agent-memory.md
 * ADR:   /docs/adr/0003-sqlite-vec-memory-backend.md §Security requirements (SR4)
 * Issue: #47 — wire SR3/SR4/SR5 security controls into production paths
 *
 * Acceptance criteria covered:
 *   - SR4: tampered extension binary → `SqliteVecBackend.create()` rejects
 *     with `MemoryBackendIntegrityError` BEFORE any `load_extension` call.
 *   - SR4: no lockfile entry for current platform → rejects.
 *   - SR4 (security rec #3): NO sidecar leak on failure — no `.db`,
 *     `.db-wal`, or `.db-shm` files linger after the failure path.
 *   - SR4: `extensionPath` provided without `extensionLockPath` → rejects
 *     with `MemoryBackendIntegrityError` (fail-closed).
 *   - C10: no partial state on rejection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  unlinkSync, existsSync, writeFileSync, mkdtempSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import {
  SqliteVecBackend,
  MemoryBackendIntegrityError,
} from './sqlite-vec-backend.js';
import { detectPlatform, IntegrityVerificationError } from './integrity-verifier.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function tempDbPath(): string {
  return join(tmpdir(), `sr4-test-${randomUUID()}.db`);
}

function assertNoSidecars(dbPath: string): void {
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    expect(existsSync(p), `sidecar ${p} should NOT exist after fail-closed SR4`).toBe(false);
  }
}

function cleanupDb(dbPath: string): void {
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
  }
}

/**
 * Write a fake extension binary and a matching/mismatching lockfile in a
 * fresh temp dir. Returns the paths.
 */
function makeExtensionFixture(opts: {
  /** When set, writes a lockfile whose SHA does NOT match the binary. */
  tamper?: boolean;
  /** When set, writes a lockfile for a different platform. */
  wrongPlatform?: boolean;
  /** When set, writes a lockfile with no entries at all. */
  empty?: boolean;
}): { extensionPath: string; lockPath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sr4-fixture-'));
  const extensionPath = join(dir, 'sqlite-vec.dylib');
  const lockPath = join(dir, 'sqlite-vec.lock');

  const binaryContent = 'fake extension binary bytes';
  writeFileSync(extensionPath, binaryContent, 'utf-8');

  const actualSha = createHash('sha256').update(binaryContent).digest('hex');
  const platform = detectPlatform();

  let lockContent: string;
  if (opts.empty) {
    lockContent = '# empty lock file\n';
  } else if (opts.wrongPlatform) {
    lockContent = `${actualSha}  some-other-platform-99\n`;
  } else if (opts.tamper) {
    lockContent = `${'0'.repeat(64)}  ${platform}\n`;
  } else {
    lockContent = `${actualSha}  ${platform}\n`;
  }

  writeFileSync(lockPath, lockContent, 'utf-8');
  return { extensionPath, lockPath, dir };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('SqliteVecBackend SR4 — sqlite-vec extension integrity', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  describe('fail-closed (C10) — verification BEFORE load_extension', () => {
    it('rejects with MemoryBackendIntegrityError when extensionPath is provided without extensionLockPath', async () => {
      const { extensionPath } = makeExtensionFixture({});
      await expect(
        SqliteVecBackend.create(dbPath, { extensionPath }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
    });

    it('rejects with MemoryBackendIntegrityError on tampered extension binary (SHA mismatch)', async () => {
      const { extensionPath, lockPath } = makeExtensionFixture({ tamper: true });
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: lockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
    });

    it('rejects when no lockfile entry exists for the current platform', async () => {
      const { extensionPath, lockPath } = makeExtensionFixture({ wrongPlatform: true });
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: lockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
    });

    it('rejects when the lockfile is empty / malformed', async () => {
      const { extensionPath, lockPath } = makeExtensionFixture({ empty: true });
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: lockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
    });

    it('rejects when the lockfile path does not exist on disk', async () => {
      const { extensionPath } = makeExtensionFixture({});
      const missingLockPath = join(tmpdir(), `sr4-missing-${randomUUID()}.lock`);
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: missingLockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
    });

    it('thrown error is a subclass of IntegrityVerificationError (catchable as either)', async () => {
      const { extensionPath, lockPath } = makeExtensionFixture({ tamper: true });
      let caught: unknown = null;
      try {
        await SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: lockPath,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(MemoryBackendIntegrityError);
      expect(caught).toBeInstanceOf(IntegrityVerificationError);
    });
  });

  // ── Security recommendation #3 — no sidecar leak ─────────────────────

  describe('no sidecar leak after rejection (security rec #3)', () => {
    it('does NOT create .db / .db-wal / .db-shm when extensionLockPath is missing', async () => {
      const { extensionPath } = makeExtensionFixture({});
      await expect(
        SqliteVecBackend.create(dbPath, { extensionPath }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
      assertNoSidecars(dbPath);
    });

    it('does NOT create .db / .db-wal / .db-shm on tampered binary', async () => {
      const { extensionPath, lockPath } = makeExtensionFixture({ tamper: true });
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: lockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
      assertNoSidecars(dbPath);
    });

    it('does NOT create .db / .db-wal / .db-shm when no lockfile entry matches the platform', async () => {
      const { extensionPath, lockPath } = makeExtensionFixture({ wrongPlatform: true });
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: lockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
      assertNoSidecars(dbPath);
    });

    it('does NOT create .db / .db-wal / .db-shm when the lockfile path is missing on disk', async () => {
      const { extensionPath } = makeExtensionFixture({});
      const missingLockPath = join(tmpdir(), `sr4-missing-${randomUUID()}.lock`);
      await expect(
        SqliteVecBackend.create(dbPath, {
          extensionPath,
          extensionLockPath: missingLockPath,
        }),
      ).rejects.toThrow(MemoryBackendIntegrityError);
      assertNoSidecars(dbPath);
    });
  });

  // ── Happy path: no extension requested (degraded mode) ────────────────

  describe('no extension requested (degraded mode)', () => {
    it('SqliteVecBackend.create() without extensionPath succeeds with vec0Available=false', async () => {
      const backend = await SqliteVecBackend.create(dbPath);
      try {
        expect(backend.vec0Available).toBe(false);
        // Schema is initialized — entries table exists
        const row = backend.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='entries'",
        ).get() as { name: string } | undefined;
        expect(row?.name).toBe('entries');
      } finally {
        backend.close();
      }
    });
  });
});
