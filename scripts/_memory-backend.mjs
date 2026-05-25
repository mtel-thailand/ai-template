#!/usr/bin/env node

/**
 * _memory-backend.mjs — Standalone SQLite backend for memory scripts
 *
 * Provides a lightweight, synchronous wrapper around better-sqlite3 +
 * sqlite-vec for use by memory-{gc,export,import}.mjs scripts.
 *
 * This is NOT a full implementation of the MemoryBackend interface from
 * src/memory/backend.ts — it is a simplified adapter that implements only
 * the operations needed by the GC, export, and import scripts:
 *   initDB()      → open/init a SQLite DB with DDL + pragmas
 *   listEntries() → list entries, optionally filtered by tier
 *   getEntry()    → fetch a single entry by name
 *   deleteEntry() → remove an entry by name (cascades to vec0 + fts5)
 *   putEntry()    → insert or update an entry
 *   countEntries()→ count entries, optionally by tier
 *   vacuumIfNeeded() → VACUUM if freelist exceeds 25% of pages
 *   close()       → close the database connection
 *
 * Dependencies:
 *   - better-sqlite3 (npm) — synchronous SQLite driver
 *   - sqlite-vec (npm)     — vector extension loaded via loadExtension()
 *
 * Usage:
 *   import { initDB, listEntries } from "./_memory-backend.mjs";
 *   const db = initDB("/path/to/memory.db", config);
 *   const entries = listEntries(db, { tier: ["mid", "long"] });
 *   db.close();
 *
 * @module _memory-backend
 */

import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";

// ─── DDL (canonical — copy of src/memory/schema.sql) ────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entries (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  tier            TEXT NOT NULL CHECK (tier IN
                    ('short','mid','long','frequent','forgettable')),
  kind            TEXT NOT NULL CHECK (kind IN
                    ('working','episodic','semantic','procedural')),
  body            TEXT NOT NULL,
  description     TEXT NOT NULL,
  tags            TEXT NOT NULL DEFAULT '[]',
  links           TEXT NOT NULL DEFAULT '[]',
  importance      INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  created         TEXT NOT NULL,
  updated         TEXT NOT NULL,
  last_accessed   TEXT NOT NULL,
  access_count    INTEGER NOT NULL DEFAULT 0,
  embed_model_id  TEXT NOT NULL DEFAULT '',
  embed_model_ver TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS entries_tier_idx ON entries (tier, last_accessed);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_vec USING vec0 (
  id INTEGER PRIMARY KEY,
  embedding float[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5 (
  name, description, body, tags,
  content='entries', content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, name, description, body, tags)
    VALUES (new.id, new.name, new.description, new.body, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
    VALUES ('delete', old.id, old.name, old.description, old.body, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
    VALUES ('delete', old.id, old.name, old.description, old.body, old.tags);
  INSERT INTO entries_fts(rowid, name, description, body, tags)
    VALUES (new.id, new.name, new.description, new.body, new.tags);
END;
`;

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize (open or create) a SQLite database with the memory schema,
 * PRAGMAs, and the sqlite-vec extension loaded.
 *
 * @param {string} dbPath        Absolute path to the .db file
 * @param {object} config        Memory config from _config.mjs (config.sqlite)
 * @returns {import("better-sqlite3").Database}
 * @throws {Error}  If the extension fails to load or schema creation fails.
 */
export function initDB(dbPath, config) {
  const sqliteCfg = config?.sqlite ?? {};
  const pragmas = sqliteCfg.pragmas ?? {};

  const db = new Database(dbPath);

  // Apply PRAGMAs (must be done before first WAL write).
  if (pragmas.journal_mode)   db.pragma(`journal_mode = ${pragmas.journal_mode}`);
  if (pragmas.synchronous)    db.pragma(`synchronous = ${pragmas.synchronous}`);
  if (pragmas.busy_timeout)   db.pragma(`busy_timeout = ${pragmas.busy_timeout}`);
  if (pragmas.foreign_keys)   db.pragma(`foreign_keys = ${pragmas.foreign_keys}`);
  if (pragmas.temp_store)     db.pragma(`temp_store = ${pragmas.temp_store}`);

  // Load the sqlite-vec extension.
  const extPath = sqliteCfg._resolvedExtensionPath ?? sqliteCfg.extensionPath ?? "bin/sqlite-vec";
  try {
    sqliteVec.load(db);
  } catch (err) {
    throw new Error(
      `Failed to load sqlite-vec extension from "${extPath}": ${err.message}. ` +
      "Ensure the extension is built and the path is correct in opencode.json memory.sqlite.extensionPath."
    );
  }

  // Create tables, indexes, triggers.
  db.exec(SCHEMA_SQL);

  return db;
}

/**
 * List entries, optionally filtered by tier(s).
 *
 * @param {import("better-sqlite3").Database} db
 * @param {object} [opts]
 * @param {string[]} [opts.tier]  Array of tier names to filter by
 * @returns {Array<object>}  Array of row objects with all entry columns
 */
export function listEntries(db, opts = {}) {
  const { tier } = opts;

  if (tier && tier.length > 0) {
    const placeholders = tier.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM entries WHERE tier IN (${placeholders}) ORDER BY updated DESC`
    );
    return stmt.all(...tier);
  }

  return db.prepare("SELECT * FROM entries ORDER BY updated DESC").all();
}

/**
 * Fetch a single entry by name.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} name
 * @returns {object|null}
 */
export function getEntry(db, name) {
  return db.prepare("SELECT * FROM entries WHERE name = ?").get(name) ?? null;
}

/**
 * Delete an entry by name.  The FTS5 and vec0 cascading is handled by the
 * entries_ad trigger (DELETE → delete from entries_fts).  The vec0 table
 * uses rowid == entries.id, so deleting the entries row automatically
 * removes the vec0 row since vec0 inherits rowid.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} name
 * @returns {boolean}  true if a row was deleted
 */
export function deleteEntry(db, name) {
  const result = db.prepare("DELETE FROM entries WHERE name = ?").run(name);
  return result.changes > 0;
}

/**
 * Insert or update an entry.  If an entry with the same `name` exists, it is
 * replaced (row is deleted then re-inserted, which triggers FTS5 and vec0
 * cascading correctly).
 *
 * @param {import("better-sqlite3").Database} db
 * @param {object} entry  Flat object with keys matching the entries columns.
 *   Must include: name, tier, kind, body, description, created, updated,
 *   last_accessed, importance.
 *   May include: tags (JSON array string), links (JSON array string),
 *   access_count, embed_model_id, embed_model_ver.
 * @param {Float32Array|number[]} [embedding]  Optional embedding vector
 *   (float[384]).  If provided, inserted into entries_vec.
 * @returns {number}  The rowid of the inserted/replaced entry
 */
export function putEntry(db, entry, embedding) {
  const row = {
    name: entry.name,
    tier: entry.tier,
    kind: entry.kind,
    body: entry.body ?? "",
    description: entry.description ?? "",
    tags: JSON.stringify(entry.tags ?? []),
    links: JSON.stringify(entry.links ?? []),
    importance: entry.importance ?? 3,
    created: entry.created,
    updated: entry.updated ?? entry.created,
    last_accessed: entry.last_accessed ?? entry.updated ?? entry.created,
    access_count: entry.access_count ?? 0,
    embed_model_id: entry.embed_model_id ?? "",
    embed_model_ver: entry.embed_model_ver ?? "",
  };

  const insert = db.prepare(`
    INSERT OR REPLACE INTO entries
      (name, tier, kind, body, description, tags, links, importance,
       created, updated, last_accessed, access_count,
       embed_model_id, embed_model_ver)
    VALUES
      (@name, @tier, @kind, @body, @description, @tags, @links, @importance,
       @created, @updated, @last_accessed, @access_count,
       @embed_model_id, @embed_model_ver)
  `);

  // Use a transaction for consistency.
  const tx = db.transaction(() => {
    const result = insert.run(row);

    // If an embedding was provided, upsert into entries_vec.
    // Note: vec0 does NOT support INSERT OR REPLACE, so we DELETE then INSERT.
    if (embedding) {
      const vecId = result.lastInsertRowid;
      db.prepare("DELETE FROM entries_vec WHERE id = ?").run(vecId);
      db.prepare("INSERT INTO entries_vec(id, embedding) VALUES (?, ?)").run(vecId, new Float32Array(embedding));
    }

    return result.lastInsertRowid;
  });

  return tx();
}

/**
 * Count entries, optionally by tier.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {object} [opts]
 * @param {string[]} [opts.tier]
 * @returns {number}
 */
export function countEntries(db, opts = {}) {
  const { tier } = opts;

  if (tier && tier.length > 0) {
    const placeholders = tier.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT COUNT(*) AS cnt FROM entries WHERE tier IN (${placeholders})`);
    return stmt.get(...tier).cnt;
  }

  return db.prepare("SELECT COUNT(*) AS cnt FROM entries").get().cnt;
}

// ─── Vacuum ──────────────────────────────────────────────────────────────────

/**
 * Check whether the database freelist exceeds 25 % of total pages and, if so,
 * perform WAL checkpoint + VACUUM.
 *
 * Uses the formula: freelist_count / page_count > 0.25
 *
 * @param {import("better-sqlite3").Database} db
 * @returns {{ vacuuumed: boolean, freelistPct: number, pageCount: number, freelistCount: number }}
 */
export function vacuumIfNeeded(db) {
  let pCount, fCount;
  try {
    const pageInfo = db.prepare("PRAGMA page_count").get();
    const freelistInfo = db.prepare("PRAGMA freelist_count").get();
    pCount = pageInfo?.page_count ?? pageInfo?.pageCount ?? pageInfo ?? 0;
    fCount = freelistInfo?.freelist_count ?? freelistInfo?.freelistCount ?? freelistInfo ?? 0;
  } catch {
    pCount = 0;
    fCount = 0;
  }

  const freelistPct = pCount > 0 ? fCount / pCount : 0;
  const shouldVacuum = freelistPct > 0.25;

  if (shouldVacuum) {
    // WAL checkpoint with TRUNCATE mode.
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.exec("VACUUM");
  }

  return {
    vacuuumed: shouldVacuum,
    freelistPct: Math.round(freelistPct * 10000) / 10000,
    pageCount: pCount,
    freelistCount: fCount,
  };
}
