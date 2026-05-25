import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { SqliteVecBackend } from './sqlite-vec-backend.js';
import type { MemoryEntry, SearchOpts, Embedder } from './backend.js';
import { MemoryBackendInputError, DEFAULT_MEMORY_LIMITS } from './backend.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function testEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = new Date().toISOString();
  return {
    name: `test-${randomUUID().slice(0, 8)}`,
    tier: 'mid',
    kind: 'semantic',
    description: 'Test entry',
    body: 'This is a test memory entry body for search validation.',
    tags: ['test', 'vitest'],
    links: [],
    importance: 3,
    created: now,
    updated: now,
    lastAccessed: now,
    accessCount: 0,
    ...overrides,
  };
}

function randomEmbedding(dim = 384): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() - 0.5;
  return v;
}

/** Create a random temp DB path that doesn't exist yet. */
function tempDbPath(): string {
  return join(tmpdir(), `memory-test-${randomUUID()}.db`);
}

/**
 * Read an embedding from the entries_vec table, returning a Float32Array.
 * Handles both native Float32Array (when vec0 extension loaded) and
 * Buffer (fallback table where Float32Array is stored as BLOB).
 */
function readVecEmbedding(
  backend: SqliteVecBackend,
  entryName: string,
): Float32Array | null {
  const row = backend.db.prepare(
    'SELECT embedding FROM entries_vec WHERE id = (SELECT id FROM entries WHERE name = ?)',
  ).get(entryName) as { embedding: Buffer | Float32Array } | undefined;
  if (!row) return null;
  const emb = row.embedding;
  if (emb instanceof Float32Array) return emb;
  // Buffer → Float32Array (fallback path when vec0 extension not loaded)
  const b = emb as Buffer;
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('SqliteVecBackend', () => {
  let dbPath: string;
  let backend: SqliteVecBackend;

  beforeEach(() => {
    dbPath = tempDbPath();
    backend = new SqliteVecBackend(dbPath);
  });

  afterEach(() => {
    backend.close();
    // Cleanup all SQLite artifacts
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
    }
  });

  // ── PRAGMAs (C9) ────────────────────────────────────────────────────

  describe('PRAGMAs', () => {
    it('sets journal_mode=WAL', () => {
      const row = backend.db.pragma('journal_mode', { simple: true });
      expect(row).toBe('wal');
    });

    it('sets synchronous=NORMAL', () => {
      const row = backend.db.pragma('synchronous', { simple: true });
      expect(row).toBe(1); // 1 = NORMAL
    });

    it('sets busy_timeout=5000', () => {
      const row = backend.db.pragma('busy_timeout', { simple: true });
      expect(row).toBe(5000);
    });

    it('sets foreign_keys=ON', () => {
      const row = backend.db.pragma('foreign_keys', { simple: true });
      expect(row).toBe(1);
    });

    it('sets temp_store=MEMORY', () => {
      const row = backend.db.pragma('temp_store', { simple: true });
      expect(row).toBe(2); // 2 = MEMORY
    });
  });

  // ── put / get ────────────────────────────────────────────────────────

  describe('put / get', () => {
    it('put stores an entry and get retrieves it', async () => {
      const entry = testEntry();
      await backend.put(entry, randomEmbedding());
      const retrieved = await backend.get(entry.name);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe(entry.name);
      expect(retrieved!.tier).toBe(entry.tier);
      expect(retrieved!.body).toBe(entry.body);
    });

    it('put updates an existing entry (upsert)', async () => {
      const entry = testEntry({ body: 'original' });
      await backend.put(entry, randomEmbedding());
      const updated = { ...entry, body: 'modified' };
      await backend.put(updated, randomEmbedding());
      const retrieved = await backend.get(entry.name);
      expect(retrieved!.body).toBe('modified');
    });

    it('put stores embedding for later retrieval', async () => {
      const entry = testEntry();
      const emb = randomEmbedding();
      await backend.put(entry, emb);
      const stored = readVecEmbedding(backend, entry.name);
      expect(stored).not.toBeNull();
      expect(stored!.length).toBe(384);
      // The stored embedding should closely match the input (when using BLOB fallback,
      // float32→buffer roundtrip preserves values exactly)
      expect(stored![0]).toBe(emb[0]);
    });

    it('get returns null for missing entry', async () => {
      const result = await backend.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes an entry and returns true', async () => {
      const entry = testEntry();
      await backend.put(entry, randomEmbedding());
      const deleted = await backend.delete(entry.name);
      expect(deleted).toBe(true);
      const retrieved = await backend.get(entry.name);
      expect(retrieved).toBeNull();
    });

    it('returns false for missing entry', async () => {
      const result = await backend.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('cascades to FTS5 index via trigger', async () => {
      const entry = testEntry();
      await backend.put(entry, randomEmbedding());
      // Verify entry is searchable before delete
      const before = backend.db.prepare(
        "SELECT COUNT(*) as cnt FROM entries_fts WHERE entries_fts MATCH 'test'",
      ).get() as { cnt: number };
      expect(before.cnt).toBeGreaterThan(0);

      await backend.delete(entry.name);

      // After delete, the entry should no longer be in the FTS index
      const after = backend.db.prepare(
        "SELECT COUNT(*) as cnt FROM entries_fts WHERE entries_fts MATCH 'test'",
      ).get() as { cnt: number };
      // The deleted entry's FTS row is gone
      expect(after.cnt).toBe(before.cnt - 1);
    });
  });

  // ── list ─────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all entries when no filter', async () => {
      await backend.put(testEntry({ name: 'a' }), randomEmbedding());
      await backend.put(testEntry({ name: 'b' }), randomEmbedding());
      const all = await backend.list({});
      expect(all.length).toBe(2);
    });

    it('filters by tier', async () => {
      await backend.put(testEntry({ name: 'm1', tier: 'mid' }), randomEmbedding());
      await backend.put(testEntry({ name: 'm2', tier: 'mid' }), randomEmbedding());
      await backend.put(testEntry({ name: 'l1', tier: 'long' }), randomEmbedding());
      const mids = await backend.list({ tier: ['mid'] });
      expect(mids.length).toBe(2);
      expect(mids.every((e) => e.tier === 'mid')).toBe(true);
    });

    it('filters by kind', async () => {
      await backend.put(testEntry({ name: 's1', kind: 'semantic' }), randomEmbedding());
      await backend.put(testEntry({ name: 'e1', kind: 'episodic' }), randomEmbedding());
      const semantics = await backend.list({ kind: ['semantic'] });
      expect(semantics.length).toBe(1);
      expect(semantics[0].kind).toBe('semantic');
    });
  });

  // ── search ───────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns results for lexical search mode', async () => {
      await backend.put(
        testEntry({ name: 'pineapple', body: 'I like pineapples on pizza.' }),
        randomEmbedding(),
      );
      const opts: SearchOpts = { query: 'pineapple', k: 5, mode: 'lexical' };
      const hits = await backend.search(opts);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].matchedBy).toBe('lexical');
      expect(hits[0].entry.name).toBe('pineapple');
    });

    it('returns empty for vector search mode without extension', async () => {
      await backend.put(
        testEntry({ name: 'fruit', body: 'Fruit is healthy and delicious.' }),
        randomEmbedding(),
      );
      const opts: SearchOpts = {
        query: 'fruit',
        embedding: randomEmbedding(),
        k: 5,
        mode: 'vector',
      };
      const hits = await backend.search(opts);
      // Without the sqlite-vec extension, vector search returns empty
      expect(Array.isArray(hits)).toBe(true);
      expect(hits.length).toBe(0);
    });

    it('falls back to lexical for hybrid mode without extension', async () => {
      await backend.put(
        testEntry({ name: 'hybrid-test', body: 'Hybrid search combines vector and lexical.' }),
        randomEmbedding(),
      );
      const opts: SearchOpts = { query: 'hybrid', k: 5, mode: 'hybrid' };
      const hits = await backend.search(opts);
      expect(Array.isArray(hits)).toBe(true);
      // Without vec0, hybrid falls back to lexical
      if (hits.length > 0) {
        expect(hits[0].matchedBy).toBe('lexical');
      }
    });

    it('filters by tier in lexical search', async () => {
      await backend.put(
        testEntry({ name: 'fa', tier: 'frequent', body: 'Frequent entry alpha.' }),
        randomEmbedding(),
      );
      await backend.put(
        testEntry({ name: 'fb', tier: 'frequent', body: 'Frequent entry beta.' }),
        randomEmbedding(),
      );
      const opts: SearchOpts = { query: 'entry', k: 10, tier: ['frequent'], mode: 'lexical' };
      const hits = await backend.search(opts);
      expect(hits.length).toBe(2);
      expect(hits.every((h) => h.entry.tier === 'frequent')).toBe(true);
    });
  });

  // ── reindex ─────────────────────────────────────────────────────────

  describe('reindex', () => {
    it('runs reindex without error', async () => {
      // Given an empty DB, reindex should be a no-op
      await expect(backend.reindex()).resolves.toBeUndefined();
    });

    it('reindexes entries with data', async () => {
      await backend.put(
        testEntry({ name: 'ri1', body: 'Reindex test entry.' }),
        randomEmbedding(),
      );
      await expect(backend.reindex()).resolves.toBeUndefined();
      // After reindex, search should still work
      const opts: SearchOpts = { query: 'Reindex', k: 5, mode: 'lexical' };
      const hits = await backend.search(opts);
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  // ── Fix 2: embed_model_id sourcing ──────────────────────────────

  describe('embed_model_id sourcing (Fix 2 / #48)', () => {
    it('writes embed_model_id from constructor-injected Embedder.modelId', async () => {
      const mockEmbedder: Embedder = {
        modelId: 'test-model-x',
        dim: 384,
        embed: async () => [],
      };

      const localPath = tempDbPath();
      const localBackend = new SqliteVecBackend(localPath, undefined, { embedder: mockEmbedder });

      try {
        const entry = testEntry();
        await localBackend.put(entry, randomEmbedding());

        const row = localBackend.db.prepare(
          'SELECT embed_model_id FROM entries WHERE name = ?',
        ).get(entry.name) as { embed_model_id: string } | undefined;

        expect(row).toBeDefined();
        expect(row!.embed_model_id).toBe('test-model-x');
      } finally {
        localBackend.close();
        for (const ext of ['', '-wal', '-shm']) {
          const p = localPath + ext;
          try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
        }
      }
    });

    it('does not write a hardcoded model name when no embedder is injected', async () => {
      const entry = testEntry();
      await backend.put(entry, randomEmbedding());

      const row = backend.db.prepare(
        'SELECT embed_model_id FROM entries WHERE name = ?',
      ).get(entry.name) as { embed_model_id: string } | undefined;

      expect(row).toBeDefined();
      expect(typeof row!.embed_model_id).toBe('string');
      // No hardcoded production model id should leak into the DB
      // when the backend was constructed without an Embedder.
      expect(row!.embed_model_id).not.toBe('Xenova/all-MiniLM-L6-v2');
    });
  });

  // ── T-12 input caps ──────────────────────────────────────────────────

  describe('T-12 input caps', () => {
    it('rejects body just over maxBodyBytes with MemoryBackendInputError', async () => {
      const entry = testEntry({
        body: 'x'.repeat(DEFAULT_MEMORY_LIMITS.maxBodyBytes + 1),
      });
      await expect(backend.put(entry, randomEmbedding())).rejects.toThrow(MemoryBackendInputError);
    });

    it('accepts body exactly at maxBodyBytes', async () => {
      const entry = testEntry({
        body: 'x'.repeat(DEFAULT_MEMORY_LIMITS.maxBodyBytes),
      });
      await expect(backend.put(entry, randomEmbedding())).resolves.toBeUndefined();
    });

    it('rejects embedding just over maxEmbeddingDim with MemoryBackendInputError', async () => {
      const entry = testEntry();
      const oversized = new Float32Array(DEFAULT_MEMORY_LIMITS.maxEmbeddingDim + 1);
      await expect(backend.put(entry, oversized)).rejects.toThrow(MemoryBackendInputError);
    });
  });

  // ── vec0 delete-then-insert transactional safety (T-09) ─────────────

  describe('vec0 transactional safety (T-09)', () => {
    it('replaces embedding atomically on put (no duplicate rows)', async () => {
      const entry = testEntry({ name: 'atomic-test' });
      const emb1 = new Float32Array(384);
      emb1[0] = 0.5;
      await backend.put(entry, emb1);

      // First insert should create exactly one row
      const beforeEmb = readVecEmbedding(backend, entry.name);
      expect(beforeEmb).not.toBeNull();
      expect(beforeEmb![0]).toBeCloseTo(0.5, 5);

      const beforeCount = backend.db.prepare(
        'SELECT COUNT(*) as cnt FROM entries_vec WHERE id = (SELECT id FROM entries WHERE name = ?)',
      ).get(entry.name) as { cnt: number };
      expect(beforeCount.cnt).toBe(1);

      // Update with new embedding
      const emb2 = new Float32Array(384);
      emb2[0] = 0.99;
      await backend.put(entry, emb2);

      // After update, still exactly one row (no duplicates from stale vec0 rows)
      const afterEmb = readVecEmbedding(backend, entry.name);
      expect(afterEmb).not.toBeNull();
      expect(afterEmb![0]).toBeCloseTo(0.99, 5);

      const afterCount = backend.db.prepare(
        'SELECT COUNT(*) as cnt FROM entries_vec WHERE id = (SELECT id FROM entries WHERE name = ?)',
      ).get(entry.name) as { cnt: number };
      expect(afterCount.cnt).toBe(1);
    });
  });
});
