#!/usr/bin/env node

/**
 * memory-export.mjs — Export SQLite-backed memory tiers to JSONL
 *
 * Reads entries from the SQLite database for all `sqlite-vec` tiers and
 * writes each tier to a separate JSONL file under the configured exports
 * directory.  Excludes the `embedding`, `embed_model_id`, and
 * `embed_model_ver` columns per SR2.
 *
 * Usage:
 *   node scripts/memory-export.mjs [options]
 *
 * Options:
 *   --db <path>     Path to the SQLite database (default: from config)
 *   --out <dir>     Export output directory (default: from config)
 *   --tier <name>   Export a single tier only (repeatable)
 *   --help          Show this help
 *
 * Env:
 *   MEMORY_ROOT     Vault root directory (for config resolution)
 *
 * Exit codes:
 *   0 — success
 *   1 — configuration error
 *   2 — I/O or database error
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMemoryConfig, sqliteTiers, sqliteDbPaths } from "./_config.mjs";
import { initDB, listEntries } from "./_memory-backend.mjs";

// ─── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const idx = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };

  const dbPath     = idx("--db");
  const outDir     = idx("--out");
  const tierFilter = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tier" && i + 1 < args.length) {
      tierFilter.push(args[i + 1]);
      i++;
    }
  }

  return { dbPath, outDir, tierFilter };
}

function printHelp() {
  console.log(`
memory-export.mjs — Export SQLite-backed memory tiers to JSONL

Usage:
  node scripts/memory-export.mjs [options]

Options:
  --db <path>     Path to the SQLite database (default: from opencode.json)
  --out <dir>     Export output directory (default: from opencode.json)
  --tier <name>   Export a single tier only (repeatable, e.g. --tier mid --tier long)
  --help          Show this help

Env:
  MEMORY_ROOT     Vault root directory (for config resolution)

The export excludes the "embedding", "embed_model_id", and "embed_model_ver"
columns per SR2 (security requirement — embeddings are a Vec2Text vector
inversion risk and must never be committed).
`);
}

// ─── Fields to exclude from export (SR2) ──────────────────────────────────────

const EXCLUDED_FIELDS = new Set(["embedding", "embed_model_id", "embed_model_ver"]);

/**
 * Strip excluded fields from a row object before serialising to JSONL.
 */
function stripExcluded(row) {
  const clean = {};
  for (const key of Object.keys(row)) {
    if (EXCLUDED_FIELDS.has(key) || EXCLUDED_FIELDS.has(key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()))) {
      continue;
    }
    clean[key] = row[key];
  }
  return clean;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs();

  // Load config.
  let config;
  try {
    config = loadMemoryConfig();
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  // Determine which tiers to export.
  const allSqliteTiers = sqliteTiers(config);
  const tiers = flags.tierFilter.length > 0
    ? flags.tierFilter.filter(t => allSqliteTiers.includes(t))
    : allSqliteTiers;

  if (tiers.length === 0) {
    console.log("No sqlite-vec tiers configured or selected. Nothing to export.");
    process.exit(0);
  }

  // Determine DB path and export directory.
  const dbPaths = sqliteDbPaths(config);
  const dbPath = flags.dbPath ?? (dbPaths.length > 0 ? dbPaths[0] : null);

  if (!dbPath) {
    console.error("ERROR: No sqlite-vec database path configured. Add a 'memory.backends.<tier>.path' to opencode.json.");
    process.exit(1);
  }

  const exportDir = flags.outDir ?? config.exports?._resolvedPath ?? join(process.cwd(), ".opencode", "memory", "exports");

  // Ensure export directory exists.
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true });
  }

  // Open database.
  let db;
  try {
    db = initDB(dbPath, config);
  } catch (err) {
    console.error(`ERROR: Failed to open database: ${err.message}`);
    process.exit(2);
  }

  let totalExported = 0;
  let totalTiers = 0;

  try {
    for (const tier of tiers) {
      const entries = listEntries(db, { tier: [tier] });

      const filePath = join(exportDir, `${tier}.jsonl`);
      const lines = entries.map(entry => JSON.stringify(stripExcluded(entry)));

      writeFileSync(filePath, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf-8");

      totalExported += entries.length;
      totalTiers++;
      console.log(`  \u2713 ${tier}.jsonl — ${entries.length} entries`);
    }
  } catch (err) {
    console.error(`ERROR: Export failed: ${err.message}`);
    process.exit(2);
  } finally {
    db.close();
  }

  console.log(`\nExported ${totalExported} entries across ${totalTiers} tier(s) to ${exportDir}`);
  process.exit(0);
}

main();
