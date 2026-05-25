#!/usr/bin/env node

/**
 * ci-check-db-not-staged.mjs — SR1 CI guard
 *
 * Fails the build if any `*.db`, `*.db-wal`, `*.db-shm`, or `*.db-journal`
 * file has been staged (added to the git index). This prevents accidental
 * commits of the binary SQLite vault or its sidecar files.
 *
 * Usage:
 *   node scripts/ci-check-db-not-staged.mjs
 *
 * Exit codes:
 *   0 — no DB files staged (pass)
 *   1 — one or more DB files found in the index (fail)
 *
 * Integration: run in CI as part of `db-guard.yml` or inline in any
 * workflow job that runs before `npm test`.
 */

import { spawnSync } from "node:child_process";

const DB_PATTERNS = [
  /\.db$/,
  /\.db-wal$/,
  /\.db-shm$/,
  /\.db-journal$/,
];

function isDbFile(path) {
  return DB_PATTERNS.some((re) => re.test(path));
}

function main() {
  const result = spawnSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    console.error("❌ Failed to run git diff --cached");
    process.exit(1);
  }

  const stagedFiles = result.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const offending = stagedFiles.filter(isDbFile);

  if (offending.length === 0) {
    console.log("✅ SR1 check passed — no DB files staged.");
    process.exit(0);
  }

  console.error("❌ SR1 check FAILED — DB files found in git index:");
  for (const file of offending) {
    console.error(`   ✖ ${file}`);
  }
  console.error("");
  console.error(
    "SQLite database + sidecar files must NOT be committed to git.",
  );
  console.error(
    "Remove them from the index with: git rm --cached <file>",
  );
  console.error(
    "Ensure your .gitignore covers *.db, *.db-wal, *.db-shm, *.db-journal.",
  );
  process.exit(1);
}

main();
