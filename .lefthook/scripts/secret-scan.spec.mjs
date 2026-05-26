/**
 * secret-scan.spec.mjs — Unit tests for the lefthook secret-scan hook utilities.
 *
 * Currently covers `shouldSkipPath()` — the integrity-control artifact
 * allowlist added in #72.
 *
 * Run:   node --test .lefthook/scripts/secret-scan.spec.mjs
 *
 * Uses node:test and node:assert. No test framework dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipPath } from "./secret-scan.mjs";

describe("shouldSkipPath() — #72 integrity-control allowlist", () => {
  it("skips *.lock files (SR3/SR4 integrity locks)", () => {
    assert.equal(shouldSkipPath(".opencode/memory/embeddings.lock"), true);
    assert.equal(shouldSkipPath(".opencode/memory/sqlite-vec.lock"), true);
    assert.equal(shouldSkipPath("any/path/foo.lock"), true);
    assert.equal(shouldSkipPath("embeddings.lock"), true);
  });

  it("does not skip regular memory markdown files", () => {
    assert.equal(shouldSkipPath(".opencode/memory/short/note.md"), false);
    assert.equal(shouldSkipPath(".opencode/memory/long/decision.md"), false);
    assert.equal(shouldSkipPath("MEMORY.md"), false);
  });

  it("does not skip JSONL exports", () => {
    assert.equal(
      shouldSkipPath(".opencode/memory/exports/2026-05.jsonl"),
      false,
    );
  });

  it("does not skip files whose name contains '.lock' but ends in a different extension", () => {
    // Only the final extension triggers the skip — a renamed-secret
    // attack of the form `notes.lock.md` is still scanned.
    assert.equal(shouldSkipPath("notes.lock.md"), false);
    assert.equal(shouldSkipPath("backup.lock.bak"), false);
    assert.equal(shouldSkipPath(".opencode/memory/secrets.lock.txt"), false);
  });

  it("does not skip files with no extension", () => {
    assert.equal(shouldSkipPath("README"), false);
    assert.equal(shouldSkipPath(".opencode/memory/Dockerfile"), false);
  });

  it("does not skip dotfiles that are not *.lock", () => {
    assert.equal(shouldSkipPath(".env"), false);
    assert.equal(shouldSkipPath(".opencode/memory/.gitkeep"), false);
  });
});
