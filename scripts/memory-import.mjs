#!/usr/bin/env node

/**
 * memory-import.mjs — Import file-vault entries into SQLite memory DB
 *
 * Reads Markdown files with YAML frontmatter from a file-vault tier
 * directory and inserts/upserts them into a sqlite-vec-backed memory
 * database.  Conflict resolution: the entry with the most-recent `updated`
 * wins; the loser is archived to a configurable conflicts directory.
 *
 * Usage:
 *   node scripts/memory-import.mjs [options]
 *
 * Options:
 *   --db <path>        Path to the SQLite database (default: from config)
 *   --from <dir>       Directory of Markdown files to import (required)
 *   --conflicts <dir>  Directory for conflict-archived entries (default: conflicts/ under --from's parent)
 *   --dry-run          Preview without modifying the database
 *   --help             Show this help
 *
 * Env:
 *   MEMORY_ROOT        Vault root directory (for config resolution)
 *
 * Exit codes:
 *   0 — success (all imported)
 *   1 — configuration error
 *   2 — I/O or database error
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import matter from "gray-matter";
import { loadMemoryConfig, sqliteDbPaths } from "./_config.mjs";
import { initDB, getEntry, putEntry } from "./_memory-backend.mjs";

// ─── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const val = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };

  return {
    dbPath:     val("--db"),
    fromDir:    val("--from"),
    conflicts:  val("--conflicts"),
    dryRun:     args.includes("--dry-run"),
  };
}

function printHelp() {
  console.log(`
memory-import.mjs — Import file-vault entries into SQLite memory DB

Usage:
  node scripts/memory-import.mjs [options]

Options:
  --db <path>        Path to the SQLite database (default: from opencode.json)
  --from <dir>       Directory of Markdown files to import (required)
  --conflicts <dir>  Directory for conflict-archived files (default: conflicts/
                     under the parent of --from)
  --dry-run          Preview without modifying the database
  --help             Show this help

Env:
  MEMORY_ROOT        Vault root directory (for config resolution — not needed
                     when --db and --conflicts are both provided explicitly)

Files are matched by the frontmatter 'name' field.  On name collision, the
entry with the more recent 'updated' timestamp wins.  The loser is copied
to the conflicts directory with a .{timestamp} suffix.

Exit codes:
  0 — success
  1 — configuration error
  2 — I/O or database error
`);
}

// ─── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ["name", "tier", "kind", "created"];
const VALID_TIERS = new Set(["short", "mid", "long", "frequent", "forgettable"]);
const VALID_KINDS = new Set(["working", "episodic", "semantic", "procedural"]);

function validateEntry(fm, filePath) {
  const missing = REQUIRED_FIELDS.filter(f => fm[f] == null || fm[f] === "");
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(", ")}` };
  }

  if (!VALID_TIERS.has(fm.tier)) {
    return { valid: false, error: `Invalid tier "${fm.tier}". Must be one of: ${[...VALID_TIERS].join(", ")}` };
  }

  if (!VALID_KINDS.has(fm.kind)) {
    return { valid: false, error: `Invalid kind "${fm.kind}". Must be one of: ${[...VALID_KINDS].join(", ")}` };
  }

  return { valid: true };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs();

  // --from is required.
  if (!flags.fromDir) {
    console.error("ERROR: --from <dir> is required. Use --help for usage.");
    process.exit(1);
  }

  if (!existsSync(flags.fromDir)) {
    console.error(`ERROR: --from directory not found: ${flags.fromDir}`);
    process.exit(2);
  }

  const fromDir = flags.fromDir;

  // Default conflicts dir: conflicts/ under the parent of --from.
  const conflictsDir = flags.conflicts ?? join(dirname(fromDir), "conflicts");

  // Load config.
  let config;
  try {
    config = loadMemoryConfig();
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  // Determine DB path.
  const dbPaths = sqliteDbPaths(config);
  const dbPath = flags.dbPath ?? (dbPaths.length > 0 ? dbPaths[0] : null);

  if (!dbPath) {
    console.error("ERROR: No sqlite-vec database path configured. Provide --db or add a 'memory.backends.<tier>.path' to opencode.json.");
    process.exit(1);
  }

  // Open database (must be done before dry-run checks so we can look up existing entries).
  let db;
  try {
    db = initDB(dbPath, config);
  } catch (err) {
    console.error(`ERROR: Failed to open database: ${err.message}`);
    process.exit(2);
  }

  // Ensure conflicts dir exists.
  if (!existsSync(conflictsDir)) {
    mkdirSync(conflictsDir, { recursive: true });
  }

  // ─── Scan and process files ─────────────────────────────────────────────────

  const files = readdirSync(fromDir)
    .filter(f => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("No .md files found in", fromDir);
    cleanExit(db, 0);
  }

  if (flags.dryRun) {
    console.log(`[DRY RUN] Would process ${files.length} file(s) from ${fromDir}`);
    console.log(`[DRY RUN] Database: ${dbPath}`);
    console.log(`[DRY RUN] Conflicts dir: ${conflictsDir}`);
    console.log("");
  } else {
    console.log(`Processing ${files.length} file(s) from ${fromDir}`);
  }

  let imported = 0;
  let skipped = 0;
  let conflicted = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = join(fromDir, file);

    // Read and parse frontmatter.
    let parsed;
    try {
      const raw = readFileSync(filePath, "utf-8");
      parsed = matter(raw);
    } catch (err) {
      console.error(`  ✗ ${file}: parse error — ${err.message}`);
      errors++;
      continue;
    }

    const fm = parsed.data;

    // Validate.
    const validation = validateEntry(fm, filePath);
    if (!validation.valid) {
      console.error(`  ✗ ${file}: ${validation.error}`);
      errors++;
      continue;
    }

    const entryName = fm.name;

    /**
     * YAML (via js-yaml, used by gray-matter) auto-parses ISO-8601 values
     * like "2026-05-25" as Date objects.  Convert them back to ISO date
     * strings so better-sqlite3 can bind them.
     */
    const toDateStr = (v) => {
      if (v == null) return null;
      if (v instanceof Date) return v.toISOString().split("T")[0];
      return String(v);
    };

    // Build the entry object for putEntry.
    const entry = {
      name:            entryName,
      tier:            fm.tier,
      kind:            fm.kind,
      body:            parsed.content.trim(),
      description:     fm.description ?? "",
      tags:            fm.tags ?? [],
      links:           fm.links ?? [],
      importance:      fm.importance ?? 3,
      created:         toDateStr(fm.created),
      updated:         toDateStr(fm.updated ?? fm.created),
      last_accessed:   toDateStr(fm.last_accessed ?? fm.updated ?? fm.created),
      access_count:    fm.access_count ?? 0,
      embed_model_id:  fm.embed_model_id ?? "",
      embed_model_ver: fm.embed_model_ver ?? "",
    };

    // Check for existing entry (conflict detection).
    const existing = getEntry(db, entryName);

    if (existing) {
      const existingUpdated = existing.updated ?? "";
      const incomingUpdated = entry.updated ?? "";

      if (incomingUpdated < existingUpdated) {
        // Incoming is strictly older — archive to conflicts/.
        const ts = incomingUpdated.replace(/[^0-9]/g, "") || Date.now();
        const conflictFile = join(conflictsDir, `${entryName}.${ts}.md`);

        if (flags.dryRun) {
          console.log(`  ~ ${file}: conflict (older than DB), would archive to ${conflictFile}`);
        } else {
          copyFileSync(filePath, conflictFile);
          console.log(`  ~ ${file}: conflict (older than DB), archived to ${basename(conflictFile)}`);
        }

        conflicted++;
        continue;
      }

      // Incoming is newer — proceed to replace.
    }

    // Insert or replace.
    if (flags.dryRun) {
      const action = existing ? "UPDATE" : "INSERT";
      console.log(`  → ${file}: would ${action} entry "${entryName}"`);
      imported++;
    } else {
      try {
        putEntry(db, entry);
        console.log(`  ✓ ${file}: ${existing ? "updated" : "imported"} entry "${entryName}"`);
        imported++;
      } catch (err) {
        console.error(`  ✗ ${file}: DB write failed — ${err.message}`);
        errors++;
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  console.log("");
  if (flags.dryRun) {
    console.log(`[DRY RUN] Summary: ${imported} would-be processed, ${conflicted} conflicts, ${errors} errors, ${skipped} skipped`);
  } else {
    console.log(`Summary: ${imported} imported, ${conflicted} conflicts archived, ${errors} errors, ${skipped} skipped`);
  }

  cleanExit(db, errors > 0 ? 2 : 0);
}

function cleanExit(db, code) {
  db.close();
  process.exit(code);
}

main();
