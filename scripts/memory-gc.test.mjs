/**
 * memory-gc.test.mjs — Node built-in test suite for memory-gc.mjs
 *
 * Run: node --test scripts/memory-gc.test.mjs
 * Or:  npm test
 *
 * Uses node:test and node:assert. No test framework dependencies.
 *
 * Test isolation (per #21): all setup/teardown operations target a fresh
 * temp directory (TEST_VAULT) under os.tmpdir(). The MEMORY_ROOT env var
 * is passed to the spawned GC script so it operates on the temp vault
 * instead of the real .opencode/memory/ directory.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─── Paths ───────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const GC_SCRIPT = join(__dirname, "memory-gc.mjs");

/** Temp directory used as MEMORY_ROOT during tests. Initialised in before(). */
let TEST_VAULT = null;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function runGC(...args) {
  const result = spawnSync("node", [GC_SCRIPT, ...args], {
    cwd: join(__dirname, ".."),
    env: { ...process.env, MEMORY_ROOT: TEST_VAULT },
    encoding: "utf-8",
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}

function setupVault(files) {
  mkdirSync(TEST_VAULT, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(TEST_VAULT, relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
}

function readVault() {
  if (!existsSync(TEST_VAULT)) return {};
  const result = {};
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const relPath = relative(TEST_VAULT, full);
        result[relPath] = readFileSync(full, "utf-8");
      }
    }
  }
  walk(TEST_VAULT);
  return result;
}

function tearDownVault() {
  if (TEST_VAULT && existsSync(TEST_VAULT)) {
    rmSync(TEST_VAULT, { recursive: true, force: true });
    mkdirSync(TEST_VAULT, { recursive: true });
  }
}

// ─── Valid fixture frontmatter ──────────────────────────────────────────────

const VALID_FIXTURE = `---
name: valid-test-note
description: A valid test note for GC validation
tier: mid
kind: episodic
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 0
importance: 3
tags: [test]
links: []
---

This is a valid memory note body.
`;

const VALID_LONG_NOTE = `---
name: permanent-arch-note
description: Permanent architectural decision
tier: long
kind: semantic
created: 2026-05-20
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 15
importance: 5
tags: [architecture, decision]
links: ["[[valid-test-note]]"]
---

This is a permanent note that should never be evicted.
`;

const VALID_MID_NOTE_OLD = `---
name: stale-mid-note
description: A mid-tier note past its TTL
tier: mid
kind: working
created: 2026-03-01
updated: 2026-03-01
last_accessed: 2026-03-15
access_count: 2
importance: 2
tags: [old, stale]
links: []
---

This note hasn't been accessed in over 30 days.
`;

const VALID_FORGETTABLE_OLD = `---
name: stale-forgettable-note
description: A forgettable note past its TTL
tier: forgettable
kind: episodic
created: 2026-04-01
updated: 2026-04-01
last_accessed: 2026-04-10
access_count: 1
importance: 1
tags: [old]
links: []
---

This forgettable note is past its 7-day TTL.
`;

const VALID_FREQUENT_NOTE = `---
name: hot-cache-note
description: Frequently accessed cache note
tier: frequent
kind: working
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 50
importance: 3
tags: [hot, cache]
links: []
---

Hot cache note.
`;

const VALID_SHORT_NOTE = `---
name: session-note
description: Session-scoped temporary note
tier: short
kind: working
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 1
importance: 1
tags: [session]
links: []
---

Session note.
`;

// ─── Invalid fixtures ──────────────────────────────────────────────────────────────

const BAD_SCHEMA_EXTRA_FIELD = `---
name: bad-schema-extra
description: Has an extra field not in the 11-field schema
tier: mid
kind: episodic
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 0
importance: 3
tags: []
links: []
random_field: this should be rejected
---

Body with extra field.
`;

const BAD_SCHEMA_MISSING_FIELD = `---
name: bad-schema-missing
description: Missing last_accessed field
tier: mid
kind: episodic
created: 2026-05-25
updated: 2026-05-25
access_count: 0
importance: 3
tags: []
links: []
---

Body with missing field.
`;

const BAD_SCHEMA_BAD_NAME = `---
name: Bad Name With Spaces
description: Invalid name format
tier: mid
kind: episodic
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 0
importance: 3
tags: []
links: []
---

Body with bad name.
`;

const BAD_SCHEMA_BAD_IMPORTANCE = `---
name: bad-importance
description: Importance out of range
tier: mid
kind: episodic
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 0
importance: 999
tags: []
links: []
---

Body with bad importance.
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("memory-gc.mjs", () => {
  before(() => {
    assert.ok(existsSync(GC_SCRIPT), "GC script must exist");
    TEST_VAULT = mkdtempSync(join(tmpdir(), "memory-gc-test-"));
  });

  after(() => {
    if (TEST_VAULT && existsSync(TEST_VAULT)) {
      rmSync(TEST_VAULT, { recursive: true, force: true });
    }
  });

  describe("--validate-only", () => {
    it("passes when all notes have valid 11-field schemas", () => {
      tearDownVault();
      setupVault({
        "mid/valid-test-note.md": VALID_FIXTURE,
        "long/permanent-arch-note.md": VALID_LONG_NOTE,
        "frequent/hot-cache-note.md": VALID_FREQUENT_NOTE,
        "short/session-note.md": VALID_SHORT_NOTE,
      });

      const { status, stdout, stderr } = runGC("--validate-only");
      assert.equal(status, 0, `Expected exit 0, got ${status}\nstdout: ${stdout}\nstderr: ${stderr}`);
      assert.match(stdout, /Validation passed/);
    });

    it("fails when a note has an extra field (strict mode)", () => {
      tearDownVault();
      setupVault({
        "mid/bad-schema-extra.md": BAD_SCHEMA_EXTRA_FIELD,
      });

      const { status, stdout } = runGC("--validate-only");
      assert.equal(status, 1, "Extra field should cause validation failure");
      assert.match(stdout, /Invalid/);
    });

    it("fails when a note is missing a required field", () => {
      tearDownVault();
      setupVault({
        "mid/bad-schema-missing.md": BAD_SCHEMA_MISSING_FIELD,
      });

      const { status, stdout } = runGC("--validate-only");
      assert.equal(status, 1, "Missing field should cause validation failure");
      assert.match(stdout, /Invalid/);
    });

    it("fails when name is not kebab-case", () => {
      tearDownVault();
      setupVault({
        "mid/bad-name.md": BAD_SCHEMA_BAD_NAME,
      });

      const { status, stdout } = runGC("--validate-only");
      assert.equal(status, 1, "Bad name format should cause validation failure");
      assert.match(stdout, /Invalid/);
    });

    it("fails when importance is out of range", () => {
      tearDownVault();
      setupVault({
        "mid/bad-importance.md": BAD_SCHEMA_BAD_IMPORTANCE,
      });

      const { status, stdout } = runGC("--validate-only");
      assert.equal(status, 1, "Importance out of range should cause validation failure");
      assert.match(stdout, /Invalid/);
    });
  });

  describe("--dry-run", () => {
    it("runs all phases without writing files", () => {
      tearDownVault();
      setupVault({
        "mid/valid-test-note.md": VALID_FIXTURE,
        "mid/stale-mid-note.md": VALID_MID_NOTE_OLD,
        "forgettable/stale-forgettable-note.md": VALID_FORGETTABLE_OLD,
      });

      const { status, stdout } = runGC("--dry-run");
      assert.equal(status, 0, `Dry-run should succeed, got status ${status}`);
      assert.match(stdout, /DRY RUN/);
      assert.match(stdout, /stale-mid-note/);
      assert.match(stdout, /stale-forgettable-note/);

      const vault = readVault();
      assert.ok(vault["mid/stale-mid-note.md"], "Stale mid note should still exist after dry-run");
      assert.ok(vault["forgettable/stale-forgettable-note.md"], "Stale forgettable note should still exist after dry-run");
    });
  });

  describe("Budget enforcement", () => {
    it("exits with code 2 when mid-tier exceeds 50 entries", () => {
      tearDownVault();
      const files = {};
      for (let i = 0; i < 55; i++) {
        const idx = String(i).padStart(3, "0");
        files[`mid/over-budget-${idx}.md`] = `---
name: over-budget-${idx}
description: Budget test note ${idx}
tier: mid
kind: working
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 0
importance: 1
tags: [test]
links: []
---

Budget test note ${idx}.
`;
      }
      setupVault(files);

      const { status, stdout } = runGC("--dry-run");
      assert.equal(status, 2, "Budget violations should cause exit code 2");
      assert.match(stdout, /Budget violations/);
      assert.match(stdout, /mid/);
    });
  });

  describe("Full run", () => {
    it("evicts forgettable entries past TTL and preserves valid notes", () => {
      tearDownVault();
      setupVault({
        "mid/valid-test-note.md": VALID_FIXTURE,
        "forgettable/stale-forgettable-note.md": VALID_FORGETTABLE_OLD,
      });

      const { status, stdout } = runGC();
      assert.equal(status, 0, `Full run should succeed, got status ${status}`);
      assert.match(stdout, /Memory GC complete/);
      assert.match(stdout, /Evictions:\s*1/);

      const vault = readVault();
      assert.ok(vault["mid/valid-test-note.md"], "Valid mid note should still exist");
      assert.ok(!vault["forgettable/stale-forgettable-note.md"], "Stale forgettable note should be removed");
    });
  });
});
