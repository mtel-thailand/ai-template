/**
 * Embedder interface — generates vector embeddings from text.
 *
 * Per ADR-0003 §"Backend interface": the Embedder is a sibling interface
 * separated from MemoryBackend so that PgVector / Qdrant backends reuse
 * the same embedding path. Supply-chain boundary B3 in the threat model
 * narrows accordingly.
 */
export interface Embedder {
  /** Model identifier (e.g. "Xenova/all-MiniLM-L6-v2"). */
  readonly modelId: string;

  /** Output dimensionality (e.g. 384 for MiniLM-L6-v2). */
  readonly dim: number;

  /**
   * Embed one or more text strings into Float32Array vectors.
   *
   * Implementations must:
   * - Return arrays in the same order as `texts`.
   * - Never return a partial result — if any input fails, reject the
   *   entire batch.
   * - Be prepared for empty input (return empty array).
   */
  embed(texts: string[]): Promise<Float32Array[]>;
}
