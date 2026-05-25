#!/usr/bin/env node

/**
 * memory-gc.mjs — Agent Memory Garbage Collector
 *
 * 5-phase script that validates, budgets, evicts, and writes back memory
 * vault entries under .opencode/memory/ (or $MEMORY_ROOT if set).
 *
 * Usage:
 *   node scripts/memory-gc.mjs              # full run with writes
 *   node scripts/memory-gc.mjs --validate-only  # phases 1–2 only, exit 1 on failure
 *   node scripts/memory-gc.mjs --dry-run        # all phases, no writes
 *
 * Env:
 *   MEMORY_ROOT  Override the vault directory (used by tests).
 *                Falls back to .opencode/memory/ relative to cwd.
 *
 * Exit codes:
 *   0 — success (all valid, within budgets; empty vault is OK)
 *   1 — schema validation failure (only with --validate-only)
 *   2 — budget violations detected (entries exceed tier limits)
 *   3 — I/O error or unexpected internal failure
 */

import { readFileSync, writeFileSync, readdirSync, statSync, renameSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import matter from "gray-matter";
import { z } from "zod";

// ─── Schema (verbatim from spec §3) ───────────────────────────────────

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

// ─── Tier budgets (max entries) ──────────────────────────────────────────

const TIER_BUDGETS = {
  short:      Infinity,  // session-scoped, budget is KB-based
  mid:        50,
  long:       200,
  frequent:   20,
  forgettable: Infinity, // unbounded but TTL'd
};

// ─── Tier directory mapping ─────────────────────────────────────────────────

const TIER_DIRS = {
  short:      "short",
  mid:        "mid",
  long:       "long",
  frequent:   "frequent",
  forgettable: "forgettable",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MEMORY_ROOT = process.env.MEMORY_ROOT
  ? process.env.MEMORY_ROOT
  : join(process.cwd(), ".opencode", "memory");

/**
 * Parse CLI flags from argv.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    validateOnly: args.includes("--validate-only"),
    dryRun: args.includes("--dry-run"),
  };
}

/**
 * Walk a directory recursively, yielding relative file paths for .md files.
 */
function* walkMdFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // directory does not exist
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMdFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield fullPath;
    }
  }
}

/**
 * Atomic write: write to temp file, then rename over target.
 */
function atomicWrite(targetPath, content) {
  const tmpName = `.tmp-${randomBytes(6).toString("hex")}-${Date.now()}`;
  const tmpPath = join(dirname(targetPath), tmpName);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, targetPath);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(isoA, isoB) {
  const a = parseDate(isoA);
  const b = parseDate(isoB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ─── Phase 1: Discover & Parse ────────────────────────────────────────────

function phase1DiscoverAndParse() {
  const entries = [];
  const errors = [];

  for (const filePath of walkMdFiles(MEMORY_ROOT)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      entries.push({
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

// ─── Phase 2: Validate ──────────────────────────────────────────────────────────

function phase2Validate(entries) {
  let validCount = 0;
  let invalidCount = 0;

  for (const entry of entries) {
    const result = noteSchema.safeParse(entry.frontmatter);
    if (result.success) {
      entry.parsed = result.data;
      entry.error = null;
      validCount++;
    } else {
      entry.error = result.error;
      invalidCount++;
    }
  }

  return { validCount, invalidCount };
}

// ─── Phase 3: Enforce Budgets ─────────────────────────────────────────────────

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

// ─── Phase 4: Evict & GC ────────────────────────────────────────────────────────────

function phase4EvictAndGC(entries) {
  const today = todayISO();
  const evictions = [];

  for (const entry of entries) {
    if (!entry.parsed) continue;
    const { tier, last_accessed } = entry.parsed;
    const daysSinceAccess = daysBetween(last_accessed, today);

    if (tier === "mid" && daysSinceAccess > 30) {
      evictions.push({
        entry,
        reason: `mid-tier TTL exceeded: ${daysSinceAccess} days since last_access (max 30)`,
      });
    }

    if (tier === "forgettable" && daysSinceAccess > 7) {
      evictions.push({
        entry,
        reason: `forgettable-tier TTL exceeded: ${daysSinceAccess} days since last_access (max 7)`,
      });
    }
  }

  return evictions;
}

// ─── Phase 5: Write Back ────────────────────────────────────────────────────────────

function phase5WriteBack(entries, evictions, dryRun) {
  let written = 0;
  let removed = 0;

  for (const entry of entries) {
    if (!entry.parsed) continue;
    const doc = matter.stringify(entry.body, entry.parsed);
    if (!dryRun) {
      atomicWrite(entry.filePath, doc);
    }
    written++;
  }

  for (const { entry } of evictions) {
    if (entry.parsed && entry.parsed.tier === "forgettable") {
      if (!dryRun) {
        try {
          writeFileSync(entry.filePath, "");
          renameSync(entry.filePath, entry.filePath + ".evicted");
        } catch { /* best effort */ }
      }
      removed++;
    }
  }

  return { written, removed };
}

// ─── Report ─────────────────────────────────────────────────────────────────────

function printReport({ phase1, phase2, phase3, phase4, phase5, flags }) {
  console.log("═══════════════════════════════════════════");
  console.log("  Memory GC Report");
  console.log("═══════════════════════════════════════════");
  console.log(`  Mode:         ${flags.dryRun ? "DRY RUN (no writes)" : flags.validateOnly ? "VALIDATE ONLY" : "FULL RUN"}`);
  console.log(`  Files found:  ${phase1.entries.length}`);
  if (phase1.errors.length > 0) {
    console.log(`  Parse errors: ${phase1.errors.length}`);
    for (const err of phase1.errors) {
      console.log(`    ✖ ${err}`);
    }
  }
  console.log(`  Valid:        ${phase2.validCount}`);
  console.log(`  Invalid:      ${phase2.invalidCount}`);
  if (phase2.invalidCount > 0) {
    for (const entry of phase1.entries) {
      if (entry.error) {
        console.log(`    ✖ ${relative(process.cwd(), entry.filePath)}`);
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
    console.log(`    → ${relative(process.cwd(), ev.entry.filePath)} — ${ev.reason}`);
  }

  if (!flags.validateOnly && !flags.dryRun) {
    console.log(`  Files written: ${phase5.written}`);
    console.log(`  Files removed: ${phase5.removed}`);
  } else if (flags.dryRun) {
    console.log("  (dry-run — no files written or removed)");
  } else {
    console.log("  (validate-only — no files written or removed)");
  }
  console.log("═══════════════════════════════════════════");
}

// ─── Main ────────────────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs();

  const phase1 = phase1DiscoverAndParse();
  const phase2 = phase2Validate(phase1.entries);

  if (flags.validateOnly) {
    printReport({
      phase1,
      phase2,
      phase3: {},
      phase4: [],
      phase5: { written: 0, removed: 0 },
      flags,
    });

    // Empty vault is valid (e.g. fresh template clone). Only fail on parse
    // errors or schema invalidation.
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
  const phase5 = phase5WriteBack(phase1.entries, phase4, flags.dryRun);

  printReport({ phase1, phase2, phase3, phase4, phase5, flags });

  if (hasViolations) {
    console.error("\n❌ Budget violations detected.");
    process.exit(2);
  }

  if (phase2.invalidCount > 0) {
    console.error("\n❌ Validation errors present — fix before next run.");
    process.exit(1);
  }

  console.log("\n✅ Memory GC complete.");
  process.exit(0);
}

main();
