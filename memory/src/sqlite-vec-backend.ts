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
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { withRetry, isSQLiteBusyError } from './sqlite-retry.js';
import { withFtsTimeout } from './fts-wrapper.js';
import {
  verifyExtensionIntegrity,
  IntegrityVerificationError,
} from './integrity-verifier.js';
import type {
  MemoryBackend,
  MemoryEntry,
  SearchHit,
  SearchOpts,
  ReindexOpts,
  MemoryLimits,
  Embedder,
} from './backend.js';
import { validatePutInput, DEFAULT_MEMORY_LIMITS } from './backend.js';

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

/**
 * Sentinel written to `embed_model_id` when no Embedder was injected at
 * construction time. Distinguishable from a real model id so audits can
 * spot un-attributed rows.
 */
const UNSPECIFIED_EMBED_MODEL_ID = 'unspecified';
const DEFAULT_EMBED_MODEL_VER = '1';

/** Default FTS5 query timeout (SR5) in ms. Per ADR-0003 §Configuration. */
const DEFAULT_FTS_TIMEOUT_MS = 500;

// __dirname polyfill for ESM
const _dirname = dirname(fileURLToPath(import.meta.url));

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when the SR4 sqlite-vec extension SHA-256 verification fails or
 * when the backend cannot enforce its fail-closed integrity contract.
 *
 * Per ADR-0003 SR4: verification runs BEFORE `new Database()` so the
 * connection is never opened on failure. No `.db`, `.db-wal`, or `.db-shm`
 * sidecars linger after the throw (C10 — no partial state on rejection).
 *
 * Extends `IntegrityVerificationError` so callers may catch either.
 */
export class MemoryBackendIntegrityError extends IntegrityVerificationError {
  override readonly name = 'MemoryBackendIntegrityError';
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface SqliteVecBackendOptions {
  /** Override the T-12 input caps for `put()`. */
  limits?: MemoryLimits;
  /** Embedder whose `modelId` is recorded in each row's `embed_model_id`. */
  embedder?: Embedder;
  /** FTS5 query timeout in ms (SR5). Default 500 ms. */
  ftsTimeoutMs?: number;
}

export interface SqliteVecBackendCreateOptions extends SqliteVecBackendOptions {
  /**
   * Path to the sqlite-vec loadable extension binary. When provided,
   * `extensionLockPath` MUST also be provided so SR4 SHA-256 verification
   * can run before any `load_extension` call. Fail-closed.
   */
  extensionPath?: string;
  /** Path to the `sqlite-vec.lock` file holding the per-platform SHA-256. */
  extensionLockPath?: string;
}

// ─── Backend ────────────────────────────────────────────────────────────────

export const SCHEMA_SQL = readFileSync(
  resolve(_dirname, 'schema.sql'),
  'utf-8',
);

export class SqliteVecBackend implements MemoryBackend {
  /** Exposed for test assertions (PRAGMAs, direct DB access). */
  public readonly db: BetterSqlite3Database;

  /** Whether the sqlite-vec extension was successfully loaded. */
  private _vec0Available = false;
  public get vec0Available(): boolean {
    return this._vec0Available;
  }

  /** FTS5 query timeout in ms (SR5). Per ADR-0003 §Configuration. */
  public readonly ftsTimeoutMs: number;

  /** Caps enforced by `put()` (T-12). */
  private readonly limits: MemoryLimits;

  /**
   * Embedder injected at construction. When set, `put()` stamps each row's
   * `embed_model_id` column with `embedder.modelId` so the DB faithfully
   * records which model produced the embedding. When unset, rows receive
   * the `UNSPECIFIED_EMBED_MODEL_ID` sentinel.
   */
  private readonly embedder: Embedder | undefined;

  /**
   * Synchronous constructor — opens the DB and applies PRAGMAs only. The
   * schema (DDL) is NOT created here, and the sqlite-vec extension is NOT
   * loaded here.
   *
   * Callers MUST use {@link SqliteVecBackend.create} so the SR4 SHA-256
   * verification of the extension binary can run BEFORE any `load_extension`
   * call. Direct `new SqliteVecBackend()` is an internal primitive that
   * `create()` composes; it leaves the instance without a schema.
   *
   * @internal
   * @param dbPath  Path to the SQLite database file.
   * @param opts    Optional backend configuration. See
   *                {@link SqliteVecBackendOptions}.
   */
  constructor(dbPath: string, opts?: SqliteVecBackendOptions) {
    this.limits = opts?.limits ?? DEFAULT_MEMORY_LIMITS;
    this.embedder = opts?.embedder;
    this.ftsTimeoutMs = opts?.ftsTimeoutMs ?? DEFAULT_FTS_TIMEOUT_MS;

    this.db = new Database(dbPath);

    // ── PRAGMAs (C9) ──────────────────────────────────────────────────
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Static async factory. Use this instead of `new SqliteVecBackend()`.
   *
   * Sequence:
   *   1. If `opts.extensionPath` is provided, validate that
   *      `opts.extensionLockPath` is also provided (fail-closed otherwise).
   *   2. Run SR4 SHA-256 verification on the extension binary BEFORE any
   *      DB connection is opened. On failure, throw
   *      `MemoryBackendIntegrityError` — no `.db`, `.db-wal`, or `.db-shm`
   *      sidecars are created because the verifier runs before
   *      `new Database()`.
   *   3. Open the DB connection and apply PRAGMAs (via the synchronous
   *      constructor).
   *   4. Call `load_extension` on the verified binary. If this fails after
   *      a successful SHA verification, close the DB and throw.
   *   5. Create the schema with the real `vec0` virtual table when the
   *      extension is loaded, or with a BLOB fallback table otherwise.
   *
   * @throws MemoryBackendIntegrityError on SR4 verification failure or when
   *         `extensionPath` is provided without `extensionLockPath`. The
   *         exception leaves zero side effects (C10 — no partial state on
   *         rejection).
   */
  static async create(
    dbPath: string,
    opts?: SqliteVecBackendCreateOptions,
  ): Promise<SqliteVecBackend> {
    // ── SR4: verify BEFORE opening any DB connection ──────────────────
    // Running the verifier before `new Database()` guarantees that a
    // verification failure leaves no `.db`, `.db-wal`, or `.db-shm` files
    // on disk (security recommendation #3 from #47 sign-off).
    if (opts?.extensionPath) {
      if (!opts.extensionLockPath) {
        throw new MemoryBackendIntegrityError(
          'SR4: extensionPath provided without extensionLockPath. ' +
            'Fail-closed — refusing to load_extension without SHA-256 ' +
            'verification.',
        );
      }
      let result;
      try {
        result = await verifyExtensionIntegrity(
          opts.extensionLockPath,
          opts.extensionPath,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new MemoryBackendIntegrityError(
          `SR4 verifier error reading ${opts.extensionLockPath}: ${message}`,
        );
      }
      if (!result.ok) {
        throw new MemoryBackendIntegrityError(
          `SR4: sqlite-vec extension SHA-256 verification failed ` +
            `(platform=${result.platformKey ?? 'unknown'}): ${result.message}. ` +
            'No load_extension issued; no DB connection opened.',
        );
      }
    }

    // ── Open DB + PRAGMAs ─────────────────────────────────────────────
    const inst = new SqliteVecBackend(dbPath, opts);

    // ── Load the verified extension (if any) ──────────────────────────
    let vec0Loaded = false;
    if (opts?.extensionPath) {
      try {
        inst.db.loadExtension(resolve(opts.extensionPath));
        vec0Loaded = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          inst.db.close();
        } catch {
          /* close errors during teardown are non-fatal */
        }
        throw new MemoryBackendIntegrityError(
          `load_extension failed after SR4 SHA-256 verification passed: ${message}`,
        );
      }
    }

    // ── Initialize schema ─────────────────────────────────────────────
    inst._initSchema(vec0Loaded);
    return inst;
  }

  /**
   * Create the entries / entries_fts / entries_vec tables, indexes, and
   * triggers. When `vec0Loaded` is `true`, `entries_vec` is created as a
   * `vec0` virtual table; otherwise a plain BLOB fallback table is created
   * so `put()` does not crash.
   *
   * All CREATEs are idempotent (`IF NOT EXISTS`) so crash-recovery tests
   * can close + reopen without "table already exists" errors.
   */
  private _initSchema(vec0Loaded: boolean): void {
    let ddl = SCHEMA_SQL
      .replace(/^(CREATE TABLE entries)\b/m, 'CREATE TABLE IF NOT EXISTS entries')
      .replace(/^(CREATE INDEX entries_tier_idx)\b/m, 'CREATE INDEX IF NOT EXISTS entries_tier_idx')
      .replace(/^(CREATE VIRTUAL TABLE entries_fts)\b/m, 'CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts')
      .replace(/^(CREATE TRIGGER )/gm, 'CREATE TRIGGER IF NOT EXISTS ');

    ddl = ddl.replace(
      /CREATE VIRTUAL TABLE entries_vec USING vec0 \([\s\S]*?\);/,
      vec0Loaded
        ? 'CREATE VIRTUAL TABLE IF NOT EXISTS entries_vec USING vec0 (id INTEGER PRIMARY KEY, embedding float[384]);'
        : 'CREATE TABLE IF NOT EXISTS entries_vec (id INTEGER PRIMARY KEY, embedding BLOB);',
    );

    this.db.exec(ddl);
    this._vec0Available = vec0Loaded;
  }

  // ── put ───────────────────────────────────────────────────────────────

  async put(entry: MemoryEntry, embedding: Float32Array): Promise<void> {
    validatePutInput(entry, embedding, this.limits);
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
          embed_model_id: this.embedder?.modelId ?? UNSPECIFIED_EMBED_MODEL_ID,
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
      // SR5: per-query FTS5 timeout. Caller may override via SearchOpts.
      const ftsTimeoutMs = opts.timeoutMs ?? this.ftsTimeoutMs;

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
        return this._lexicalSearch(opts.query, opts.k, tierFilter, tierParams, ftsTimeoutMs);
      }

      // Hybrid: combine vector + lexical with weighted fusion
      if (mode === 'hybrid') {
        if (embed && this.vec0Available) {
          return this._hybridSearch(
            opts.query, embed, opts.k, tierFilter, tierParams, ftsTimeoutMs,
          );
        }
        // Fallback to lexical if vector not available
        return this._lexicalSearch(opts.query, opts.k, tierFilter, tierParams, ftsTimeoutMs);
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

  /**
   * Execute a lexical-only FTS5 search.
   *
   * SR5: the FTS5 query is wrapped in {@link withFtsTimeout} so a hanging
   * query rejects with {@link FtsTimeoutError} rather than blocking
   * indefinitely. Per ADR-0003 §Configuration the default is 500 ms; the
   * caller can override via `SearchOpts.timeoutMs` (which `search()`
   * plumbs through).
   *
   * On timeout the wrapper rejects — no partial result array is returned
   * (C10 — no partial state on rejection).
   */
  private async _lexicalSearch(
    query: string,
    k: number,
    tierFilter: string,
    tierParams: string[],
    timeoutMs: number,
  ): Promise<SearchHit[]> {
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

    const rows = await withFtsTimeout(
      async () =>
        this.db.prepare(sql).all(
          ftsQuery,
          ...tierParams,
          k,
        ) as (EntryRow & { bm25_score: number })[],
      { timeoutMs },
    );

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

  /**
   * Hybrid search: combine FTS5 (lexical) + vec0 (vector) candidates via
   * Reciprocal Rank Fusion.
   *
   * SR5: the FTS5 leg runs FIRST and is wrapped in {@link withFtsTimeout}.
   * On lexical timeout the entire search rejects with
   * {@link FtsTimeoutError} — vector hits are NOT returned standalone
   * (C10 — no partial state on rejection, no silent degrade of the
   * ranking guarantee).
   */
  private async _hybridSearch(
    query: string,
    embedding: Float32Array,
    k: number,
    tierFilter: string,
    tierParams: string[],
    timeoutMs: number,
  ): Promise<SearchHit[]> {
    const ftsQuery = this._sanitizeFtsQuery(query);

    // Hybrid: retrieve more candidates from each method, then fuse
    const candidateK = Math.min(k * 3, 100);

    // Lexical candidates — wrapped in withFtsTimeout (SR5). Runs BEFORE the
    // vector leg so a lexical timeout aborts before any vec0 SQL is prepared.
    const lexicalSql = `
      SELECT e.*, fts.rank AS bm25_score
      FROM entries_fts fts
      JOIN entries e ON e.id = fts.rowid
      WHERE entries_fts MATCH ?
      ${tierFilter}
      ORDER BY bm25
      LIMIT ?
    `;
    const lexicalRows = await withFtsTimeout(
      async () =>
        this.db.prepare(lexicalSql).all(
          ftsQuery,
          ...tierParams,
          candidateK,
        ) as (EntryRow & { bm25_score: number })[],
      { timeoutMs },
    );

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
