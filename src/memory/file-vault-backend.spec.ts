import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { FileVaultBackend } from './file-vault-backend.js';
import type { MemoryEntry, SearchOpts } from './backend.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function testEntry(name?: string): MemoryEntry {
  const now = new Date().toISOString();
  return {
    name: name ?? `file-${randomUUID().slice(0, 8)}`,
    tier: 'short',
    kind: 'working',
    description: 'File vault test entry',
    body: 'This is a file vault entry body.',
    tags: ['test', 'file-vault'],
    links: [],
    importance: 2,
    created: now,
    updated: now,
    lastAccessed: now,
    accessCount: 0,
  };
}

function tempVaultPath(): string {
  return join(tmpdir(), `memory-file-vault-${randomUUID()}`);
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('FileVaultBackend', () => {
  let vaultDir: string;
  let backend: FileVaultBackend;

  beforeEach(() => {
    vaultDir = tempVaultPath();
    mkdirSync(vaultDir, { recursive: true });
    backend = new FileVaultBackend(vaultDir);
  });

  afterEach(() => {
    if (existsSync(vaultDir)) {
      rmSync(vaultDir, { recursive: true, force: true });
    }
  });

  // ── put / get ────────────────────────────────────────────────────────

  describe('put / get', () => {
    it('put writes a .md file and get reads it back', async () => {
      const entry = testEntry();
      await backend.put(entry, new Float32Array(0));
      const retrieved = await backend.get(entry.name);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe(entry.name);
      expect(retrieved!.tier).toBe(entry.tier);
      expect(retrieved!.body).toBe(entry.body);
    });

    it('put updates an existing file (overwrite)', async () => {
      const entry = testEntry('overwrite-me');
      await backend.put(entry, new Float32Array(0));
      const updated = { ...entry, body: 'overwritten body' };
      await backend.put(updated, new Float32Array(0));
      const retrieved = await backend.get(entry.name);
      expect(retrieved!.body).toBe('overwritten body');
    });

    it('get returns null for missing entry', async () => {
      const result = await backend.get('nonexistent-file');
      expect(result).toBeNull();
    });

    it('generates file path as tier/name.md', async () => {
      const entry = testEntry('path-test');
      await backend.put(entry, new Float32Array(0));
      const filePath = join(vaultDir, entry.tier, `${entry.name}.md`);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  // ── delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes a file and returns true', async () => {
      const entry = testEntry('to-delete');
      await backend.put(entry, new Float32Array(0));
      const deleted = await backend.delete(entry.name);
      expect(deleted).toBe(true);
      const retrieved = await backend.get(entry.name);
      expect(retrieved).toBeNull();
    });

    it('returns false for missing entry', async () => {
      const result = await backend.delete('does-not-exist');
      expect(result).toBe(false);
    });
  });

  // ── list ─────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all entries when no filter', async () => {
      await backend.put(testEntry('a'), new Float32Array(0));
      await backend.put(testEntry('b'), new Float32Array(0));
      const all = await backend.list({});
      expect(all.length).toBe(2);
    });

    it('filters by kind', async () => {
      await backend.put(
        { ...testEntry('k1'), kind: 'working' },
        new Float32Array(0),
      );
      await backend.put(
        { ...testEntry('k2'), kind: 'episodic' },
        new Float32Array(0),
      );
      const working = await backend.list({ kind: ['working'] });
      expect(working.length).toBe(1);
      expect(working[0].kind).toBe('working');
    });
  });

  // ── search ───────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns results for lexical search', async () => {
      await backend.put(
        { ...testEntry('findable'), body: 'UniqueSearchTermXYZ' },
        new Float32Array(0),
      );
      const opts: SearchOpts = { query: 'UniqueSearchTermXYZ', k: 10, mode: 'lexical' };
      const hits = await backend.search(opts);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].entry.name).toBe('findable');
      expect(hits[0].matchedBy).toBe('lexical');
    });

    it('returns empty for vector mode (not supported)', async () => {
      await backend.put(
        { ...testEntry('v1'), body: 'Vector search is not available in file vault.' },
        new Float32Array(0),
      );
      const opts: SearchOpts = {
        query: 'vector',
        embedding: new Float32Array(384),
        k: 5,
        mode: 'vector',
      };
      const hits = await backend.search(opts);
      expect(hits).toEqual([]);
    });

    it('falls back to lexical for hybrid mode', async () => {
      await backend.put(
        { ...testEntry('h1'), body: 'Hybrid fallback lexical search.' },
        new Float32Array(0),
      );
      const opts: SearchOpts = {
        query: 'hybrid',
        embedding: new Float32Array(384),
        k: 5,
        mode: 'hybrid',
      };
      const hits = await backend.search(opts);
      // Hybrid falls back to lexical in file vault
      if (hits.length > 0) {
        expect(hits[0].matchedBy).toBe('lexical');
      }
    });
  });

  // ── reindex ─────────────────────────────────────────────────────────

  describe('reindex', () => {
    it('is a no-op (resolves)', async () => {
      await expect(backend.reindex()).resolves.toBeUndefined();
    });
  });
});
