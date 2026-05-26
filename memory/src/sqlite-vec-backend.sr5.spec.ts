/**
 * SR5 wiring tests — FTS5 query timeout in SqliteVecBackend.search().
 *
 * Spec:  /docs/specs/agent-memory.md
 * ADR:   /docs/adr/0003-sqlite-vec-memory-backend.md §Security requirements (SR5)
 * Issue: #47 — wire SR3/SR4/SR5 security controls into production paths
 *
 * Acceptance criteria covered:
 *   - SR5: FTS5 queries are wrapped in `withFtsTimeout(ftsTimeoutMs)` —
 *     the wrapper is called for lexical and the lexical leg of hybrid
 *     searches.
 *   - SR5: when the wrapper rejects with `FtsTimeoutError`, `search()`
 *     rejects entirely; no partial result array is returned.
 *   - C10: no partial-state on rejection.
 *   - Configuration: `ftsTimeoutMs` defaults to 500 ms (per ADR-0003) and
 *     can be overridden via constructor opts or per-call SearchOpts.
 *
 * better-sqlite3 is a synchronous driver. The `withFtsTimeout` wrapper
 * bounds caller-visible latency for the await-able boundary but cannot
 * interrupt a synchronous SQLite worker mid-statement. These tests verify
 * the wrapping invariant by mocking `withFtsTimeout` so we can
 * deterministically trigger the timeout behaviour without relying on
 * timer races against sync calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { FtsTimeoutError } from './fts-wrapper.js';
import type { SearchOpts } from './backend.js';

// vi.mock is hoisted before imports — the backend module will see the
// mocked withFtsTimeout for tests that opt into the mock.
vi.mock('./fts-wrapper.js', async () => {
  const actual = await vi.importActual<typeof import('./fts-wrapper.js')>('./fts-wrapper.js');
  return {
    ...actual,
    withFtsTimeout: vi.fn(actual.withFtsTimeout),
  };
});

import { SqliteVecBackend } from './sqlite-vec-backend.js';
import * as ftsWrapper from './fts-wrapper.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function tempDbPath(): string {
  return join(tmpdir(), `sr5-test-${randomUUID()}.db`);
}

function cleanupDb(dbPath: string): void {
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
  }
}

function testEntry(name: string, body: string) {
  const now = new Date().toISOString();
  return {
    name,
    tier: 'mid' as const,
    kind: 'semantic' as const,
    description: 'SR5 test entry',
    body,
    tags: [] as string[],
    links: [] as string[],
    importance: 3 as const,
    created: now,
    updated: now,
    lastAccessed: now,
    accessCount: 0,
  };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('SqliteVecBackend SR5 — FTS5 query timeout wiring', () => {
  let dbPath: string;
  let backend: SqliteVecBackend;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbPath = tempDbPath();
    backend = await SqliteVecBackend.create(dbPath);
  });

  afterEach(() => {
    backend.close();
    cleanupDb(dbPath);
  });

  describe('ftsTimeoutMs configuration', () => {
    it('defaults to 500ms when not specified in opts', () => {
      expect(backend.ftsTimeoutMs).toBe(500);
    });

    it('accepts a custom value via constructor opts', async () => {
      const otherPath = tempDbPath();
      const customBackend = await SqliteVecBackend.create(otherPath, { ftsTimeoutMs: 100 });
      try {
        expect(customBackend.ftsTimeoutMs).toBe(100);
      } finally {
        customBackend.close();
        cleanupDb(otherPath);
      }
    });
  });

  describe('lexical search wraps FTS5 query in withFtsTimeout', () => {
    it('calls withFtsTimeout when search(mode=lexical) runs', async () => {
      await backend.put(testEntry('sr5-doc-1', 'pineapples on pizza are wrong.'), new Float32Array(384));
      const opts: SearchOpts = { query: 'pineapples', k: 5, mode: 'lexical' };
      await backend.search(opts);
      expect(ftsWrapper.withFtsTimeout).toHaveBeenCalledTimes(1);
    });

    it('passes the backend.ftsTimeoutMs to withFtsTimeout by default', async () => {
      await backend.put(testEntry('sr5-doc-2', 'find me'), new Float32Array(384));
      const opts: SearchOpts = { query: 'find', k: 5, mode: 'lexical' };
      await backend.search(opts);

      const calls = vi.mocked(ftsWrapper.withFtsTimeout).mock.calls;
      expect(calls.length).toBe(1);
      const [, options] = calls[0];
      expect(options?.timeoutMs).toBe(500);
    });

    it('SearchOpts.timeoutMs overrides the backend default', async () => {
      await backend.put(testEntry('sr5-doc-3', 'override test'), new Float32Array(384));
      const opts: SearchOpts = { query: 'override', k: 5, mode: 'lexical', timeoutMs: 42 };
      await backend.search(opts);

      const calls = vi.mocked(ftsWrapper.withFtsTimeout).mock.calls;
      expect(calls.length).toBe(1);
      const [, options] = calls[0];
      expect(options?.timeoutMs).toBe(42);
    });

    it('search() rejects when withFtsTimeout rejects with FtsTimeoutError (no partial results)', async () => {
      await backend.put(testEntry('sr5-doc-4', 'will time out'), new Float32Array(384));

      const timeoutErr = new FtsTimeoutError('FTS5 query timed out after 1ms.');
      vi.mocked(ftsWrapper.withFtsTimeout).mockRejectedValueOnce(timeoutErr);

      const opts: SearchOpts = { query: 'will', k: 5, mode: 'lexical', timeoutMs: 1 };
      await expect(backend.search(opts)).rejects.toThrow(FtsTimeoutError);
    });
  });

  describe('hybrid search lexical leg is wrapped', () => {
    it('calls withFtsTimeout for the hybrid fallback path (no vec0 extension)', async () => {
      // Without the sqlite-vec extension, hybrid falls back to lexical only —
      // the lexical leg must still be wrapped in withFtsTimeout (SR5).
      await backend.put(testEntry('sr5-hybrid', 'hybrid candidate'), new Float32Array(384));
      const opts: SearchOpts = {
        query: 'hybrid',
        embedding: new Float32Array(384),
        k: 5,
        mode: 'hybrid',
      };
      await backend.search(opts);
      expect(ftsWrapper.withFtsTimeout).toHaveBeenCalledTimes(1);
    });

    it('search rejects entirely when the lexical leg of hybrid rejects with FtsTimeoutError', async () => {
      await backend.put(testEntry('sr5-hybrid-reject', 'will time out hybrid'), new Float32Array(384));

      const timeoutErr = new FtsTimeoutError('FTS5 query timed out (hybrid leg).');
      vi.mocked(ftsWrapper.withFtsTimeout).mockRejectedValueOnce(timeoutErr);

      const opts: SearchOpts = {
        query: 'will',
        embedding: new Float32Array(384),
        k: 5,
        mode: 'hybrid',
        timeoutMs: 1,
      };
      await expect(backend.search(opts)).rejects.toThrow(FtsTimeoutError);
    });
  });

  describe('happy path — fast queries succeed', () => {
    it('normal lexical search resolves with results when wrapper resolves', async () => {
      await backend.put(testEntry('sr5-happy', 'happy path content'), new Float32Array(384));
      const opts: SearchOpts = { query: 'happy', k: 5, mode: 'lexical' };
      const hits = await backend.search(opts);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].matchedBy).toBe('lexical');
      expect(hits[0].entry.name).toBe('sr5-happy');
    });
  });
});
