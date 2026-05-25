#!/usr/bin/env node

/**
 * memory-export.spec.mjs — Tests for memory-export.mjs
 *
 * Uses node:test + assert, following the same pattern as memory-gc.test.mjs.
 * Tests run against a temporary SQLite database to verify:
 *   - JSONL export produces correct output for each tier
 *   - Excluded fields (embedding, embed_model_id, embed_model_ver) are absent
 *   - Export directory is created if missing
 *   - Empty database produces valid empty export
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = new URL("..", import.meta.url).pathname;
const EXPORT_SCRIPT = join(ROOT, "scripts", "memory-export.mjs");

/**
 * Run memory-export.mjs with given args and env.
 */
function runExport(args = [], env = {}) {
  return spawnSync("node", [EXPORT_SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf-8",
    timeout: 30_000,
  });
}

/**
 * Load JSONL file and return array of parsed objects.
 */
function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

/**
 * Create a temporary directory path for test isolation.
 */
function tempDir() {
  return mkdtempSync(join(tmpdir(), "memory-export-test-"));
}

// ─── Seed a test SQLite database ──────────────────────────────────────────────

async function seedTestDB(dbPath) {
  const { initDB, putEntry } = await import("./_memory-backend.mjs");
  const { loadMemoryConfig } = await import("./_config.mjs");

  const config = loadMemoryConfig(ROOT);
  const db = initDB(dbPath, config);

  const entries = [
    {
      name: "test-mid-entry",
      tier: "mid",
      kind: "semantic",
      body: "This is a test entry for mid tier.",
      description: "Test mid entry",
      tags: ["test", "mid"],
      links: [],
      importance: 3,
      created: "2026-05-25",
      updated: "2026-05-25",
      last_accessed: "2026-05-25",
      access_count: 1,
    },
    {
      name: "test-long-entry",
      tier: "long",
      kind: "procedural",
      body: "This is a test entry for long tier.",
      description: "Test long entry",
      tags: ["test", "long"],
      links: [],
      importance: 4,
      created: "2026-05-24",
      updated: "2026-05-24",
      last_accessed: "2026-05-24",
      access_count: 5,
    },
    {
      name: "test-frequent-entry",
      tier: "frequent",
      kind: "working",
      body: "This is a test entry for frequent tier.",
      description: "Test frequent entry",
      tags: ["test", "frequent"],
      links: ["[[test-mid-entry]]"],
      importance: 2,
      created: "2026-05-25",
      updated: "2026-05-25",
      last_accessed: "2026-05-25",
      access_count: 10,
    },
  ];

  for (const entry of entries) {
    putEntry(db, entry);
  }

  db.close();
  return entries;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("memory-export.mjs", () => {
  let testDir;
  let dbPath;
  let exportDir;
  let seededEntries;

  before(async () => {
    testDir = tempDir();
    dbPath = join(testDir, "memory.db");
    exportDir = join(testDir, "exports");
    seededEntries = await seedTestDB(dbPath);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("exports all sqlite-vec tiers to JSONL files", () => {
    const result = runExport(
      ["--db", dbPath, "--out", exportDir],
      { MEMORY_ROOT: testDir }
    );

    assert.strictEqual(result.status, 0, `Export failed: ${result.stderr}`);

    // Should have exported each tier
    for (const tier of ["mid", "long", "frequent"]) {
      const filePath = join(exportDir, `${tier}.jsonl`);
      assert.ok(existsSync(filePath), `Missing export for tier: ${tier}`);
    }
  });

  test("exported JSONL contains all seeded entries with correct fields", () => {
    // Re-run to ensure clean state
    const result = runExport(
      ["--db", dbPath, "--out", exportDir],
      { MEMORY_ROOT: testDir }
    );
    assert.strictEqual(result.status, 0);

    const midEntries = loadJsonl(join(exportDir, "mid.jsonl"));
    assert.strictEqual(midEntries.length, 1);
    assert.strictEqual(midEntries[0].name, "test-mid-entry");
    assert.strictEqual(midEntries[0].body, "This is a test entry for mid tier.");

    const longEntries = loadJsonl(join(exportDir, "long.jsonl"));
    assert.strictEqual(longEntries.length, 1);
    assert.strictEqual(longEntries[0].name, "test-long-entry");

    const freqEntries = loadJsonl(join(exportDir, "frequent.jsonl"));
    assert.strictEqual(freqEntries.length, 1);
    assert.strictEqual(freqEntries[0].name, "test-frequent-entry");
  });

  test("exported JSONL excludes embedding, embed_model_id, embed_model_ver (SR2)", () => {
    const result = runExport(
      ["--db", dbPath, "--out", exportDir],
      { MEMORY_ROOT: testDir }
    );
    assert.strictEqual(result.status, 0);

    for (const tier of ["mid", "long", "frequent"]) {
      const entries = loadJsonl(join(exportDir, `${tier}.jsonl`));
      for (const entry of entries) {
        assert.ok(
          !("embedding" in entry),
          `entry in ${tier}.jsonl must not contain "embedding" field`
        );
        assert.ok(
          !("embed_model_id" in entry),
          `entry in ${tier}.jsonl must not contain "embed_model_id" field`
        );
        assert.ok(
          !("embed_model_ver" in entry),
          `entry in ${tier}.jsonl must not contain "embed_model_ver" field`
        );
      }
    }
  });

  test("empty database produces empty but valid JSONL files", () => {
    const emptyDbPath = join(testDir, "empty.db");
    const emptyExportDir = join(testDir, "empty-exports");

    const result = runExport(
      ["--db", emptyDbPath, "--out", emptyExportDir],
      { MEMORY_ROOT: testDir }
    );
    assert.strictEqual(result.status, 0);

    for (const tier of ["mid", "long", "frequent"]) {
      const filePath = join(emptyExportDir, `${tier}.jsonl`);
      if (existsSync(filePath)) {
        const entries = loadJsonl(filePath);
        assert.strictEqual(entries.length, 0, `${tier} should be empty for empty DB`);
      }
    }
  });

  test("--help prints usage and exits 0", () => {
    const result = runExport(["--help"]);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes("memory-export.mjs"));
  });
});
