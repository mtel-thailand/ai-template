#!/usr/bin/env node

/**
 * _config.mjs — Shared memory configuration reader
 *
 * Loads the `memory` section from `.opencode/opencode.json` (or
 * $OPENCODE_CONFIG if set) and returns a validated config object with
 * defaults applied per ADR-0003 §"Configuration schema".
 *
 * Exported API:
 *   loadMemoryConfig(rootDir?) → MemoryConfig
 *
 * MemoryConfig shape (all fields filled by defaults if absent):
 *   { version, backends, embedder, sqlite, search, exports }
 *
 * Intended for use by memory-{gc,export,import}.mjs scripts.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── Defaults (ADR-0003 §Configuration schema) ────────────────────────────────

const DEFAULTS = {
  version: 1,
  backends: {
    short:       { type: "file" },
    forgettable: { type: "file" },
    mid:         { type: "sqlite-vec", path: ".opencode/memory/memory.db" },
    long:        { type: "sqlite-vec", path: ".opencode/memory/memory.db" },
    frequent:    { type: "sqlite-vec", path: ".opencode/memory/memory.db" },
  },
  embedder: {
    kind: "transformers-js",
    model: "Xenova/all-MiniLM-L6-v2",
    dim: 384,
    quantization: "fp32",
    lockfile: ".opencode/memory/embeddings.lock",
  },
  sqlite: {
    extensionPath: "bin/sqlite-vec",
    extensionLockfile: ".opencode/memory/sqlite-vec.lock",
    pragmas: {
      journal_mode: "WAL",
      synchronous:  "NORMAL",
      busy_timeout: 5000,
      foreign_keys: "ON",
      temp_store:   "MEMORY",
    },
  },
  search: {
    hybridWeights: { vector: 0.7, lexical: 0.3 },
    ftsTimeoutMs: 500,
    annTrigger: {
      corpusSize:   5000,
      searchP99Ms:  500,
      recallAt5:    0.85,
    },
  },
  exports: {
    path: ".opencode/memory/exports",
    excludeFields: ["embedding"],
  },
};

/**
 * Deep-merge `defaults` with `overrides`.  Only plain objects are merged
 * recursively; all other values are overwritten.
 */
function deepMerge(defaults, overrides) {
  if (overrides == null || typeof overrides !== "object") return overrides ?? defaults;
  const result = Array.isArray(defaults) ? [...defaults] : { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      typeof defaults[key] === "object" && defaults[key] !== null &&
      !Array.isArray(defaults[key]) &&
      typeof overrides[key] === "object" && overrides[key] !== null &&
      !Array.isArray(overrides[key])
    ) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

/**
 * Return an absolute path for a possibly-relative path, resolved against
 * `rootDir` (the directory containing opencode.json, typically the project
 * root).
 */
function resolvePath(p, rootDir) {
  if (p == null) return p;
  if (p.startsWith("/")) return p;
  return join(rootDir, p);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Load and return the validated memory config.
 *
 * @param {string} [rootDir]  Project root directory.  Defaults to `process.cwd()`.
 * @returns {object}  Deep-merged MemoryConfig with all fields present.
 * @throws {Error}  If `opencode.json` cannot be read or has no valid `memory` section.
 */
export function loadMemoryConfig(rootDir) {
  const cwd = rootDir ?? process.cwd();

  const configPath = process.env.OPENCODE_CONFIG
    ? process.env.OPENCODE_CONFIG
    : join(cwd, ".opencode", "opencode.json");

  if (!existsSync(configPath)) {
    throw new Error(
      `opencode.json not found at ${configPath}. ` +
      "Set OPENCODE_CONFIG env var or run from the project root."
    );
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse ${configPath}: ${err.message}`);
  }

  const rawMemory = raw.memory ?? {};
  const merged = deepMerge(DEFAULTS, rawMemory);

  // Resolve relative paths to absolute (relative to opencode.json's parent dir).
  const configDir = dirname(configPath);

  // Resolve backend paths.
  for (const tier of Object.keys(merged.backends)) {
    const b = merged.backends[tier];
    if (b.path) {
      b._resolvedPath = resolvePath(b.path, configDir);
    }
  }

  // Resolve embedder lockfile.
  if (merged.embedder?.lockfile) {
    merged.embedder._resolvedLockfile = resolvePath(merged.embedder.lockfile, configDir);
  }

  // Resolve sqlite extension path & lockfile.
  if (merged.sqlite?.extensionPath) {
    merged.sqlite._resolvedExtensionPath = resolvePath(merged.sqlite.extensionPath, configDir);
  }
  if (merged.sqlite?.extensionLockfile) {
    merged.sqlite._resolvedExtensionLockfile = resolvePath(merged.sqlite.extensionLockfile, configDir);
  }

  // Resolve exports path.
  if (merged.exports?.path) {
    merged.exports._resolvedPath = resolvePath(merged.exports.path, configDir);
  }

  return merged;
}

// ─── Memory-enabled detection (ADR-0006) ─────────────────────────────────────

/**
 * Strip `//` line comments outside string literals.  Mirrors the stripper in
 * `docs-consistency.mjs` — kept local so `_config.mjs` stays self-contained.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      if (i < text.length) out += "\n";
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * Return true iff the resolved opencode.json contains an uncommented
 * top-level `memory` key.  Used to gate SQLite-tier memory operations
 * (per ADR-0006 Option B: opt-in for OSS release).
 *
 * Returns false on any error: missing file, JSON parse failure, missing key.
 * This is deliberately conservative — when in doubt, treat memory as
 * disabled so callers fail-fast rather than running against an indeterminate
 * configuration.
 *
 * @param {string} [rootDir]  Project root.  Defaults to `process.cwd()`.
 * @returns {boolean}
 */
export function isMemoryEnabled(rootDir) {
  const cwd = rootDir ?? process.cwd();
  const configPath = process.env.OPENCODE_CONFIG
    ? process.env.OPENCODE_CONFIG
    : join(cwd, ".opencode", "opencode.json");

  if (!existsSync(configPath)) return false;

  let parsed;
  try {
    parsed = JSON.parse(stripJsonComments(readFileSync(configPath, "utf-8")));
  } catch {
    return false;
  }
  return parsed?.memory !== undefined && parsed?.memory !== null;
}

/**
 * Guard helper for memory scripts that require the SQLite-tier backend.
 * If memory is disabled, writes the canonical message to stderr and exits 1.
 *
 * Canonical message (per @qa refinement #3 on Issue #64, accepted by @po):
 *
 *   `<scriptName>: memory is disabled in opencode.json; see /docs/runbooks/enable-memory.md`
 *
 * @param {string} scriptName  Script name for the error prefix.
 * @param {object} [opts]
 * @param {string} [opts.rootDir]    Project root.  Defaults to process.cwd().
 * @param {Function} [opts.exit]     Exit hook (defaults to process.exit) — testing seam.
 * @param {Function} [opts.errorLog] Error log hook (defaults to console.error) — testing seam.
 */
export function requireMemoryEnabled(scriptName, opts = {}) {
  if (isMemoryEnabled(opts.rootDir)) return;
  const errorLog = opts.errorLog ?? console.error;
  const exit = opts.exit ?? process.exit;
  errorLog(`${scriptName}: memory is disabled in opencode.json; see /docs/runbooks/enable-memory.md`);
  exit(1);
}

/**
 * Return an array of tiers whose backend type is `sqlite-vec`.
 */
export function sqliteTiers(config) {
  const tiers = [];
  for (const [tier, backend] of Object.entries(config.backends)) {
    if (backend.type === "sqlite-vec") {
      tiers.push(tier);
    }
  }
  return tiers;
}

/**
 * Return the unique SQLite DB file paths referenced by sqlite-vec backends.
 */
export function sqliteDbPaths(config) {
  const paths = new Set();
  for (const backend of Object.values(config.backends)) {
    if (backend.type === "sqlite-vec" && backend._resolvedPath) {
      paths.add(backend._resolvedPath);
    }
  }
  return [...paths];
}
