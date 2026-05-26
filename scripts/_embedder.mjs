#!/usr/bin/env node

/**
 * _embedder.mjs — Standalone embedder factory for memory scripts
 *
 * Wraps @xenova/transformers for use by memory-{gc,import}.mjs scripts.
 * Mirrors the Embedder interface in src/memory/embedder.ts but is a
 * standalone .mjs adapter (the TypeScript embedder cannot be imported
 * directly from .mjs without a TS loader).
 *
 * Per ADR-0003 §Reliability "Embedder load failure": if @xenova/transformers
 * is not installed or the model cannot be loaded, this factory THROWS.
 * Callers (e.g. memory-gc.mjs phase5OrphanRepair) MUST catch and degrade
 * to lexical-only mode — never crash the entire script.
 *
 * SR3 (ADR-0003 §Security requirements, threat T-06): when an
 * `embeddings.lock` path is configured, the factory verifies the cached
 * ONNX file's SHA-256 against the lockfile after `pipeline()` resolves
 * and BEFORE the returned `embed()` is reachable. On mismatch the pipe
 * reference is dropped, the cached ONNX file is unlinked best-effort,
 * and `IntegrityVerificationError` is thrown — no embedder weights stay
 * loaded and no caller can call `embed()` (the factory never resolves).
 *
 * Exported API:
 *   createEmbedder(embedderConfig, opts?) → Promise<Embedder>
 *     where Embedder = {
 *       modelId: string,
 *       dim: number,
 *       embed(texts: string[]) → Promise<Float32Array[]>
 *     }
 *
 *   embedderConfig fields consumed:
 *     model, dim, quantization, lockfile (or _resolvedLockfile), onnxPath
 *
 *   opts._transformers (test-only): inject a transformers shim to bypass
 *     the dynamic `@xenova/transformers` import. Production callers MUST
 *     NOT pass this.
 *
 * See: docs/runbooks/memory-embedder-load-failure.md
 */

import { unlink } from "node:fs/promises";
import {
  verifyEmbedderIntegrity,
  IntegrityVerificationError,
} from "./_integrity-verifier.mjs";

export async function createEmbedder(embedderConfig, opts = {}) {
  // Test-only escape hatch — production must NOT pass _transformers.
  let transformers = opts._transformers;
  if (!transformers) {
    try {
      transformers = await import("@xenova/transformers");
    } catch (err) {
      throw new Error(
        `@xenova/transformers not installed: ${err.message}. ` +
        "Embedder unavailable; orphan-repair will degrade to lexical-only mode."
      );
    }
  }

  const modelId = embedderConfig?.model ?? "Xenova/all-MiniLM-L6-v2";
  const dim = embedderConfig?.dim ?? 384;
  const quantization = embedderConfig?.quantization ?? "fp32";
  // SR3 lockfile — resolved by _config.mjs into `_resolvedLockfile`.
  const lockfile =
    embedderConfig?._resolvedLockfile ?? embedderConfig?.lockfile ?? null;
  // Test-only ONNX path override. When omitted, derive from the
  // transformers cache.
  const onnxPathOverride = embedderConfig?.onnxPath ?? null;

  let pipe;
  try {
    pipe = await transformers.pipeline("feature-extraction", modelId, {
      quantized: quantization === "q8" || quantization === "q4",
    });
  } catch (err) {
    throw new Error(
      `Failed to load embedder model "${modelId}" (quantization=${quantization}): ${err.message}. ` +
      "Check network connectivity, model cache, and embeddings.lock SHA verification."
    );
  }

  // SR3: verify ONNX SHA-256 against the lockfile BEFORE returning the
  // embedder. Fail-closed (C10 — no partial state on rejection): drop
  // the pipe reference so V8 can GC the in-memory weights and unlink the
  // cached ONNX file best-effort so the next run cannot trust a stale
  // cache.
  if (lockfile) {
    const onnxPath =
      onnxPathOverride ??
      resolveCachedOnnxPath(transformers, modelId, quantization);
    const result = await verifyEmbedderIntegrity(lockfile, onnxPath);
    if (!result.ok) {
      pipe = null;
      try {
        await unlink(onnxPath);
      } catch {
        /* best-effort — cached file may not exist or be already removed */
      }
      throw new IntegrityVerificationError(
        `SR3: embedder ONNX SHA-256 verification failed: ${result.message}. ` +
        "No cached weights retained; factory threw before any embed() call.",
      );
    }
  }

  return {
    modelId,
    dim,
    async embed(texts) {
      if (!Array.isArray(texts) || texts.length === 0) return [];
      const results = new Array(texts.length);
      for (let i = 0; i < texts.length; i++) {
        const out = await pipe(texts[i], { pooling: "mean", normalize: true });
        results[i] = new Float32Array(out.data);
      }
      return results;
    },
  };
}

/**
 * Derive the on-disk path of the cached ONNX model file from the
 * transformers cache directory, model id, and quantization. Mirrors the
 * HuggingFace cache layout used by @xenova/transformers and (later)
 * @huggingface/transformers.
 *
 * Path layout (transformers-js convention):
 *   <cacheDir>/models--<owner>--<name>/snapshots/<rev>/onnx/<file>
 *
 * Where <file> depends on quantization:
 *   fp32      → model.onnx
 *   fp16      → model_fp16.onnx
 *   q8/q4     → model_quantized.onnx
 *
 * @param {object} transformers  The resolved transformers module (or shim).
 * @param {string} modelId
 * @param {string} quantization
 * @returns {string}  Absolute path to the cached ONNX file.
 */
function resolveCachedOnnxPath(transformers, modelId, quantization) {
  const cacheDir =
    transformers?.env?.cacheDir ??
    `${process.env.HOME ?? "/tmp"}/.cache/huggingface/hub`;
  const slug = modelId.replace(/[^a-zA-Z0-9]/g, "--");
  let file;
  if (quantization === "fp16") {
    file = "model_fp16.onnx";
  } else if (quantization === "q8" || quantization === "q4") {
    file = "model_quantized.onnx";
  } else {
    file = "model.onnx";
  }
  return `${cacheDir}/models--${slug}/snapshots/latest/onnx/${file}`;
}
