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
 * Exported API:
 *   createEmbedder(embedderConfig) → Promise<Embedder>
 *     where Embedder = {
 *       modelId: string,
 *       dim: number,
 *       embed(texts: string[]) → Promise<Float32Array[]>
 *     }
 *
 * See: docs/runbooks/memory-embedder-load-failure.md
 */

export async function createEmbedder(embedderConfig) {
  let transformers;
  try {
    transformers = await import("@xenova/transformers");
  } catch (err) {
    throw new Error(
      `@xenova/transformers not installed: ${err.message}. ` +
      "Embedder unavailable; orphan-repair will degrade to lexical-only mode."
    );
  }

  const modelId = embedderConfig?.model ?? "Xenova/all-MiniLM-L6-v2";
  const dim = embedderConfig?.dim ?? 384;
  const quantization = embedderConfig?.quantization ?? "fp32";

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
