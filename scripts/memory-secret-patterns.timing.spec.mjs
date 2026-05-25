/**
 * memory-secret-patterns.timing.spec.mjs — Linear-time timing assertions
 *
 * Verifies that each pattern scan completes in < 50 ms on a 1 MB
 * pathological input (no catastrophic backtracking).
 *
 * Run:   node --test scripts/memory-secret-patterns.timing.spec.mjs
 *
 * Uses node:test and node:assert. No test framework dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PATTERNS, scan } from "./memory-secret-patterns.mjs";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Target size in bytes for pathological input */
const TARGET_SIZE = 1_000_000; // 1 MB

/** Per-pattern time budget in milliseconds */
const PER_PATTERN_BUDGET_MS = 50;

// ─── Pathological input generators ────────────────────────────────────────────

/**
 * Generate a 1 MB string that is adversarial for regex engines:
 * long runs of 'a' to force backtracking in poorly-anchored patterns,
 * mixed with near-miss patterns that almost match.
 */
function generatePathologicalInput() {
  const parts = [];

  // Large block of repeating safe text
  parts.push("a".repeat(500_000));

  // Near-miss: almost keys but too short
  for (let i = 0; i < 10_000; i++) {
    parts.push("key = abcd1234\n");
  }

  // Near-miss: AKIA-like but truncated
  for (let i = 0; i < 5_000; i++) {
    parts.push("AKIA" + "A".repeat(10) + "\n");
  }

  // Near-miss: eyJ-like fragments
  for (let i = 0; i < 5_000; i++) {
    parts.push("eyJ" + "a".repeat(30) + "\n");
  }

  // Near-miss: number patterns that almost look like SSN / credit card
  for (let i = 0; i < 5_000; i++) {
    parts.push(`${i % 900 + 100}-${(i * 7) % 100}-${(i * 13) % 10000}\n`);
  }

  // Fill remainder with non-matching garbage
  const currentLen = parts.reduce((acc, p) => acc + Buffer.byteLength(p, "utf-8"), 0);
  if (currentLen < TARGET_SIZE) {
    const remaining = TARGET_SIZE - currentLen;
    parts.push("x".repeat(remaining));
  }

  return parts.join("");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Pattern timing — linear-time guarantee", () => {
  const pathologicalText = generatePathologicalInput();

  it("pathological input is at least 1 MB", () => {
    const byteLen = Buffer.byteLength(pathologicalText, "utf-8");
    assert.ok(
      byteLen >= TARGET_SIZE,
      `Expected ≥ ${TARGET_SIZE} bytes, got ${byteLen}`,
    );
  });

  // Test each pattern individually on the pathological input
  for (const pattern of PATTERNS) {
    it(`${pattern.id} completes in < ${PER_PATTERN_BUDGET_MS} ms on 1 MB input`, () => {
      const start = performance.now();
      const flags = pattern.regex.global ? pattern.regex.flags : pattern.regex.flags + "g";
      const regex = new RegExp(pattern.regex.source, flags);
      regex.test(pathologicalText);
      const elapsed = performance.now() - start;

      assert.ok(
        elapsed < PER_PATTERN_BUDGET_MS,
        `${pattern.id} took ${elapsed.toFixed(2)} ms (budget: ${PER_PATTERN_BUDGET_MS} ms)`,
      );
    });
  }

  // Test the full scan() function (all block patterns) on 1 MB input
  it("scan() (all block patterns) completes in < " + (PATTERNS.length * PER_PATTERN_BUDGET_MS) + " ms on 1 MB input", () => {
    const start = performance.now();
    const results = scan(pathologicalText, { strict: false });
    const elapsed = performance.now() - start;
    const budget = PATTERNS.length * PER_PATTERN_BUDGET_MS;

    assert.ok(
      elapsed < budget,
      `scan() took ${elapsed.toFixed(2)} ms (budget: ${budget} ms for ${PATTERNS.length} patterns)`,
    );
  });

  it("scan(strict=true) completes in < " + (PATTERNS.length * PER_PATTERN_BUDGET_MS) + " ms on 1 MB input", () => {
    const start = performance.now();
    const results = scan(pathologicalText, { strict: true });
    const elapsed = performance.now() - start;
    const budget = PATTERNS.length * PER_PATTERN_BUDGET_MS;

    assert.ok(
      elapsed < budget,
      `scan(strict=true) took ${elapsed.toFixed(2)} ms (budget: ${budget} ms for ${PATTERNS.length} patterns)`,
    );
  });
});
