/**
 * SR3 (scripts) wiring tests — embedder ONNX SHA-256 verification in
 * scripts/_embedder.mjs.
 *
 * Spec:  /docs/specs/agent-memory.md
 * ADR:   /docs/adr/0003-sqlite-vec-memory-backend.md §Security requirements (SR3)
 * Issue: #47 — wire SR3/SR4/SR5 security controls into production paths
 *
 * Acceptance criteria covered:
 *   - SR3 (scripts): tampered ONNX (lockfile SHA ≠ file SHA) →
 *     `createEmbedder` throws `IntegrityVerificationError` on first use;
 *     cached ONNX file is unlinked best-effort.
 *   - SR3 (scripts): no lockfile entry for the cached ONNX filename →
 *     throws before the returned object is usable.
 *   - SR3 (scripts): lockfile path missing on disk → throws.
 *   - C10: no partial state on rejection — pipe reference dropped, no
 *     embed() reachable.
 *   - Happy path: valid lockfile + matching ONNX → factory resolves and
 *     `embed()` works against the injected pipeline shim.
 *
 * Test isolation: an in-test transformers shim is injected via the
 * `_transformers` opt so the test does not require @xenova/transformers
 * to be installed and does not download the real model.
 *
 * NB: file lives under tests/ (not scripts/) so vitest picks it up via
 * the existing tests-glob include in vitest.config.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, writeFileSync, existsSync, unlinkSync, rmSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

import {
  createEmbedder,
} from '../../scripts/_embedder.mjs';
import {
  IntegrityVerificationError,
} from '../../scripts/_integrity-verifier.mjs';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Fixture {
  dir: string;
  onnxPath: string;
  lockPath: string;
}

/**
 * Build a fake ONNX file + lockfile pair in a fresh temp dir.
 */
function makeFixture(opts: {
  /** Lockfile points at a hash that doesn't match the ONNX file. */
  tamper?: boolean;
  /** Lockfile has no entry for the ONNX filename. */
  missingEntry?: boolean;
  /** Lockfile path is not created on disk. */
  noLockfile?: boolean;
}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'sr3-scripts-'));
  const onnxPath = join(dir, 'model.onnx');
  const lockPath = join(dir, 'embeddings.lock');

  const bytes = 'fake ONNX bytes — SR3 test fixture';
  writeFileSync(onnxPath, bytes, 'utf-8');

  if (opts.noLockfile) {
    return { dir, onnxPath, lockPath };
  }

  const actualSha = createHash('sha256').update(bytes).digest('hex');
  let lockContent: string;
  if (opts.missingEntry) {
    lockContent = `${actualSha}  some-other-file.onnx\n`;
  } else if (opts.tamper) {
    lockContent = `${'0'.repeat(64)}  model.onnx\n`;
  } else {
    lockContent = `${actualSha}  model.onnx\n`;
  }
  writeFileSync(lockPath, lockContent, 'utf-8');
  return { dir, onnxPath, lockPath };
}

function cleanupFixture(fixture: Fixture): void {
  try { rmSync(fixture.dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * A test-only transformers shim. `pipeline()` returns a callable
 * that returns a deterministic embedding so we can assert `embed()`
 * works on the happy path.
 */
function makeTransformersStub() {
  const pipeFn = async (_text: string, _opts: unknown) => ({
    data: new Float32Array(384).fill(0.1),
  });
  return {
    pipeline: async (_task: string, _modelId: string, _opts: unknown) => pipeFn,
    env: { cacheDir: '/tmp/sr3-stub-cache' },
  };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('createEmbedder (scripts) — SR3 ONNX SHA-256 verification', () => {
  let fixture: Fixture;

  afterEach(() => {
    if (fixture) cleanupFixture(fixture);
  });

  describe('fail-closed (C10) — verification rejects before embed() is reachable', () => {
    it('throws IntegrityVerificationError when ONNX file SHA does not match the lockfile (tampered)', async () => {
      fixture = makeFixture({ tamper: true });
      await expect(
        createEmbedder(
          { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
          { _transformers: makeTransformersStub() },
        ),
      ).rejects.toThrow(IntegrityVerificationError);
    });

    it('throws IntegrityVerificationError when the lockfile has no entry for the ONNX filename', async () => {
      fixture = makeFixture({ missingEntry: true });
      await expect(
        createEmbedder(
          { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
          { _transformers: makeTransformersStub() },
        ),
      ).rejects.toThrow(IntegrityVerificationError);
    });

    it('throws IntegrityVerificationError when the lockfile path is missing on disk', async () => {
      fixture = makeFixture({ noLockfile: true });
      await expect(
        createEmbedder(
          { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
          { _transformers: makeTransformersStub() },
        ),
      ).rejects.toThrow(IntegrityVerificationError);
    });

    it('drops the in-memory pipe reference on verification failure (no cached weights leak)', async () => {
      fixture = makeFixture({ tamper: true });

      let pipeReleased = false;
      const stub = {
        pipeline: async (_task: string, _modelId: string, _opts: unknown) => {
          return async () => {
            pipeReleased = true; // would fire if embed() ever ran
            return { data: new Float32Array(384) };
          };
        },
        env: { cacheDir: '/tmp/sr3-stub-cache' },
      };

      await expect(
        createEmbedder(
          { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
          { _transformers: stub },
        ),
      ).rejects.toThrow(IntegrityVerificationError);

      // The factory never resolved, so its returned embedder is
      // unreachable; in turn the pipe is unreferenced and eligible for GC.
      // We can only assert behaviour: embed() was never invoked.
      expect(pipeReleased).toBe(false);
    });

    it('unlinks the cached ONNX file best-effort on tamper (no stale-cache trust)', async () => {
      fixture = makeFixture({ tamper: true });
      expect(existsSync(fixture.onnxPath)).toBe(true);

      await expect(
        createEmbedder(
          { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
          { _transformers: makeTransformersStub() },
        ),
      ).rejects.toThrow(IntegrityVerificationError);

      // The unlink is best-effort — if it succeeded, the file is gone;
      // either way, the factory threw (the security-critical guarantee).
      expect(existsSync(fixture.onnxPath)).toBe(false);
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────

  describe('happy path — valid lockfile resolves the factory', () => {
    it('returns an embedder that embed()s text into a Float32Array', async () => {
      fixture = makeFixture({});
      const embedder = await createEmbedder(
        { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
        { _transformers: makeTransformersStub() },
      );
      expect(embedder.modelId).toBe('Xenova/all-MiniLM-L6-v2');
      expect(embedder.dim).toBe(384);
      const vecs = await embedder.embed(['hello world']);
      expect(vecs.length).toBe(1);
      expect(vecs[0]).toBeInstanceOf(Float32Array);
      expect(vecs[0].length).toBe(384);
    });

    it('embed([]) returns an empty array without invoking the pipeline', async () => {
      fixture = makeFixture({});
      const embedder = await createEmbedder(
        { lockfile: fixture.lockPath, onnxPath: fixture.onnxPath },
        { _transformers: makeTransformersStub() },
      );
      const vecs = await embedder.embed([]);
      expect(vecs).toEqual([]);
    });
  });

  // ── Backward-compat: no lockfile configured — pre-SR3 behaviour ──────

  describe('no lockfile configured — verification is skipped (pre-SR3 behaviour)', () => {
    it('resolves without verifying when embedderConfig has no lockfile field', async () => {
      // SR3 is opt-in by config: callers that do not configure a lockfile
      // continue to get the pre-#37 behaviour. This documents the
      // backward-compat contract.
      const embedder = await createEmbedder(
        { /* no lockfile */ },
        { _transformers: makeTransformersStub() },
      );
      expect(embedder.modelId).toBe('Xenova/all-MiniLM-L6-v2');
      const vecs = await embedder.embed(['x']);
      expect(vecs.length).toBe(1);
    });
  });
});
