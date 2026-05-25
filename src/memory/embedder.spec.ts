import { describe, it, expect } from 'vitest';
import type { Embedder } from './embedder.js';

describe('Embedder interface contract', () => {
  /**
   * A minimal test embedder to verify the interface contract.
   * Real implementations (TransformersJsEmbedder) must also satisfy these.
   */
  class TestEmbedder implements Embedder {
    readonly modelId = 'test-model';
    readonly dim = 384;

    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map(() => new Float32Array(this.dim));
    }
  }

  it('exposes a readonly modelId string', () => {
    const e = new TestEmbedder();
    expect(e.modelId).toBe('test-model');
    // Should be readonly — verify via type check (compiler ensures this)
  });

  it('exposes a readonly dim number', () => {
    const e = new TestEmbedder();
    expect(e.dim).toBe(384);
  });

  it('embed returns Float32Array for each input text', async () => {
    const e = new TestEmbedder();
    const result = await e.embed(['hello', 'world']);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0].length).toBe(384);
    expect(result[1]).toBeInstanceOf(Float32Array);
    expect(result[1].length).toBe(384);
  });

  it('embed returns empty array for empty input', async () => {
    const e = new TestEmbedder();
    const result = await e.embed([]);
    expect(result).toEqual([]);
  });

  it('embed maintains input order', async () => {
    class SeqEmbedder implements Embedder {
      readonly modelId = 'seq';
      readonly dim = 2;

      async embed(texts: string[]): Promise<Float32Array[]> {
        return texts.map((t) => {
          const arr = new Float32Array(2);
          arr[0] = t === 'first' ? 1 : 0;
          arr[1] = t === 'second' ? 1 : 0;
          return arr;
        });
      }
    }

    const e = new SeqEmbedder();
    const result = await e.embed(['first', 'second']);
    expect(result[0][0]).toBe(1);
    expect(result[1][1]).toBe(1);
  });

  it('embed rejects with error when implementation fails', async () => {
    class FailingEmbedder implements Embedder {
      readonly modelId = 'fail';
      readonly dim = 384;

      async embed(_texts: string[]): Promise<Float32Array[]> {
        throw new Error('Inference failure');
      }
    }

    const e = new FailingEmbedder();
    await expect(e.embed(['hello'])).rejects.toThrow('Inference failure');
  });

  it('embed never returns partial results on failure', async () => {
    class PartialFailEmbedder implements Embedder {
      readonly modelId = 'partial';
      readonly dim = 384;
      private callCount = 0;

      async embed(texts: string[]): Promise<Float32Array[]> {
        this.callCount++;
        // Fail on second call (simulates transient failure)
        if (this.callCount >= 2) {
          throw new Error('Model temporarily unavailable');
        }
        return texts.map(() => new Float32Array(this.dim));
      }
    }

    const e = new PartialFailEmbedder();
    // First call works
    const result = await e.embed(['ok']);
    expect(result).toHaveLength(1);

    // Second call fails entirely — no partial array
    await expect(e.embed(['fail'])).rejects.toThrow('Model temporarily unavailable');
  });
});
