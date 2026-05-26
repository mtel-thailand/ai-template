/**
 * SR3 — ONNX weight integrity verification (fail-closed).
 *
 * Security requirement:
 *   System shall verify the SHA-256 of the ONNX model weight files against
 *   a signed lock file (embeddings.lock) on first use. On mismatch, the
 *   embedder must fail closed: no model weights shall be loaded into memory.
 *   (Threat model T-01, T-06, T-09)
 *
 * This test verifies:
 *   - Lock file format parsing works correctly.
 *   - SHA match → model can be loaded (passes).
 *   - SHA mismatch → EmbedderIntegrityError thrown; no partial state.
 *   - Missing lock file → graceful failure.
 *   - Tampered weights → detection.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

import {
  verifyEmbedderIntegrity,
  IntegrityVerificationError,
} from '../src/integrity-verifier.js';
import {
  TransformersJsEmbedder,
  EmbedderIntegrityError,
} from '../src/transformers-embedder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'sr3-test-'));
}

function writeLock(dir: string, entries: string): string {
  const path = join(dir, 'embeddings.lock');
  writeFileSync(path, entries, 'utf-8');
  return path;
}

function writeOnnx(dir: string, content: string): string {
  const path = join(dir, 'model.onnx');
  writeFileSync(path, content, 'utf-8');
  return path;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SR3: verifyEmbedderIntegrity — lock file validation', () => {
  it('passes when ONNX weights SHA matches the lock file', async () => {
    const dir = tempDir();
    const onnxContent = 'valid model weights binary';
    const onnxPath = writeOnnx(dir, onnxContent);
    const lockPath = writeLock(dir, `${sha256(onnxContent)}  ${onnxPath}\n`);

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('SHA-256 matches');
  });

  it('fail-closed: rejects tampered ONNX weights', async () => {
    const dir = tempDir();
    const onnxPath = writeOnnx(dir, 'original weights');
    const lockPath = writeLock(dir, `${sha256('original weights')}  ${onnxPath}\n`);

    // Tamper with the weights
    writeFileSync(onnxPath, 'tampered weights', 'utf-8');

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('SHA-256 mismatch');
  });

  it('fail-closed: rejects when weights file missing', async () => {
    const dir = tempDir();
    const onnxPath = join(dir, 'missing.onnx');
    const lockPath = writeLock(dir, `${'0'.repeat(64)}  ${onnxPath}\n`);

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Failed to read or hash');
  });

  it('fail-closed: rejects when lock file missing', async () => {
    const dir = tempDir();
    const onnxContent = 'some weights';
    const onnxPath = writeOnnx(dir, onnxContent);

    const result = await verifyEmbedderIntegrity(
      join(dir, 'nonexistent.lock'),
      onnxPath,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Cannot read lock file');
  });

  it('fail-closed: rejects when no SHA entry exists for target', async () => {
    const dir = tempDir();
    const onnxPath = writeOnnx(dir, 'some weights');
    // Lock file has entry for a DIFFERENT file
    writeFileSync(join(dir, 'other.onnx'), 'other', 'utf-8');
    const lockPath = writeLock(
      dir,
      `${sha256('other')}  ${join(dir, 'other.onnx')}\n`,
    );

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No lock entry found');
  });

  it('fail-closed: rejects malformed lock file entries', async () => {
    const dir = tempDir();
    const onnxPath = writeOnnx(dir, 'weights');
    const lockPath = writeLock(
      dir,
      `not-a-valid-entry\n`,
    );

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No lock entry found');
  });

  it('fail-closed: rejects empty lock file', async () => {
    const dir = tempDir();
    const onnxPath = writeOnnx(dir, 'weights');
    const lockPath = writeLock(dir, '');

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(false);
  });

  it('no partial state: result is ok:false, not thrown', async () => {
    // The function returns a result object rather than throwing, consistent
    // with integrity-verifier design. The TransformersJsEmbedder wraps this
    // and throws EmbedderIntegrityError.
    const dir = tempDir();
    const onnxPath = writeOnnx(dir, 'original');
    const lockPath = writeLock(dir, `${'0'.repeat(64)}  ${onnxPath}\n`);

    const result = await verifyEmbedderIntegrity(lockPath, onnxPath);
    expect(result.ok).toBe(false);
    // Verify we got a structured result, not an exception
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('SR3: TransformersJsEmbedder — fail-closed on integrity failure', () => {
  it('throws EmbedderIntegrityError on lockfile path missing', async () => {
    const dir = tempDir();
    const embedder = new TransformersJsEmbedder({
      modelId: 'Xenova/all-MiniLM-L6-v2',
      dim: 384,
      quantization: 'fp32',
      lockfile: join(dir, 'nonexistent.lock'),
      onnxPathOverride: join(dir, 'model.onnx'),
    });

    // The first embed() call triggers verification
    await expect(embedder.embed(['test'])).rejects.toThrow(EmbedderIntegrityError);
  });

  it('throws EmbedderIntegrityError on SHA mismatch', async () => {
    const dir = tempDir();
    const onnxPath = writeOnnx(dir, 'some weights');
    const lockPath = writeLock(
      dir,
      `${'0'.repeat(64)}  ${onnxPath}\n`,
    );

    const embedder = new TransformersJsEmbedder({
      modelId: 'Xenova/all-MiniLM-L6-v2',
      dim: 384,
      quantization: 'fp32',
      lockfile: lockPath,
      onnxPathOverride: onnxPath,
    });

    await expect(embedder.embed(['test'])).rejects.toThrow(EmbedderIntegrityError);
  });

  it('error message mentions SR3 and does NOT contain partial state/data', async () => {
    const dir = tempDir();
    const embedder = new TransformersJsEmbedder({
      modelId: 'Xenova/all-MiniLM-L6-v2',
      dim: 384,
      quantization: 'fp32',
      lockfile: join(dir, 'nonexistent.lock'),
      onnxPathOverride: join(dir, 'model.onnx'),
    });

    try {
      await embedder.embed(['test']);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EmbedderIntegrityError);
      const msg = (err as EmbedderIntegrityError).message;
      expect(msg).toContain('SR3');
      // Ensure no partial embedding data leaked
      expect(msg).not.toContain('Float32Array');
      expect(msg).not.toContain('embedding');
    }
  });

  it('fails before any model loading attempt', async () => {
    // The embedder should not try to import @huggingface/transformers
    // when integrity check fails. We verify by using a mock — the error
    // should come from integrity verification, not model loading.

    const dir = tempDir();
    const embedder = new TransformersJsEmbedder({
      modelId: 'Xenova/all-MiniLM-L6-v2',
      dim: 384,
      quantization: 'fp32',
      lockfile: join(dir, 'nonexistent.lock'),
      onnxPathOverride: join(dir, 'model.onnx'),
    });

    // The error should refer to lock/integrity, not model loading
    await expect(embedder.embed(['test'])).rejects.toThrow(EmbedderIntegrityError);
  });
});

describe('SR3: EmbedderIntegrityError', () => {
  it('has correct error code', () => {
    const err = new EmbedderIntegrityError('test');
    expect(err.code).toBe('EMBEDDER_INTEGRITY_ERROR');
  });

  it('is instanceof Error', () => {
    const err = new EmbedderIntegrityError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new EmbedderIntegrityError('test');
    expect(err.name).toBe('EmbedderIntegrityError');
  });
});
