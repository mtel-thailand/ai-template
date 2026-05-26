#!/usr/bin/env node

/**
 * memory-gc.mjs — Agent Memory Garbage Collector (Phase 4: SQLite-tier)
 *
 * Operates over the file-vault tiers (short, forgettable) and SQLite-vec
 * tiers (mid, long, frequent) per opencode.json memory.backends.* dispatch.
 *
 * Phases (per ADR-0003 §"memory:gc semantics under SQLite"):
 *   1 Discover & Parse — walk .md vault + list rows from sqlite-vec DBs
 *   2 Validate         — uniform Zod schema across both sources
 *   3 Enforce Budgets  — per-tier max entries
 *   4 Evict & GC       — TTL-based eviction (file unlink or backend.delete)
 *   5 Orphan Repair    — re-embed entries with missing entries_vec rows
 *                        (degrades to log-only if embedder unavailable)
 *   6 Write Back       — atomic rewrite (file) or implicit WAL commit (sqlite)
 *   7 Vacuum           — wal_checkpoint(TRUNCATE) + VACUUM if freelist > 25%
 *
 * Usage:
 *   node scripts/memory-gc.mjs              # full run with writes
 *   node scripts/memory-gc.mjs --validate-only  # phases 1-2 (file vault only)
 *   node scripts/memory-gc.mjs --dry-run    # all phases, no destructive writes
 *
 * Env:
 *   MEMORY_ROOT       Override the vault directory. Falls back to
 *                     .opencode/memory/ relative to cwd. When set to a
 *                     non-default value (test isolation per #21), SQLite
 *                     backends are skipped — only the file vault is touched.
 *   OPENCODE_CONFIG   Override opencode.json path (see scripts/_config.mjs).
 *
 * Exit codes:
 *   0 success / 1 schema validation failure / 2 budget violations / 3 I/O error
 */

import {
  readFileSync, writeFileSync, readdirSync, renameSync, existsSync,
} from "node:fs";
import { join, relative, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import matter from "gray-matter";
import { z } from "zod";

import { loadMemoryConfig, sqliteTiers, sqliteDbPaths, isMemoryEnabled } from "./_config.mjs";

// ─── Schema (verbatim from spec §3) ────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO 8601 date YYYY-MM-DD");

const noteSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case slug"),
  description: z.string().min(1),
  tier: z.enum(["short", "mid", "long", "frequent", "forgettable"]),
  kind: z.enum(["working", "episodic", "semantic", "procedural"]),
  created: isoDate,
  updated: isoDate,
  last_accessed: isoDate,
  access_count: z.number().int().nonnegative(),
  importance: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
  links: z.array(z.string())
}).strict();

const TIER_BUDGETS = {
  short:      Infinity,
  mid:        50,
  long:       200,
  frequent:   20,
  forgettable: Infinity,
};

const DEFAULT_MEMORY_ROOT = join(process.cwd(), ".opencode", "memory");
const MEMORY_ROOT = process.env.MEMORY_ROOT || DEFAULT_MEMORY_ROOT;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    validateOnly: args.includes("--validate-only"),
    dryRun: args.includes("--dry-run"),
  };
}

function* walkMdFiles(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) { yield* walkMdFiles(fullPath); }
    else if (entry.isFile() && entry.name.endsWith(".md")) { yield fullPath; }
  }
}

function atomicWrite(targetPath, content) {
  const tmpName = `.tmp-${randomBytes(6).toString("hex")}-${Date.now()}`;
  const tmpPath = join(dirname(targetPath), tmpName);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, targetPath);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(isoA, isoB) {
  return Math.round((parseDate(isoB) - parseDate(isoA)) / (1000 * 60 * 60 * 24));
}

function safeJsonArray(s) {
  try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// ─── Backend init (with test-isolation safeguard) ──────────────────────────

async function initBackends({ validateOnly }) {
  // Test-isolation: when MEMORY_ROOT points away from the project default,
  // skip SQLite entirely so tests never touch the developer's real memory.db.
  const isTestMode = process.env.MEMORY_ROOT && MEMORY_ROOT !== DEFAULT_MEMORY_ROOT;

  // Per ADR-0006: the memory subsystem ships disabled in the OSS template
  // release. Surface a clear one-line notice naming the runbook so the
  // operator knows which mode they are in. File-vault GC continues to work
  // regardless (CI's validate-memory job depends on this).
  if (!isMemoryEnabled() && !isTestMode) {
    console.log("memory subsystem disabled in opencode.json — running file-vault GC only (see docs/runbooks/enable-memory.md)");
  }

  let config = null;
  try { config = loadMemoryConfig(); }
  catch (err) { console.warn(`memory config not loadable, file-only mode: ${err.message}`); }

  if (!config || isTestMode || validateOnly) {
    return { config, dbs: new Map(), sqliteTierSet: new Set(), backendModule: null };
  }

  const sqliteTierSet = new Set(sqliteTiers(config));
  if (sqliteTierSet.size === 0) {
    return { config, dbs: new Map(), sqliteTierSet: new Set(), backendModule: null };
  }

  let backendModule;
  try { backendModule = await import("./_memory-backend.mjs"); }
  catch (err) {
    console.warn(`SQLite backend module not loadable, file-only mode: ${err.message}`);
    return { config, dbs: new Map(), sqliteTierSet: new Set(), backendModule: null };
  }

  const dbs = new Map();
  for (const dbPath of sqliteDbPaths(config)) {
    if (!existsSync(dbPath)) {
      console.warn(`SQLite DB not present at ${dbPath} — skipping sqlite-vec tiers for this run`);
      continue;
    }
    try {
      const db = backendModule.initDB(dbPath, config);
      dbs.set(dbPath, db);
    } catch (err) {
      console.warn(`Failed to open SQLite DB at ${dbPath}: ${err.message}`);
    }
  }

  const effectiveTierSet = dbs.size > 0 ? sqliteTierSet : new Set();
  return { config, dbs, sqliteTierSet: effectiveTierSet, backendModule };
}

function closeBackends(ctx) {
  if (!ctx?.dbs) return;
  for (const db of ctx.dbs.values()) {
    try { db.close(); } catch { /* ignore */ }
  }
}

// ─── Phase 1: Discover & Parse ───────────────────────────────────────────

function phase1DiscoverFile() {
  const entries = [];
  const errors = [];
  for (const filePath of walkMdFiles(MEMORY_ROOT)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      entries.push({
        source: "file",
        filePath,
        frontmatter: parsed.data,
        body: parsed.content,
        parsed: null,
        error: null,
      });
    } catch (err) {
      errors.push(`Parse error: ${relative(process.cwd(), filePath)} — ${err.message}`);
    }
  }
  return { entries, errors };
}

function phase1DiscoverSqlite(ctx) {
  const { config, dbs, sqliteTierSet, backendModule } = ctx;
  const entries = [];
  if (!config || !backendModule || sqliteTierSet.size === 0) return entries;

  const tiers = [...sqliteTierSet];
  for (const [dbPath, db] of dbs) {
    let rows;
    try { rows = backendModule.listEntries(db, { tier: tiers }); }
    catch (err) {
      console.warn(`listEntries failed on ${dbPath}: ${err.message}`);
      continue;
    }
    for (const row of rows) {
      const frontmatter = {
        name: row.name,
        description: row.description,
        tier: row.tier,
        kind: row.kind,
        created: row.created,
        updated: row.updated,
        last_accessed: row.last_accessed,
        access_count: row.access_count,
        importance: row.importance,
        tags: safeJsonArray(row.tags),
        links: safeJsonArray(row.links),
      };
      entries.push({
        source: "sqlite",
        dbPath,
        rowId: row.id,
        name: row.name,
        body: row.body,
        frontmatter,
        parsed: null,
        error: null,
      });
    }
  }
  return entries;
}

function phase1DiscoverAndParse(ctx) {
  const fileResult = phase1DiscoverFile();
  const sqliteEntries = phase1DiscoverSqlite(ctx);
  return {
    entries: [...fileResult.entries, ...sqliteEntries],
    errors: fileResult.errors,
  };
}

// ─── Phase 2: Validate ───────────────────────────────────────────────────

function phase2Validate(entries) {
  let validCount = 0;
  let invalidCount = 0;
  for (const entry of entries) {
    const result = noteSchema.safeParse(entry.frontmatter);
    if (result.success) { entry.parsed = result.data; validCount++; }
    else { entry.error = result.error; invalidCount++; }
  }
  return { validCount, invalidCount };
}

// ─── Phase 3: Enforce Budgets ────────────────────────────────────────────

function phase3EnforceBudgets(entries) {
  const byTier = new Map();
  for (const entry of entries) {
    if (!entry.parsed) continue;
    const tier = entry.parsed.tier;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(entry);
  }
  const violations = {};
  for (const [tier, tierEntries] of byTier) {
    const budget = TIER_BUDGETS[tier];
    if (budget === Infinity) continue;
    if (tierEntries.length > budget) {
      violations[tier] = {
        count: tierEntries.length,
        budget,
        over: tierEntries.length - budget,
        entries: tierEntries,
      };
    }
  }
  return violations;
}

// ─── Phase 4: Evict & GC (TTL-based) ─────────────────────────────────────

function phase4EvictAndGC(entries) {
  const today = todayISO();
  const evictions = [];
  for (const entry of entries) {
    if (!entry.parsed) continue;
    const { tier, last_accessed } = entry.parsed;
    const daysSinceAccess = daysBetween(last_accessed, today);
    if (tier === "mid" && daysSinceAccess > 30) {
      evictions.push({ entry, reason: `mid-tier TTL exceeded: ${daysSinceAccess} days since last_access (max 30)` });
    }
    if (tier === "forgettable" && daysSinceAccess > 7) {
      evictions.push({ entry, reason: `forgettable-tier TTL exceeded: ${daysSinceAccess} days since last_access (max 7)` });
    }
  }
  return evictions;
}

// ─── Phase 5: Orphan Repair (sqlite-only, before write-back) ────────────

/**
 * Find rows in `entries` with no matching `entries_vec` row and try to
 * re-embed them. If the embedder is unavailable (package missing, model
 * load failure, or per-row embed() throw), degrade to lexical-only: log
 * warnings, mark the row for later reindex (no destructive change), and
 * continue. See docs/runbooks/memory-embedder-load-failure.md.
 *
 * @param {object}  ctx     From initBackends()
 * @param {boolean} dryRun  When true, only scan + report; no DB writes.
 * @param {object} [opts]
 * @param {Function} [opts.embedderFactory]  Override for testing — should
 *   return Promise<Embedder> or throw. Defaults to dynamic-import of
 *   ./_embedder.mjs.
 */
async function phase5OrphanRepair(ctx, dryRun, opts = {}) {
  const result = {
    found: 0,
    repaired: 0,
    skipped: 0,
    warnings: [],
    embedderAvailable: false,
  };
  const { config, dbs, sqliteTierSet, backendModule } = ctx;
  if (!backendModule || sqliteTierSet.size === 0 || dbs.size === 0) return result;

  // Scan for orphans (entries row without a corresponding entries_vec row).
  const orphansByDb = new Map();
  const tiers = [...sqliteTierSet];
  const tierPlaceholders = tiers.map(() => "?").join(",");
  for (const [dbPath, db] of dbs) {
    let rows;
    try {
      rows = db.prepare(
        `SELECT e.id, e.name, e.body, e.description, e.tier
           FROM entries e
           LEFT JOIN entries_vec v ON v.id = e.id
          WHERE v.id IS NULL AND e.tier IN (${tierPlaceholders})`
      ).all(...tiers);
    } catch (err) {
      result.warnings.push(`orphan-scan failed on ${dbPath}: ${err.message}`);
      continue;
    }
    if (rows.length > 0) orphansByDb.set(dbPath, rows);
    result.found += rows.length;
  }

  if (result.found === 0 || dryRun) return result;

  // Load the embedder; failure degrades the whole orphan-repair phase.
  let embedder = null;
  const factory = opts.embedderFactory ?? (async () => {
    const mod = await import("./_embedder.mjs");
    return mod.createEmbedder(config.embedder);
  });
  try { embedder = await factory(); result.embedderAvailable = true; }
  catch (err) {
    result.warnings.push(`Embedder unavailable; orphan-repair degrades to lexical-only: ${err.message}`);
    result.skipped = result.found;
    for (const [dbPath, rows] of orphansByDb) {
      for (const row of rows) {
        result.warnings.push(`orphan ${row.name} (${dbPath}): vec0 row missing, embedder unavailable — flagged for reindex`);
      }
    }
    return result;
  }

  // Repair each orphan. Per-row embed() failure is tolerated.
  const today = todayISO();
  for (const [dbPath, rows] of orphansByDb) {
    const db = dbs.get(dbPath);
    for (const row of rows) {
      let vec;
      try {
        const text = `${row.name}\n\n${row.description}\n\n${row.body}`;
        [vec] = await embedder.embed([text]);
      } catch (embedErr) {
        result.warnings.push(`embed failed for ${row.name} (${dbPath}): ${embedErr.message} — flagged for reindex`);
        result.skipped++;
        continue;
      }
      try {
        db.prepare("DELETE FROM entries_vec WHERE id = ?").run(row.id);
        db.prepare("INSERT INTO entries_vec(id, embedding) VALUES (?, ?)")
          .run(row.id, new Float32Array(vec));
        db.prepare(
          "UPDATE entries SET embed_model_id = ?, embed_model_ver = ?, updated = ? WHERE id = ?"
        ).run(embedder.modelId, "1", today, row.id);
        result.repaired++;
      } catch (writeErr) {
        result.warnings.push(`orphan write failed for ${row.name} (${dbPath}): ${writeErr.message}`);
        result.skipped++;
      }
    }
  }

  return result;
}

// ─── Phase 6: Write Back ─────────────────────────────────────────────────

function phase6WriteBack(entries, evictions, ctx, dryRun) {
  let fileWritten = 0;
  let fileRemoved = 0;
  let sqliteDeleted = 0;

  for (const entry of entries) {
    if (!entry.parsed) continue;
    if (entry.source !== "file") continue;
    const doc = matter.stringify(entry.body, entry.parsed);
    if (!dryRun) {
      try { atomicWrite(entry.filePath, doc); }
      catch (err) { console.warn(`Write failed for ${entry.filePath}: ${err.message}`); continue; }
    }
    fileWritten++;
  }

  for (const { entry } of evictions) {
    if (!entry.parsed) continue;
    if (entry.source === "file") {
      if (entry.parsed.tier === "forgettable") {
        if (!dryRun) {
          try {
            writeFileSync(entry.filePath, "");
            renameSync(entry.filePath, entry.filePath + ".evicted");
          } catch { /* best effort */ }
        }
        fileRemoved++;
      }
    } else if (entry.source === "sqlite") {
      const db = ctx.dbs.get(entry.dbPath);
      if (!db || !ctx.backendModule) continue;
      if (!dryRun) {
        try { ctx.backendModule.deleteEntry(db, entry.name); }
        catch (err) { console.warn(`SQLite delete failed for ${entry.name}: ${err.message}`); continue; }
      }
      sqliteDeleted++;
    }
  }

  return { fileWritten, fileRemoved, sqliteDeleted };
}

// ─── Phase 7: Vacuum (sqlite-only, after write-back) ────────────────────

function phase7Vacuum(ctx, dryRun) {
  const result = [];
  if (!ctx.backendModule || ctx.dbs.size === 0) return result;
  if (dryRun) return result;
  for (const [dbPath, db] of ctx.dbs) {
    try {
      const r = ctx.backendModule.vacuumIfNeeded(db);
      result.push({ dbPath, ...r });
    } catch (err) {
      result.push({ dbPath, error: err.message });
    }
  }
  return result;
}

// ─── Report ──────────────────────────────────────────────────────────────

function printReport({ phase1, phase2, phase3, phase4, phase5, phase6, phase7, flags, ctx }) {
  console.log("═══════════════════════════════════════════");
  console.log("  Memory GC Report");
  console.log("═══════════════════════════════════════════");
  console.log(`  Mode:             ${flags.dryRun ? "DRY RUN (no writes)" : flags.validateOnly ? "VALIDATE ONLY" : "FULL RUN"}`);
  const sqliteTierList = [...(ctx.sqliteTierSet ?? [])];
  console.log(`  Backends:         file (short, forgettable) + sqlite-vec (${sqliteTierList.length ? sqliteTierList.join(", ") : "none"})`);
  console.log(`  Files+rows found: ${phase1.entries.length}`);
  if (phase1.errors.length > 0) {
    console.log(`  Parse errors:     ${phase1.errors.length}`);
    for (const err of phase1.errors) console.log(`    ✖ ${err}`);
  }
  console.log(`  Valid:            ${phase2.validCount}`);
  console.log(`  Invalid:          ${phase2.invalidCount}`);
  if (phase2.invalidCount > 0) {
    for (const entry of phase1.entries) {
      if (entry.error) {
        const loc = entry.source === "file"
          ? relative(process.cwd(), entry.filePath)
          : `sqlite:${entry.dbPath}#${entry.name}`;
        console.log(`    ✖ ${loc}`);
        for (const issue of entry.error.issues) {
          console.log(`      - ${issue.path.join(".")}: ${issue.message}`);
        }
      }
    }
  }

  const budgetKeys = Object.keys(phase3);
  console.log(`  Budget violations: ${budgetKeys.length}`);
  for (const tier of budgetKeys) {
    const v = phase3[tier];
    console.log(`    ✖ ${tier}: ${v.count} entries (budget: ${v.budget}, over by ${v.over})`);
  }

  console.log(`  Evictions:    ${phase4.length}`);
  for (const ev of phase4) {
    const loc = ev.entry.source === "file"
      ? relative(process.cwd(), ev.entry.filePath)
      : `sqlite:${ev.entry.dbPath}#${ev.entry.name}`;
    console.log(`    → ${loc} — ${ev.reason}`);
  }

  if (phase5) {
    console.log(`  Orphans found:    ${phase5.found}`);
    console.log(`  Orphans repaired: ${phase5.repaired}`);
    console.log(`  Orphans skipped:  ${phase5.skipped}`);
    console.log(`  Embedder:         ${phase5.embedderAvailable ? "available" : "unavailable (lexical-only degrade)"}`);
    for (const w of phase5.warnings) console.log(`    ⚠ ${w}`);
  }

  if (!flags.validateOnly && !flags.dryRun && phase6) {
    console.log(`  Files written:    ${phase6.fileWritten}`);
    console.log(`  Files removed:    ${phase6.fileRemoved}`);
    console.log(`  SQLite deleted:   ${phase6.sqliteDeleted}`);
  } else if (flags.dryRun) {
    console.log("  (dry-run — no files written or removed)");
  } else if (flags.validateOnly) {
    console.log("  (validate-only — no files written or removed)");
  }

  if (phase7 && phase7.length) {
    for (const v of phase7) {
      if (v.error) {
        console.log(`  Vacuum (${v.dbPath}): ✖ ${v.error}`);
      } else {
        console.log(`  Vacuum (${v.dbPath}): ${v.vacuuumed ? "ran" : "skipped"} (freelist ${(v.freelistPct * 100).toFixed(1)}%, pages ${v.pageCount})`);
      }
    }
  }
  console.log("═══════════════════════════════════════════");
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const ctx = await initBackends(flags);

  const phase1 = phase1DiscoverAndParse(ctx);
  const phase2 = phase2Validate(phase1.entries);

  if (flags.validateOnly) {
    printReport({ phase1, phase2, phase3: {}, phase4: [], phase5: null, phase6: null, phase7: [], flags, ctx });
    closeBackends(ctx);
    if (phase1.errors.length > 0 || phase2.invalidCount > 0) {
      console.error("\n❌ Validation failed.");
      process.exit(1);
    }
    console.log("\n✅ Validation passed.");
    process.exit(0);
  }

  const phase3 = phase3EnforceBudgets(phase1.entries);
  const hasViolations = Object.keys(phase3).length > 0;
  const phase4 = phase4EvictAndGC(phase1.entries);
  const phase5 = await phase5OrphanRepair(ctx, flags.dryRun);
  const phase6 = phase6WriteBack(phase1.entries, phase4, ctx, flags.dryRun);
  const phase7 = phase7Vacuum(ctx, flags.dryRun);

  printReport({ phase1, phase2, phase3, phase4, phase5, phase6, phase7, flags, ctx });
  closeBackends(ctx);

  if (hasViolations) { console.error("\n❌ Budget violations detected."); process.exit(2); }
  if (phase2.invalidCount > 0) { console.error("\n❌ Validation errors present — fix before next run."); process.exit(1); }
  console.log("\n✅ Memory GC complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ memory-gc crashed: ${err.message}`);
  console.error(err.stack);
  process.exit(3);
});
