/**
 * SqliteVecBackend — MemoryBackend implementation using SQLite + sqlite-vec.
 *
 * Spec:  /docs/specs/agent-memory.md §15
 * ADR:   /docs/adr/0003-sqlite-vec-memory-backend.md
 *
 * Dependencies:
 *   - better-sqlite3 (runtime)
 *   - sqlite-vec extension (loaded via load_extension when available)
 *
 * Per-tier AC (ADR-0003):
 *   short/forgettable → file vault (FileVaultBackend)
 *   mid/long/frequent → SQLite (this backend)
 *
 * Transactional safety (C10/T-09):
 *   vec0 delete-then-insert is wrapped in a single transaction.
 */

import Database from 'better-sqlite3';
import type { BetterSqlite3Database } from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { withRetry, isSQLiteBusyError } from './sqlite-retry.js';
import type {
  MemoryBackend,
  MemoryEntry,
  SearchHit,
  SearchOpts,
  ReindexOpts,
} from './backend.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface EntryRow {
  id: number;
  name: string;
  tier: string;
  kind: string;
  body: string;
  description: string;
  tags: string;
  links: string;
  importance: number;
  created: string;
  updated: string;
  last_accessed: string;
  access_count: number;
  embed_model_id: string;
  embed_model_ver: string;
}

interface Vec0Row {
  id: number;
  embedding: Float32Array | null;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_EMBED_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_EMBED_MODEL_VER = '1';

// __dirname polyfill for ESM
const _dirname = dirname(fileURLToPath(import.meta.url));

// ─── Backend ────────────────────────────────────────────────────────────────

export const SCHEMA_SQL = readFileSync(
  resolve(_dirname, 'schema.sql'),
  'utf-8',
);

export class SqliteVecBackend implements MemoryBackend {
  /** Exposed for test assertions (PRAGMAs, direct DB access). */
  public readonly db: BetterSqlite3Database;

  /** Whether the sqlite-vec extension was successfully loaded. */
  public readonly vec0Available: boolean;

  /**
   * @param dbPath         Path to the SQLite database file.
   * @param extensionPath  Optional path to the sqlite-vec loadable extension.
   *                       If omitted, vector operations are gracefully degraded
   *                       (vector search returns empty, vec0 writes skipped).
   */
  constructor(
    dbPath: string,
    extensionPath?: string,
  ) {
    this.db = new Database(dbPath);

    // ── PRAGMAs (C9) ──────────────────────────────────────────────────
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');

    // ── Load extension ────────────────────────────────────────────────
    let vec0Loaded = false;
    if (extensionPath && existsSync(extensionPath)) {
      try {
        this.db.loadExtension(resolve(extensionPath));
        vec0Loaded = true;
      } catch {
        // Silently degrade — vector ops will be no-ops
      }
    }

    // ── Create tables ─────────────────────────────────────────────────
    // FTS5 and vec0 are virtual tables; entries is a regular table.
    // If vec0 isn't loaded, we create a simple embedding table instead
    // so that put() with an embedding doesn't crash.

    // Always create entries and FTS5
    this.db.exec(SCHEMA_SQL.replace(
      /CREATE VIRTUAL TABLE entries_vec USING vec0 \([\s\S]*?\);/,
      vec0Loaded
        ? 'CREATE VIRTUAL TABLE entries_vec USING vec0 (id INTEGER PRIMARY KEY, embedding float[384]);'
        : 'CREATE TABLE IF NOT EXISTS entries_vec (id INTEGER PRIMARY KEY, embedding BLOB);',
    ));

    this.vec0Available = vec0Loaded;
  }

  // ── put ───────────────────────────────────────────────────────────────

  async put(entry: MemoryEntry, embedding: Float32Array): Promise<void> {
    await withRetry(async () => {
      const txn = this.db.transaction(() => {
        // Upsert into entries table
        const info = this.db.prepare(`
          INSERT INTO entries (name, tier, kind, body, description, tags, links,
                               importance, created, updated, last_accessed,
                               access_count, embed_model_id, embed_model_ver)
          VALUES (@name, @tier, @kind, @body, @description, @tags, @links,
                  @importance, @created, @updated, @last_accessed,
                  @access_count, @embed_model_id, @embed_model_ver)
          ON CONFLICT(name) DO UPDATE SET
            tier         = excluded.tier,
            kind         = excluded.kind,
            body         = excluded.body,
            description  = excluded.description,
            tags         = excluded.tags,
            links        = excluded.links,
            importance   = excluded.importance,
            updated      = excluded.updated,
            last_accessed = excluded.last_accessed,
            access_count = excluded.access_count,
            embed_model_id = excluded.embed_model_id,
            embed_model_ver = excluded.embed_model_ver
        `).run({
          name: entry.name,
          tier: entry.tier,
          kind: entry.kind,
          body: entry.body,
          description: entry.description,
          tags: JSON.stringify(entry.tags),
          links: JSON.stringify(entry.links),
          importance: entry.importance,
          created: entry.created,
          updated: entry.updated,
          last_accessed: entry.lastAccessed,
          access_count: entry.accessCount,
          embed_model_id: DEFAULT_EMBED_MODEL_ID,
          embed_model_ver: DEFAULT_EMBED_MODEL_VER,
        });

        const entryId = info.lastInsertRowid as number;

        // vec0: delete-then-insert in the same transaction (T-09 mitigation)
        if (this.vec0Available) {
          this.db.prepare('DELETE FROM entries_vec WHERE id = ?').run(entryId);
          this.db.prepare('INSERT INTO entries_vec(id, embedding) VALUES (?, ?)').run(entryId, embedding);
        } else {
          // Fallback: store embedding as BLOB in the fallback table
          this.db.prepare(
            'INSERT OR REPLACE INTO entries_vec(id, embedding) VALUES (?, ?)',
          ).run(entryId, embedding);
        }
      });

      txn();
    }, 'put');
  }

  // ── get ───────────────────────────────────────────────────────────────

  async get(name: string): Promise<MemoryEntry | null> {
    return withRetry(async () => {
      const row = this.db.prepare(
        'SELECT * FROM entries WHERE name = ?',
      ).get(name) as EntryRow | undefined;

      if (!row) return null;
      return rowToEntry(row);
    }, 'get');
  }

  // ── delete ───────────────────────────────────────────────────────────

  async delete(name: string): Promise<boolean> {
    return withRetry(async () => {
      const info = this.db.prepare(
        'DELETE FROM entries WHERE name = ?',
      ).run(name);
      return info.changes > 0;
    }, 'delete');
  }

  // ── list ─────────────────────────────────────────────────────────────

  async list(
    filter: { tier?: TierList; kind?: KindList },
  ): Promise<MemoryEntry[]> {
    return withRetry(async () => {
      const conditions: string[] = [];
      const params: Record<string, string[]> = {};

      if (filter.tier && filter.tier.length > 0) {
        conditions.push(`tier IN (${filter.tier.map(() => '?').join(',')})`);
        params.tiers = filter.tier;
      }
      if (filter.kind && filter.kind.length > 0) {
        conditions.push(`kind IN (${filter.kind.map(() => '?').join(',')})`);
        params.kinds = filter.kind;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT * FROM entries ${where} ORDER BY last_accessed DESC`;

      const rows = this.db.prepare(sql).all(
        ...(params.tiers ?? []),
        ...(params.kinds ?? []),
      ) as EntryRow[];

      return rows.map(rowToEntry);
    }, 'list');
  }

  // ── search ───────────────────────────────────────────────────────────

  async search(opts: SearchOpts): Promise<SearchHit[]> {
    return withRetry(async () => {
      const mode = opts.mode ?? 'hybrid';
      const embed = opts.embedding;

      // Tier filter clause
      let tierFilter = '';
      const tierParams: string[] = [];
      if (opts.tier && opts.tier.length > 0) {
        const placeholders = opts.tier.map((t) => {
          tierParams.push(t);
          return '?';
        }).join(',');
        tierFilter = `AND e.tier IN (${placeholders})`;
      }

      if (mode === 'vector' && embed && this.vec0Available) {
        return this._vectorSearch(embed, opts.k, tierFilter, tierParams);
      }

      if (mode === 'lexical') {
        return this._lexicalSearch(opts.query, opts.k, tierFilter, tierParams);
      }

      // Hybrid: combine vector + lexical with weighted fusion
      if (mode === 'hybrid') {
        if (embed && this.vec0Available) {
          return this._hybridSearch(
            opts.query, embed, opts.k, tierFilter, tierParams,
          );
        }
        // Fallback to lexical if vector not available
        return this._lexicalSearch(opts.query, opts.k, tierFilter, tierParams);
      }

      return [];
    }, 'search');
  }

  // ── reindex ──────────────────────────────────────────────────────────

  async reindex(_opts?: ReindexOpts): Promise<void> {
    await withRetry(() => {
      // Rebuild FTS5 content table
      this.db.exec(`
        INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
        SELECT 'rebuild', id, name, description, body, tags FROM entries;
      `);

      // Note: vec0 rebuild requires re-embedding via external embedder,
      // which is handled by the caller (memory:gc) when an embedder is provided.
      return Promise.resolve();
    }, 'reindex');
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  // ── Private search methods ───────────────────────────────────────────

  private _lexicalSearch(
    query: string,
    k: number,
    tierFilter: string,
    tierParams: string[],
  ): SearchHit[] {
    // Sanitize FTS5 query — remove special characters and wrap in double quotes
    // for safety (Security req 5: phrase-quote user input by default)
    const ftsQuery = this._sanitizeFtsQuery(query);

    const sql = `
      SELECT e.*, fts.rank AS bm25_score
      FROM entries_fts fts
      JOIN entries e ON e.id = fts.rowid
      WHERE entries_fts MATCH ?
      ${tierFilter}
      ORDER BY rank
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(
      ftsQuery,
      ...tierParams,
      k,
    ) as (EntryRow & { bm25_score: number })[];

    return rows.map((row) => ({
      entry: rowToEntry(row),
      score: 1 / (1 + Math.abs(row.bm25_score)),
      matchedBy: 'lexical' as const,
      lexicalScore: row.bm25_score,
    }));
  }

  private _vectorSearch(
    embedding: Float32Array,
    k: number,
    tierFilter: string,
    tierParams: string[],
  ): SearchHit[] {
    const sql = `
      SELECT e.*, vec.distance
      FROM entries_vec v
      JOIN entries e ON e.id = v.id
      WHERE v.embedding MATCH ?
      ${tierFilter}
      ORDER BY v.distance
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(
      embedding,
      ...tierParams,
      k,
    ) as (EntryRow & { distance: number })[];

    return rows.map((row) => ({
      entry: rowToEntry(row),
      score: 1 / (1 + row.distance),
      matchedBy: 'vector' as const,
      vectorDistance: row.distance,
    }));
  }

  private _hybridSearch(
    query: string,
    embedding: Float32Array,
    k: number,
    tierFilter: string,
    tierParams: string[],
  ): SearchHit[] {
    const ftsQuery = this._sanitizeFtsQuery(query);

    // Hybrid: retrieve more candidates from each method, then fuse
    const candidateK = Math.min(k * 3, 100);

    // Lexical candidates
    const lexicalSql = `
      SELECT e.*, fts.rank AS bm25_score
      FROM entries_fts fts
      JOIN entries e ON e.id = fts.rowid
      WHERE entries_fts MATCH ?
      ${tierFilter}
      ORDER BY bm25
      LIMIT ?
    `;
    const lexicalRows = this.db.prepare(lexicalSql).all(
      ftsQuery,
      ...tierParams,
      candidateK,
    ) as (EntryRow & { bm25_score: number })[];

    // Vector candidates
    const vectorSql = `
      SELECT e.*, vec.distance
      FROM entries_vec v
      JOIN entries e ON e.id = v.id
      WHERE v.embedding MATCH ?
      ${tierFilter}
      ORDER BY v.distance
      LIMIT ?
    `;
    const vectorRows = this.db.prepare(vectorSql).all(
      embedding,
      ...tierParams,
      candidateK,
    ) as (EntryRow & { distance: number })[];

    // Fuse using Reciprocal Rank Fusion
    return this._rrfFusion(lexicalRows, vectorRows, k);
  }

  private _rrfFusion(
    lexical: (EntryRow & { bm25_score: number })[],
    vector: (EntryRow & { distance: number })[],
    k: number,
  ): SearchHit[] {
    const K = 60; // RRF constant

    const scores = new Map<number, {
      entry: EntryRow;
      rrfScore: number;
      vectorDist: number | undefined;
      lexicalScore: number | undefined;
    }>();

    lexical.forEach((row, idx) => {
      const rank = idx + 1;
      const existing = scores.get(row.id) ?? {
        entry: row,
        rrfScore: 0,
        vectorDist: undefined,
        lexicalScore: undefined,
      };
      existing.rrfScore += 1 / (K + rank);
      existing.lexicalScore = row.bm25_score;
      scores.set(row.id, existing);
    });

    vector.forEach((row, idx) => {
      const rank = idx + 1;
      const existing = scores.get(row.id) ?? {
        entry: row,
        rrfScore: 0,
        vectorDist: undefined,
        lexicalScore: undefined,
      };
      existing.rrfScore += 1 / (K + rank);
      existing.vectorDist = row.distance;
      scores.set(row.id, existing);
    });

    return Array.from(scores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, k)
      .map((s) => {
        const matchedBy: 'vector' | 'lexical' | 'hybrid' =
          s.lexicalScore !== undefined && s.vectorDist !== undefined
            ? 'hybrid'
            : s.vectorDist !== undefined
              ? 'vector'
              : 'lexical';

        return {
          entry: rowToEntry(s.entry),
          score: s.rrfScore,
          matchedBy,
          vectorDistance: s.vectorDist,
          lexicalScore: s.lexicalScore,
        };
      });
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /**
   * Sanitize a user query for FTS5.
   * Removes special FTS5 operators and wraps in double quotes for safety.
   * (Security requirement 5: phrase-quote user input by default)
   */
  private _sanitizeFtsQuery(query: string): string {
    // Strip FTS5 special characters: ^ * " ( ) : + - ~
    const sanitized = query.replace(/[\^"():+~*-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!sanitized) return '" "'; // match-nothing fallback
    // Quote each word for phrase matching
    return sanitized.split(' ').map((w) => `"${w}"`).join(' ');
  }
}

// ─── Type helpers ───────────────────────────────────────────────────────────

type TierList = MemoryEntry['tier'][];
type KindList = MemoryEntry['kind'][];

// ─── Row → entry mapping ────────────────────────────────────────────────────

function rowToEntry(row: EntryRow): MemoryEntry {
  return {
    name: row.name,
    tier: row.tier as MemoryEntry['tier'],
    kind: row.kind as MemoryEntry['kind'],
    description: row.description,
    body: row.body,
    tags: JSON.parse(row.tags) as string[],
    links: JSON.parse(row.links) as string[],
    importance: row.importance as 1 | 2 | 3 | 4 | 5,
    created: row.created,
    updated: row.updated,
    lastAccessed: row.last_accessed,
    accessCount: row.access_count,
  };
}
