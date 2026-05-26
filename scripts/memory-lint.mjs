#!/usr/bin/env node

/**
 * memory-lint.mjs — SR6 lint script stub
 *
 * Scans JSONL export files under `.opencode/memory/exports/` for prohibited
 * content patterns (secrets, credentials, PII) using the shared secrets-ban
 * regex set.
 *
 * Usage:
 *   node scripts/memory-lint.mjs                    # scan all exports
 *   node scripts/memory-lint.mjs --file <path>      # single file
 *   node scripts/memory-lint.mjs --exit0-when-empty # per SR6 spec
 *
 * Exit codes:
 *   0 — no prohibited content found (or empty vault)
 *   1 — one or more matches found
 *
 * CI wiring: owned by ticket #28. This script is the SR6 enforcement point;
 * the CI job that invokes it will be added in #28 (docs-check.yml or a new
 * memory-lint.yml). See Issue #28 in the canonical repo (GITHUB_REPO_URL).
 *
 * TODO(#28): Wire this into CI. The shared secrets-regex module is owned by
 * ticket #33; once #33 lands, replace the inlined regex set below with
 * an import from the shared module. If #33 lands after #28, keep the inlined
 * set and file a follow-up to swap it out — do not end up with two divergent
 * regex sources.
 *
 * --exit0-when-empty flag:
 *   This script treats an empty exports directory as a valid result (exit 0).
 *   If the vault is empty or exports haven't been generated yet, there is
 *   nothing to lint, and CI should not fail.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Shared secrets-ban regex set ──────────────────────────────────────────
// Inlined per C9 / #33 cross-link. Swap for `import { PATTERNS } from
// '#33/shared-secrets-regex'` when #33 lands.
// TODO(#33): Replace inlined regex set with shared module import.

const SECRETS_PATTERNS = [
  // API keys / tokens
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,           // OpenAI-style keys
  /\b(ghp_[a-zA-Z0-9]{36})\b/g,            // GitHub PAT (legacy)
  /\b(gho_[a-zA-Z0-9]{36})\b/g,            // GitHub OAuth
  /\b(ghu_[a-zA-Z0-9]{36})\b/g,            // GitHub user token
  /\b(ghs_[a-zA-Z0-9]{36})\b/g,            // GitHub server token
  /\b(ghr_[a-zA-Z0-9]{36})\b/g,            // GitHub refresh token
  /\b(xox[baprs]-[a-zA-Z0-9-]{24,})\b/g,  // Slack tokens
  /\b(AKIA[0-9A-Z]{16})\b/g,               // AWS access key
  // Private-key headers
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
  /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g,
  /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/g,
  // Email addresses
  /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
  // Government / national IDs (US SSN pattern)
  /\b(\d{3}-\d{2}-\d{4})\b/g,
];

const EXPORTS_DIR = join(process.cwd(), ".opencode", "memory", "exports");

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    file: null,
    exit0whenEmpty: args.includes("--exit0-when-empty"),
  };
  const fi = args.indexOf("--file");
  if (fi !== -1 && args[fi + 1]) {
    flags.file = resolve(args[fi + 1]);
  }
  return flags;
}

/**
 * Scan a single JSONL file for prohibited content.
 * Returns an array of { line, match } objects.
 */
function scanFile(filePath) {
  const results = [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    for (const pattern of SECRETS_PATTERNS) {
      const matches = line.match(pattern);
      if (matches) {
        results.push({
          file: filePath,
          line: i + 1,
          match: matches[0].substring(0, 40), // truncate for display
        });
        break; // one flag per line is enough
      }
    }
  }

  return results;
}

/**
 * Discover all JSONL files under the exports directory.
 */
function discoverJsonlFiles() {
  if (!existsSync(EXPORTS_DIR)) return [];
  const entries = readdirSync(EXPORTS_DIR, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(EXPORTS_DIR, entry.name);
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const flags = parseArgs();

  const files = flags.file ? [flags.file] : discoverJsonlFiles();

  if (files.length === 0) {
    if (flags.exit0whenEmpty) {
      console.log("✅ memory:lint — no JSONL files to scan (empty vault).");
      process.exit(0);
    }
    console.log("ℹ️  memory:lint — no JSONL files found under", EXPORTS_DIR);
    process.exit(0);
  }

  let totalFindings = 0;

  for (const filePath of files) {
    const findings = scanFile(filePath);
    if (findings.length > 0) {
      console.error(`✖ ${filePath}:`);
      for (const f of findings) {
        console.error(`   line ${f.line}: suspected prohibited content: "${f.match}..."`);
        totalFindings++;
      }
    }
  }

  if (totalFindings > 0) {
    console.error(`\n❌ memory:lint — ${totalFindings} prohibited content match(es) found.`);
    process.exit(1);
  }

  console.log("✅ memory:lint — no prohibited content found.");
  process.exit(0);
}

main();
