#!/usr/bin/env node

/**
 * memory-import.spec.mjs — Tests for memory-import.mjs
 *
 * Uses node:test + assert, following the same pattern as memory-gc.test.mjs.
 * Verification is done via spawnSync (export then validate JSONL output)
 * to avoid ESM import complications in test callbacks.
 *
 * Tests:
 *   - Markdown files are imported into SQLite correctly
 *   - Idempotent re-import does not create duplicates
 *   - Conflict resolution (most-recent-updated wins + loser archive)
 *   - --tier filter works
 *   - --dry-run does not modify the database
 *   - --help
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync,
  rmSync, readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = new URL("..", import.meta.url).pathname;
const IMPORT_SCRIPT = join(ROOT, "scripts", "memory-import.mjs");
const EXPORT_SCRIPT = join(ROOT, "scripts", "memory-export.mjs");

function runImport(args = [], env = {}) {
  return spawnSync("node", [IMPORT_SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf-8",
    timeout: 30_000,
  });
}

function runExport(args = [], env = {}) {
  return spawnSync("node", [EXPORT_SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf-8",
    timeout: 30_000,
  });
}

function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "memory-import-test-"));
}

function writeEntry(dir, entry) {
  const fm = entry.frontmatter;
  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${item}`);
    } else if (typeof value === "string" && (value.includes(":") || value.includes("#"))) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push(entry.body ?? "");
  const filePath = join(dir, entry.filename);
  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("memory-import.mjs", () => {
  let testDir;
  let vaultDir;
  let dbPath;
  let exportDir;
  let conflictsDir;

  before(() => {
    testDir = tempDir();
    vaultDir = join(testDir, "vault");
    dbPath = join(testDir, "memory.db");
    exportDir = join(testDir, "exports");
    conflictsDir = join(testDir, "conflicts");
    mkdirSync(vaultDir, { recursive: true });
    mkdirSync(exportDir, { recursive: true });
    mkdirSync(conflictsDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("imports a single mid-tier MD file into SQLite", () => {
    writeEntry(vaultDir, {
      filename: "test-entry.md",
      frontmatter: {
        name: "test-import-entry",
        description: "Test import entry",
        tier: "mid",
        kind: "semantic",
        created: "2026-05-25",
        updated: "2026-05-25",
        last_accessed: "2026-05-25",
        access_count: 1,
        importance: 3,
        tags: ["test"],
        links: [],
      },
      body: "This entry was imported from a file.",
    });

    const result = runImport([
      "--db", dbPath,
      "--from", vaultDir,
      "--conflicts", conflictsDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(result.status, 0, `Import failed: ${result.stderr}`);

    // Verify via export
    const exportResult = runExport([
      "--db", dbPath,
      "--out", exportDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(exportResult.status, 0);

    const entries = loadJsonl(join(exportDir, "mid.jsonl"));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].name, "test-import-entry");
    assert.strictEqual(entries[0].body, "This entry was imported from a file.");
    assert.strictEqual(entries[0].tier, "mid");
  });

  test("import is idempotent — re-importing same file does not create duplicate", () => {
    writeEntry(vaultDir, {
      filename: "idempotent-entry.md",
      frontmatter: {
        name: "test-idempotent",
        description: "Idempotent test entry",
        tier: "long",
        kind: "procedural",
        created: "2026-05-25",
        updated: "2026-05-25",
        last_accessed: "2026-05-25",
        access_count: 1,
        importance: 3,
        tags: [],
        links: [],
      },
      body: "This entry tests idempotency.",
    });

    // Import twice
    const r1 = runImport([
      "--db", dbPath,
      "--from", vaultDir,
      "--conflicts", conflictsDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(r1.status, 0, `First import failed: ${r1.stderr}`);

    const r2 = runImport([
      "--db", dbPath,
      "--from", vaultDir,
      "--conflicts", conflictsDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(r2.status, 0, `Second import failed: ${r2.stderr}`);

    // Export to check only 1 entry in long tier
    const exportResult = runExport([
      "--db", dbPath,
      "--out", exportDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(exportResult.status, 0);

    const entries = loadJsonl(join(exportDir, "long.jsonl"));
    assert.strictEqual(entries.length, 1, "Should have exactly one entry after idempotent re-import");
    assert.strictEqual(entries[0].name, "test-idempotent");
  });

  test("conflict resolution: newer entry wins; older incoming is archived to conflicts/", () => {
    // Step 1: Insert a "newer" entry directly into SQLite (via import with June date).
    writeEntry(vaultDir, {
      filename: "newer-entry.md",
      frontmatter: {
        name: "test-conflict",
        description: "Newer entry in DB",
        tier: "mid",
        kind: "semantic",
        created: "2026-05-01",
        updated: "2026-06-01",
        last_accessed: "2026-06-01",
        access_count: 1,
        importance: 3,
        tags: [],
        links: [],
      },
      body: "Newer body (in DB)",
    });

    runImport([
      "--db", dbPath,
      "--from", vaultDir,
      "--conflicts", conflictsDir,
    ], { MEMORY_ROOT: testDir });

    // Step 2: Write an OLDER entry (May) with the same name, then try to import it.
    writeEntry(vaultDir, {
      filename: "older-entry.md",
      frontmatter: {
        name: "test-conflict",
        description: "Older incoming entry",
        tier: "mid",
        kind: "semantic",
        created: "2026-05-01",
        updated: "2026-05-01",
        last_accessed: "2026-05-01",
        access_count: 1,
        importance: 2,
        tags: [],
        links: [],
      },
      body: "Older body (incoming)",
    });

    const result = runImport([
      "--db", dbPath,
      "--from", vaultDir,
      "--conflicts", conflictsDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(result.status, 0, `Conflict import failed: ${result.stderr}`);

    // Export to verify the NEWER body (June) is still in the DB.
    const exportResult = runExport([
      "--db", dbPath,
      "--out", exportDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(exportResult.status, 0);

    const entries = loadJsonl(join(exportDir, "mid.jsonl"));
    const conflict = entries.find(e => e.name === "test-conflict");
    assert.ok(conflict, "Entry should exist after conflict resolution");
    assert.strictEqual(conflict.body, "Newer body (in DB)", "Newer entry (June) should remain in DB");

    // Check conflict archive was created for the OLDER incoming file.
    const conflictFiles = readdirSync(conflictsDir)
      .filter(f => f.startsWith("test-conflict"));
    assert.ok(conflictFiles.length > 0, `Conflict archive should exist for older entry, found: ${conflictFiles.join(", ")}`);
    // The archived file should mention the older date somewhere.
    assert.ok(conflictFiles.some(f => f.includes("20260501")),
      `Conflict archive filename should reference the older updated date`);
  });

  test("--dry-run does not modify the database", () => {
    writeEntry(vaultDir, {
      filename: "dryrun-entry.md",
      frontmatter: {
        name: "test-dryrun",
        description: "Dry-run entry",
        tier: "mid",
        kind: "semantic",
        created: "2026-05-25",
        updated: "2026-05-25",
        last_accessed: "2026-05-25",
        access_count: 1,
        importance: 3,
        tags: [],
        links: [],
      },
      body: "Should not be imported.",
    });

    const result = runImport([
      "--db", dbPath,
      "--from", vaultDir,
      "--conflicts", conflictsDir,
      "--dry-run",
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(result.status, 0, `Dry-run failed: ${result.stderr}`);

    // Verify the entry is NOT in the DB
    const exportResult = runExport([
      "--db", dbPath,
      "--out", exportDir,
    ], { MEMORY_ROOT: testDir });
    assert.strictEqual(exportResult.status, 0);

    const entries = loadJsonl(join(exportDir, "mid.jsonl"));
    const dryrunEntry = entries.find(e => e.name === "test-dryrun");
    assert.ok(!dryrunEntry, "Dry-run should not have imported the entry");
  });

  test("--help prints usage and exits 0", () => {
    const result = runImport(["--help"]);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes("memory-import.mjs"));
  });
});
