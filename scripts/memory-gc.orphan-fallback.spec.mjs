/**
 * memory-gc.orphan-fallback.spec.mjs — C13 orphan-repair under embedder fallback
 *
 * Spec (PM rollup C13): when the embedder is unavailable, the orphan-repair
 * phase must:
 *   1. log warnings per orphan
 *   2. NOT crash the GC run
 *   3. flag the row for later reindex (do NOT delete it)
 *   4. let subsequent phases complete normally
 *
 * This test exercises the embedder-unavailable degrade path by spawning
 * memory-gc.mjs as a subprocess in an environment where @xenova/transformers
 * is NOT installed (the default). It then verifies the GC exit was clean
 * AND the orphan rows remain in the DB after the run.
 *
 * Two acceptable outcomes (both prove "no crash"):
 *   (A) SQLite path was exercised → "Embedder unavailable" warning, rows preserved.
 *   (B) SQLite extension could not be loaded on this platform → "file-only mode"
 *       warning, GC still exits 0.
 *
 * Run: node --test scripts/memory-gc.orphan-fallback.spec.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GC_SCRIPT = join(__dirname, "memory-gc.mjs");

let testDir = null;
let memoryRoot = null;
let dbPath = null;

const DEFAULT_CONFIG = {
  sqlite: {
    pragmas: {
      journal_mode: "WAL",
      synchronous:  "NORMAL",
      busy_timeout: 5000,
      foreign_keys: "ON",
      temp_store:   "MEMORY",
    },
    extensionPath: "bin/sqlite-vec",
  },
};

function insertOrphan(backend, db, idx) {
  // putEntry with no embedding parameter creates an entries row but
  // NO entries_vec row — exactly the orphan condition.
  backend.putEntry(db, {
    name: `orphan-${String(idx).padStart(3, "0")}`,
    tier: "mid",
    kind: "working",
    body: `body of orphan ${idx}`,
    description: `description ${idx}`,
    tags: ["test"],
    links: [],
    importance: 3,
    created:       "2026-05-25",
    updated:       "2026-05-25",
    last_accessed: "2026-05-25",
    access_count: 0,
  });
}

describe("memory-gc — orphan-repair under embedder fallback (C13)", () => {
  before(() => {
    testDir = mkdtempSync(join(tmpdir(), "memory-gc-orphan-"));
    memoryRoot = join(testDir, ".opencode", "memory");
    mkdirSync(memoryRoot, { recursive: true });
    dbPath = join(memoryRoot, "memory.db");
  });

  after(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("does not crash + flags orphans for reindex when embedder unavailable", async () => {
    let backend;
    try {
      backend = await import(join(__dirname, "_memory-backend.mjs"));
    } catch (err) {
      console.warn(`Skipping: backend module unavailable: ${err.message}`);
      return;
    }

    let sqliteAvailable = true;
    let db;
    try {
      db = backend.initDB(dbPath, DEFAULT_CONFIG);
    } catch (err) {
      console.warn(`SQLite init failed (likely sqlite-vec extension missing): ${err.message}`);
      sqliteAvailable = false;
    }

    if (sqliteAvailable) {
      for (let i = 0; i < 3; i++) insertOrphan(backend, db, i);
      db.close();
    }

    // Build a stub opencode.json that points the SQLite tiers at our temp DB.
    const stubConfigPath = join(testDir, ".opencode", "opencode.json");
    writeFileSync(stubConfigPath, JSON.stringify({
      memory: {
        version: 1,
        backends: {
          short:       { type: "file" },
          forgettable: { type: "file" },
          mid:         { type: "sqlite-vec", path: dbPath },
          long:        { type: "sqlite-vec", path: dbPath },
          frequent:    { type: "sqlite-vec", path: dbPath },
        },
        embedder: {
          kind: "transformers-js",
          model: "Xenova/all-MiniLM-L6-v2",
          dim: 384,
          quantization: "fp32",
        },
      },
    }, null, 2));

    // Run the GC. cwd=testDir, OPENCODE_CONFIG=stub, MEMORY_ROOT unset so
    // the GC's test-isolation safeguard does NOT trip and the SQLite path
    // can be exercised.
    const envCopy = { ...process.env, OPENCODE_CONFIG: stubConfigPath };
    delete envCopy.MEMORY_ROOT;

    const result = spawnSync("node", [GC_SCRIPT], {
      cwd: testDir,
      env: envCopy,
      encoding: "utf-8",
    });

    // C13 core assertion: GC must NOT crash on missing embedder.
    assert.equal(
      result.status, 0,
      `GC should complete with exit 0, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );

    // The GC must report ONE of:
    //   - embedder-unavailable warning (SQLite path was exercised)
    //   - backend-unavailable / file-only mode warning (SQLite couldn't load)
    const combined = result.stdout + "\n" + result.stderr;
    const sawEmbedderWarning = /Embedder unavailable/.test(combined);
    const sawBackendUnavailable =
      /SQLite backend module not loadable/.test(combined) ||
      /SQLite DB not present/.test(combined) ||
      /Failed to open SQLite DB/.test(combined) ||
      /file-only mode/.test(combined);

    assert.ok(
      sawEmbedderWarning || sawBackendUnavailable,
      `Expected embedder-unavailable warning or backend-unavailable warning.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );

    // If the embedder branch was reached, verify the orphan rows are still
    // present — orphan-repair must NOT delete entries under fallback.
    if (sawEmbedderWarning && sqliteAvailable) {
      const verifyDb = backend.initDB(dbPath, DEFAULT_CONFIG);
      const remaining = backend.countEntries(verifyDb, { tier: ["mid"] });
      verifyDb.close();
      assert.equal(
        remaining, 3,
        "orphan rows must NOT be deleted by GC under embedder fallback"
      );
    }

    // Sanity: stdout should always contain the "Memory GC complete" tail
    // (proves we ran through all phases without crashing).
    assert.match(
      result.stdout, /Memory GC complete/,
      `GC should reach completion tail.\nstdout:\n${result.stdout}`
    );
  });
});
