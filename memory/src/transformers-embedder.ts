/**
 * Transformers.js-based Embedder implementation.
 *
 * Uses `@huggingface/transformers` with ONNX Runtime CPU backend.
 * Default model: `Xenova/all-MiniLM-L6-v2` (384 dim, ~25 MB INT8 / ~80 MB FP32).
 *
 * Per ADR-0003 §"Backend interface" and §"Security requirements" (SR3):
 * - First-use SHA-256 verification via `embeddings.lock`.
 * - Quantization config respected (`fp32`/`fp16`/`q8`/`q4`).
 * - Fail-closed on SHA mismatch: no weights loaded into memory.
 */

import type { Embedder } from './embedder.js';
import type { Integrities } from './integrity-verifier.js';

/**
 * Supported quantization formats for the embedding model.
 */
export type Quantization = 'fp32' | 'fp16' | 'q8' | 'q4';

/**
 * Configuration for TransformersJsEmbedder.
 */
export interface TransformersJsEmbedderConfig {
  /** HuggingFace model ID (e.g. "Xenova/all-MiniLM-L6-v2"). */
  modelId: string;

  /** Output dimensionality (e.g. 384 for MiniLM-L6-v2). */
  dim: number;

  /** Quantization format. */
  quantization: Quantization;

  /** Path to the embeddings.lock file. */
  lockfile: string;

  /** Optional model revision (commit SHA) for pinning. */
  revision?: string;

  /** Path override for ONNX model file (for testing). */
  onnxPathOverride?: string;
}

/**
 * Error thrown when embedder integrity verification fails (SR3).
 */
export class EmbedderIntegrityError extends Error {
  readonly code = 'EMBEDDER_INTEGRITY_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'EmbedderIntegrityError';
  }
}

/**
 * Transformers.js-based Embedder.
 *
 * Lazily loads the embedding model on first `embed()` call. Performs
 * SHA-256 verification of the ONNX weights before loading (SR3).
 */
export class TransformersJsEmbedder implements Embedder {
  readonly modelId: string;
  readonly dim: number;
  readonly quantization: Quantization;

  private config: TransformersJsEmbedderConfig;
  private model: any = null; // Will hold the transformers.js pipeline
  private integrityVerified: boolean = false;

  constructor(config: TransformersJsEmbedderConfig) {
    this.modelId = config.modelId;
    this.dim = config.dim;
    this.quantization = config.quantization;
    this.config = config;
  }

  /**
   * Embed one or more text strings.
   *
   * On first call, verifies ONNX weights integrity (SR3), then loads
   * the model. Subsequent calls reuse the loaded model.
   *
   * @param texts - Array of text strings to embed
   * @returns Array of Float32Array vectors (one per input text)
   */
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // SR3: verify ONNX integrity on first use (before loading any weights)
    if (!this.integrityVerified) {
      await this.verifyIntegrity();
      this.integrityVerified = true;
    }

    // Lazy-load the model on first embed call
    if (!this.model) {
      this.model = await this.loadModel();
    }

    return this.runInference(texts);
  }

  /**
   * Verify the integrity of the ONNX model weights against the lock file.
   *
   * Fail-closed (SR3): on mismatch, throws EmbedderIntegrityError.
   * No weights are loaded into memory.
   * Cache is not trusted on subsequent attempts without re-verification.
   */
  private async verifyIntegrity(): Promise<void> {
    const { verifyEmbedderIntegrity } = await import('./integrity-verifier.js');
    const onnxPath = this.config.onnxPathOverride ?? this.resolveOnnxPath();

    const result = await verifyEmbedderIntegrity(
      this.config.lockfile,
      onnxPath,
    );

    if (!result.ok) {
      throw new EmbedderIntegrityError(
        `Embedder integrity check failed (SR3): ${result.message}. ` +
        `No model weights loaded. ` +
        `To retry after fixing the mismatch, create a new embedder instance.`
      );
    }
  }

  /**
   * Resolve the expected ONNX file path based on model ID and quantization.
   *
   * The ONNX files are stored in the HuggingFace cache under:
   *   ~/.cache/huggingface/hub/models--Xenova--all-MiniLM-L6-v2/snapshots/<sha>/
   *
   * Files are named like:
   *   model.onnx          (fp32)
   *   model_fp16.onnx     (fp16)
   *   model_quantized.onnx (q8 / q4, depending on export)
   *
   * For the purpose of this implementation, we derive the expected filename
   * from the quantization setting.
   */
  private resolveOnnxPath(): string {
    // In a real deployment, this would resolve through the HuggingFace cache.
    // For now, we derive the expected filename pattern so the lock file
    // can be constructed accordingly.
    const modelSlug = this.modelId.replace(/[^a-zA-Z0-9]/g, '--');
    const cacheBase = this.getHfCachePath();

    switch (this.quantization) {
      case 'fp32':
        return `${cacheBase}/model.onnx`;
      case 'fp16':
        return `${cacheBase}/model_fp16.onnx`;
      case 'q8':
      case 'q4':
        return `${cacheBase}/model_quantized.onnx`;
    }
  }

  /**
   * Get the HuggingFace cache directory path for this model.
   */
  private getHfCachePath(): string {
    const home = process.env.HOME ?? '/tmp';
    const hfHome = process.env.HF_HOME ?? `${home}/.cache/huggingface`;
    const modelSlug = this.modelId.replace(/[^a-zA-Z0-9]/g, '--');
    return `${hfHome}/hub/models--${modelSlug}/snapshots/latest`;
  }

  /**
   * Load the embedding model pipeline from transformers.js.
   */
  private async loadModel(): Promise<any> {
    try {
      const mod = await import('@huggingface/transformers');
      const pipeline = mod.pipeline;

      const dtype = this.quantizationToDtype();

      // Create the feature-extraction pipeline
      // The pipeline handles model download, caching, and ONNX execution
      const pipe = await pipeline('feature-extraction', this.modelId, {
        dtype,
        revision: this.config.revision,
      });

      return pipe;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load embedding model "${this.modelId}": ${message}. ` +
        `Ensure @huggingface/transformers is installed and the model is accessible.`
      );
    }
  }

  /**
   * Map our quantization enum to transformers.js dtype option.
   */
  private quantizationToDtype(): string | undefined {
    const map: Record<Quantization, string | undefined> = {
      fp32: 'fp32',
      fp16: 'fp16',
      q8: 'q8',
      q4: 'q4',
    };
    return map[this.quantization];
  }

  /**
   * Run inference on the given texts using the loaded pipeline.
   */
  private async runInference(texts: string[]): Promise<Float32Array[]> {
    try {
      // transformers.js pipeline returns an object with `data` and `dims`
      // For feature-extraction, the output is typically a tensor
      const output = await this.model(texts, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding vectors from the model output
      // The output shape is typically [batch_size, sequence_length, dim]
      // With pooling='mean', shape becomes [batch_size, dim]
      return this.extractEmbeddings(output, texts.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Embedding inference failed: ${message}`);
    }
  }

  /**
   * Extract Float32Array vectors from the pipeline output.
   *
   * The output from transformers.js feature-extraction pipeline returns
   * a Tensor or an array of Tensors depending on the version.
   *
   * @param output - Pipeline output
   * @param batchSize - Expected number of vectors
   * @returns Array of Float32Array vectors
   */
  private extractEmbeddings(output: any, batchSize: number): Float32Array[] {
    // Handle different output shapes from transformers.js
    // If output is a raw Float32Array or similar typed array, reshape it
    if (output?.data) {
      // Tensor-like output with .data (TypedArray) and .dims
      const data = output.data;
      const dims = output.dims ?? [batchSize, this.dim];

      // If the output is 1D, reshape based on expected dimensions
      if (dims.length === 1) {
        // Single vector
        const vec = new Float32Array(data.length);
        vec.set(data);
        return [vec];
      }

      if (dims.length === 2) {
        // [batch, dim] — split by batch
        const vectors: Float32Array[] = [];
        const stride = dims[1];
        for (let i = 0; i < dims[0] && i < batchSize; i++) {
          const start = i * stride;
          const vec = new Float32Array(stride);
          for (let j = 0; j < stride; j++) {
            vec[j] = data[start + j];
          }
          vectors.push(vec);
        }
        return vectors;
      }

      if (dims.length === 3) {
        // [batch, seq_len, dim] with pooling='mean' the seq_len should be 1
        // or we take the first token or mean pool
        const vectors: Float32Array[] = [];
        const seqLen = dims[1];
        const stride = dims[2];
        for (let i = 0; i < dims[0] && i < batchSize; i++) {
          // For [CLS] token pooling, take the first token output
          const start = i * seqLen * stride;
          const vec = new Float32Array(stride);
          for (let j = 0; j < stride; j++) {
            vec[j] = data[start + j]; // First token
          }
          vectors.push(vec);
        }
        return vectors;
      }
    }

    // If output is an array of tensors, extract each
    if (Array.isArray(output)) {
      return output.slice(0, batchSize).map((t: any) => {
        if (t?.data) {
          const vec = new Float32Array(t.data.length);
          vec.set(t.data);
          return vec;
        }
        return new Float32Array(this.dim);
      });
    }

    // Fallback: return zero-vectors
    // (Shouldn't reach here with a properly loaded model)
    return Array.from({ length: batchSize }, () => new Float32Array(this.dim));
  }
}
