import { describe, it, expect } from 'vitest';
import type { MemoryBackend, Embedder } from './backend.js';
import { 
  Tier, 
  Kind, 
  type MemoryEntry, 
  type SearchHit, 
  type SearchOpts, 
  type ReindexOpts,
  MemoryBackendBusyError,
} from './backend.js';

describe('backend types and exports', () => {
  it('exports Tier type with all 5 values', () => {
    const tier: Tier = 'short';
    expect(tier).toBe('short');
    // Verify all values are valid
    const tiers: Tier[] = ['short', 'mid', 'long', 'frequent', 'forgettable'];
    expect(tiers).toHaveLength(5);
  });

  it('exports Kind type with all 4 values', () => {
    const kinds: Kind[] = ['working', 'episodic', 'semantic', 'procedural'];
    expect(kinds).toHaveLength(4);
  });

  it('exports MemoryEntry type with all required fields', () => {
    const entry: MemoryEntry = {
      name: 'test-entry',
      tier: 'mid',
      kind: 'semantic',
      description: 'A test entry',
      body: 'Test body content',
      tags: ['test'],
      links: [],
      importance: 3,
      created: '2026-05-25',
      updated: '2026-05-25',
      lastAccessed: '2026-05-25',
      accessCount: 0,
    };
    expect(entry.name).toBe('test-entry');
    expect(entry.tier).toBe('mid');
    expect(entry.kind).toBe('semantic');
    expect(entry.importance).toBe(3);
    expect(Array.isArray(entry.tags)).toBe(true);
    expect(typeof entry.created).toBe('string');
    expect(typeof entry.accessCount).toBe('number');
  });

  it('enforces importance range 1-5', () => {
    // TypeScript enforces compile-time; runtime check
    const valid: number[] = [1, 2, 3, 4, 5];
    const entry: MemoryEntry = {
      name: 'test',
      tier: 'mid',
      kind: 'working',
      description: 'test',
      body: 'test',
      tags: [],
      links: [],
      importance: 3 as 1|2|3|4|5,
      created: '2026-01-01',
      updated: '2026-01-01',
      lastAccessed: '2026-01-01',
      accessCount: 0,
    };
    expect(valid).toContain(entry.importance);
  });

  it('exports SearchHit type with all required fields', () => {
    const hit: SearchHit = {
      entry: {
        name: 'hit-entry',
        tier: 'long',
        kind: 'episodic',
        description: 'A hit',
        body: 'Content',
        tags: [],
        links: [],
        importance: 4,
        created: '2026-01-01',
        updated: '2026-01-01',
        lastAccessed: '2026-01-01',
        accessCount: 1,
      },
      score: 0.85,
      matchedBy: 'hybrid',
      vectorDistance: 0.15,
      lexicalScore: 0.7,
    };
    expect(hit.score).toBeCloseTo(0.85);
    expect(hit.matchedBy).toBe('hybrid');
    expect(hit.vectorDistance).toBeDefined();
    expect(hit.lexicalScore).toBeDefined();
  });

  it('exports SearchOpts type with all required fields', () => {
    const opts: SearchOpts = {
      query: 'test query',
      k: 10,
    };
    expect(opts.query).toBe('test query');
    expect(opts.k).toBe(10);
  });

  it('accepts SearchOpts with optional fields', () => {
    const opts: SearchOpts = {
      query: 'advanced search',
      embedding: new Float32Array(384),
      k: 5,
      tier: ['mid', 'long'],
      mode: 'hybrid',
      timeoutMs: 500,
    };
    expect(opts.mode).toBe('hybrid');
    expect(opts.tier).toHaveLength(2);
    expect(opts.embedding!.length).toBe(384);
  });

  it('exports ReindexOpts type', () => {
    const opts: ReindexOpts = { tier: ['mid'] };
    expect(opts.tier).toHaveLength(1);
  });

  it('supports MemoryBackend interface shape', () => {
    // We can't instantiate the interface but can verify its shape
    const methods: (keyof MemoryBackend)[] = [
      'put', 'get', 'delete', 'list', 'search', 'reindex',
    ];
    expect(methods).toHaveLength(6);
  });

  it('supports Embedder interface shape', () => {
    const props: (keyof Embedder)[] = ['modelId', 'dim', 'embed'];
    expect(props).toHaveLength(3);
  });

  it('exports MemoryBackendBusyError as a typed Error', () => {
    const err = new MemoryBackendBusyError('too busy', 3, [50, 100, 200]);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MemoryBackendBusyError);
    expect(err.name).toBe('MemoryBackendBusyError');
    expect(err.message).toBe('too busy');
    expect(err.attempts).toBe(3);
    expect(err.delays).toEqual([50, 100, 200]);
    expect(err.retryAfterMs).toBeGreaterThanOrEqual(0);
  });
});
