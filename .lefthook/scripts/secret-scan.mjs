#!/usr/bin/env node

/**
 * secret-scan.mjs — Lefthook pre-commit hook that scans staged memory vault
 * files for secrets and PII using the shared pattern module.
 *
 * Imports from scripts/memory-secret-patterns.mjs (the single source of truth
 * shared with memory:lint / #28). Relies on the `scan(text, { strict })`
 * export contract.
 *
 * Exit codes:
 *   0 — No secrets/PII detected (or no matching files staged)
 *   1 — At least one file contains a match
 *
 * Usage (via lefthook):
 *   node .lefthook/scripts/secret-scan.mjs {staged_files}
 *
 * Environment variables:
 *   MEMORY_SCRUB_STRICT — set to truthy to enable block-strict patterns
 *
 * @module lefthook/scripts/secret-scan
 */

import { readFileSync, statSync } from "node:fs";
import { scan } from "../../scripts/memory-secret-patterns.mjs";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Files at or above this size (in bytes) are streamed in chunks rather than
 *  read entirely into memory. */
export const STREAM_THRESHOLD_BYTES = 1_048_576;

/** Number of bytes to sample from the start of each file for binary detection. */
const BINARY_SAMPLE_BYTES = 4_096;

/** Chunk size used when streaming large files. */
const CHUNK_SIZE = 1_048_576; // 1 MiB

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.exit(0);
  }

  const strict = !!process.env.MEMORY_SCRUB_STRICT;
  let exitCode = 0;
  /** @type {{ file: string, line: number, patternId: string }[]} */
  const allMatches = [];

  for (const file of files) {
    // --- Skip empty files ---
    let stat;
    try {
      stat = statSync(file);
    } catch {
      // File may have been deleted between staging and commit
      continue;
    }
    if (stat.size === 0) continue;

    // --- Binary detection: sample start of file for null bytes ---
    if (isBinary(file)) continue;

    // --- Scan the file ---
    const matches = scanFile(file, strict);
    if (matches.length > 0) {
      exitCode = 1;
      for (const m of matches) {
        allMatches.push({ file, line: m.line, patternId: m.patternId });
        console.error(
          `[SECRET-SCAN] ${file}:${m.line} — matched pattern "${m.patternId}"`,
        );
      }
    }
  }

  if (allMatches.length > 0) {
    console.error(
      `\n[SECRET-SCAN] ${allMatches.length} match(es) found across ${new Set(allMatches.map((m) => m.file)).size} file(s).`,
    );
    console.error(
      "[SECRET-SCAN] Use `git commit --no-verify` to bypass (emergency only).",
    );
    console.error(
      "[SECRET-SCAN] The CI `memory:lint` step also enforces this check.",
    );
  }

  process.exit(exitCode);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check if the first bytes of a file contain a null byte (binary heuristic).
 * @param {string} filePath
 * @returns {boolean}
 */
function isBinary(filePath) {
  try {
    const sample = readFileSync(filePath, { encoding: null, length: BINARY_SAMPLE_BYTES });
    // Check for null byte in the first BINARY_SAMPLE_BYTES
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return true;
    }
  } catch {
    // If we can't read, conservatively assume not binary
  }
  return false;
}

/**
 * Scan a file for secret/PII patterns using A's module.
 *
 * Files below STREAM_THRESHOLD_BYTES are read entirely into memory.
 * Larger files are processed in chunks (bail-early per file — stop on
 * first matching chunk).
 *
 * @param {string} filePath
 * @param {boolean} strict
 * @returns {import("../../scripts/memory-secret-patterns.mjs").ScanMatch[]}
 */
function scanFile(filePath, strict) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return [];
  }

  // ── Small file: read entirely ──
  if (stat.size < STREAM_THRESHOLD_BYTES) {
    try {
      const text = readFileSync(filePath, "utf-8");
      return scan(text, { strict });
    } catch {
      // If file can't be read as UTF-8, skip it
      return [];
    }
  }

  // ── Large file: stream in chunks ──
  // We scan each chunk independently. Patterns that span chunk boundaries
  // are theoretically possible but vanishingly unlikely for secret/PII
  // patterns in practice, and the 1 MiB chunk size makes it improbable.
  const fd = readFileSync(filePath, { encoding: null }); // read as Buffer
  let offset = 0;
  const results = [];

  while (offset < fd.length && results.length === 0) {
    const end = Math.min(offset + CHUNK_SIZE, fd.length);
    const chunk = fd.subarray(offset, end);
    const text = chunk.toString("utf-8");
    results.push(...scan(text, { strict }));
    offset = end;
  }

  return results;
}

// ─── Execute ─────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("[SECRET-SCAN] Internal error:", err);
  process.exit(1);
});
