/**
 * memory-secret-patterns.spec.mjs — Unit tests for secret/PII scanning module
 *
 * Run:   node --test scripts/memory-secret-patterns.spec.mjs
 *
 * Uses node:test and node:assert. No test framework dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PATTERNS, scan } from "./memory-secret-patterns.mjs";


// ─── Contract tests ────────────────────────────────────────────────────────

describe("PATTERNS export contract", () => {
  it("is a frozen array", () => {
    assert.ok(Array.isArray(PATTERNS));
    assert.throws(() => {
      PATTERNS.pop();
    }, /Cannot.*property.*/);
  });

  it("has at least 17 entries", () => {
    assert.ok(PATTERNS.length >= 17, `Expected ≥ 17 patterns, got ${PATTERNS.length}`);
  });

  it("every entry has the required fields", () => {
    for (const p of PATTERNS) {
      assert.ok(typeof p.id === "string" && p.id.length > 0, `Missing or empty id`);
      assert.ok(["block", "block-strict"].includes(p.severity), `${p.id}: invalid severity`);
      assert.ok(["secret", "pii"].includes(p.category), `${p.id}: invalid category`);
      assert.ok(p.regex instanceof RegExp, `${p.id}: missing regex`);
      assert.ok(typeof p.description === "string", `${p.id}: missing description`);
      assert.ok(Array.isArray(p.examples.positive), `${p.id}: missing positive examples`);
      assert.ok(Array.isArray(p.examples.negative), `${p.id}: missing negative examples`);
    }
  });

  it("has unique ids", () => {
    const ids = PATTERNS.map((p) => p.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, "Duplicate pattern ids found");
  });

  it("has kebab-case ids", () => {
    for (const p of PATTERNS) {
      assert.match(p.id, /^[a-z][a-z0-9-]*$/, `${p.id}: not kebab-case`);
    }
  });
});

// ─── scan() contract tests ────────────────────────────────────────────────

describe("scan() export contract", () => {
  it("is a function", () => {
    assert.equal(typeof scan, "function");
  });

  it("returns an array", () => {
    const result = scan("safe text here");
    assert.ok(Array.isArray(result));
  });

  it("returns empty array for safe input", () => {
    const result = scan("The quick brown fox jumps over the lazy dog.");
    assert.equal(result.length, 0);
  });

  it("each result has the expected shape", () => {
    const awsExample = PATTERNS.find(p => p.id === 'aws-access-key').examples.positive[0];
    const result = scan(`My token is ${awsExample}`);
    assert.ok(result.length > 0);
    for (const r of result) {
      assert.ok(typeof r.patternId === "string");
      assert.ok(Number.isInteger(r.line) && r.line > 0);
      assert.ok(Number.isInteger(r.column) && r.column > 0);
      assert.ok(typeof r.snippet === "string");
    }
  });

  it("reports correct line numbers", () => {
    const awsExample = PATTERNS.find(p => p.id === 'aws-access-key').examples.positive[0];
    const text = `line one\nline two\n${awsExample}\nline four`;
    const result = scan(text);
    const awsMatch = result.find((r) => r.patternId === "aws-access-key");
    assert.ok(awsMatch, "Expected aws-access-key match");
    assert.equal(awsMatch.line, 3);
  });

  it("reports correct column numbers", () => {
    const awsExample = PATTERNS.find(p => p.id === 'aws-access-key').examples.positive[0];
    const text = `  ${awsExample}`;
    const result = scan(text);
    const awsMatch = result.find((r) => r.patternId === "aws-access-key");
    assert.ok(awsMatch, "Expected aws-access-key match");
    assert.equal(awsMatch.column, 3); // 1-indexed, after "  "
  });
});

// ─── Pattern-level positive/negative tests ─────────────────────────────────

describe("pattern positive matches", () => {
  for (const pattern of PATTERNS) {
    for (let i = 0; i < pattern.examples.positive.length; i++) {
      const example = pattern.examples.positive[i];
      it(`${pattern.id} — positive #${i + 1}: ${truncate(example, 40)}`, () => {
        assert.ok(
          pattern.regex.test(example),
          `${pattern.id} regex should match "${truncate(example, 60)}"`,
        );
      });
    }
  }
});

describe("pattern negative controls", () => {
  for (const pattern of PATTERNS) {
    for (let i = 0; i < pattern.examples.negative.length; i++) {
      const example = pattern.examples.negative[i];
      it(`${pattern.id} — negative #${i + 1}: ${truncate(example, 40)}`, () => {
        assert.ok(
          !pattern.regex.test(example),
          `${pattern.id} regex should NOT match "${truncate(example, 60)}"`,
        );
      });
    }
  }
});

// ─── scan() integration tests ──────────────────────────────────────────────

describe("scan() integration", () => {
  it("detects multiple patterns in mixed text", () => {
    const awsKey = PATTERNS.find(p => p.id === 'aws-access-key').examples.positive[0];
    const ghPat = PATTERNS.find(p => p.id === 'github-pat-fine-grained').examples.positive[0];
    const text = `
      User email: user@example.com
      AWS key: ${awsKey}
      GitHub token: ${ghPat}
    `;
    const results = scan(text);
    const patternIds = [...new Set(results.map((r) => r.patternId))];
    assert.ok(patternIds.includes("aws-access-key"), "Should detect AWS key");
    assert.ok(
      patternIds.includes("github-pat-fine-grained"),
      "Should detect GitHub fine-grained PAT",
    );
    assert.ok(patternIds.includes("email-phone-pii"), "Should detect email");
  });

  it("does not match block-strict patterns without strict mode", () => {
    const ssnExample = PATTERNS.find(p => p.id === 'us-ssn').examples.positive[0];
    const text = `SSN: ${ssnExample}`;
    const results = scan(text);
    const strictMatches = results.filter((r) => {
      const pat = PATTERNS.find((p) => p.id === r.patternId);
      return pat && pat.severity === "block-strict";
    });
    assert.equal(strictMatches.length, 0, "No block-strict matches without strict mode");
  });

  it("matches block-strict patterns with strict=true", () => {
    const ssnExample = PATTERNS.find(p => p.id === 'us-ssn').examples.positive[0];
    const text = `SSN: ${ssnExample}\nGPS: 37.7749,-122.4194`;
    const results = scan(text, { strict: true });
    const strictIds = results.map((r) => r.patternId);
    assert.ok(strictIds.includes("us-ssn"), "Should detect SSN in strict mode");
    assert.ok(strictIds.includes("gps-precise"), "Should detect GPS in strict mode");
  });

  it("handles empty text", () => {
    assert.equal(scan("").length, 0);
    assert.equal(scan("  ").length, 0);
    assert.equal(scan("\n\n\n").length, 0);
  });

  it("handles null/undefined gracefully", () => {
    // @ts-expect-error — deliberate edge case
    assert.equal(scan(null).length, 0);
    // @ts-expect-error — deliberate edge case
    assert.equal(scan(undefined).length, 0);
  });
});

// ─── Hedge: verify there are no lingering false positives ─────────────────

describe("false positive resistance", () => {
  it("does not flag 'key' context without ≥ 32-char value", () => {
    const text = "The key insight is that we need to refactor the module.";
    const results = scan(text);
    const genericMatches = results.filter((r) => r.patternId === "generic-api-key");
    assert.equal(genericMatches.length, 0);
  });

  it("does not flag short hex values near 'token'", () => {
    const text = "session_token = abc123";
    const results = scan(text);
    const genericMatches = results.filter((r) => r.patternId === "generic-api-key");
    assert.equal(genericMatches.length, 0);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str, maxLen) {
  if (typeof str !== "string") return String(str);
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
