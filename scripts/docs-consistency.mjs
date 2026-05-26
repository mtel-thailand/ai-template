#!/usr/bin/env node
// scripts/docs-consistency.mjs
//
// Validates that the squad roster and per-role bash policy stay
// consistent across the canonical sources and their derived docs.
// Canonical sources (per ADR-0008):
//   .opencode/opencode.json         per-role bash policy + agent set
//   .opencode/agents/pm.md          squad roster (name + tag)
// Derived docs:
//   README.md                       Team roles at a glance table
//   CONTRIBUTING.md                 Who contributes what table
//   docs/architecture.md            agent diagram + per-role bash table
//
// Exit codes:  0 clean, 1 parse/schema error, 2 drift detected.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── JSONC stripper (line comments only — opencode.json uses no block comments) ──
export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      if (i < text.length) out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

// ── opencode.json parser ───────────────────────────────────────────────────────
export function parseOpencodeConfig(text) {
  const obj = JSON.parse(stripJsonComments(text));
  if (!obj.agent || typeof obj.agent !== 'object') {
    throw new Error('opencode.json: missing or malformed agent block');
  }
  const agents = new Set(Object.keys(obj.agent).map(k => '@' + k));
  const perRoleBash = new Map();
  for (const [key, def] of Object.entries(obj.agent)) {
    const tag = '@' + key;
    const bash = def?.permission?.bash;
    if (!bash || typeof bash !== 'object') continue;
    perRoleBash.set(tag, classifyBashPolicy(bash));
  }
  return { agents, perRoleBash };
}

// Map a raw permission.bash block to the doc-table cell semantics.
export function classifyBashPolicy(bashMap) {
  const isAllow = (key) => bashMap[key] === 'allow';
  return {
    gitRead: (isAllow('git status') || isAllow('git diff *') || isAllow('git log *') || isAllow('git *')) ? 'allow' : 'none',
    gitStage: (isAllow('git add *') || isAllow('git commit *') || isAllow('git *')) ? 'allow' : 'none',
    gitBranch: (isAllow('git branch *') || isAllow('git checkout *') || isAllow('git fetch *') || isAllow('git *')) ? 'allow' : 'none',
    gitPush: 'deny', // hard rule — must be deny for every role
    npm: (isAllow('npm run *') || isAllow('npm test*') || isAllow('npx *')) ? 'allow' : 'none',
    docker: isAllow('docker *') ? 'allow' : 'none',
  };
}

// ── pm.md cheat-sheet parser ───────────────────────────────────────────────────
// Matches: | <name> | `<@tag>` | <when-to-use> |
const PM_ROW_RE = /^\|\s*([A-Za-z][A-Za-z /-]+?)\s*\|\s*`(@[a-z][a-z-]*)`\s*\|\s*(.+?)\s*\|\s*$/gm;

export function parsePmCheatSheet(text) {
  const rows = [];
  for (const m of text.matchAll(PM_ROW_RE)) {
    const name = m[1].trim();
    const tag = m[2].trim();
    rows.push({ name, tag });
  }
  return rows;
}

// ── README table parser ────────────────────────────────────────────────────────
// Matches: | **<name>** | `<@tag>` | <purpose> |
const README_ROW_RE = /^\|\s*\*\*([A-Za-z][A-Za-z /-]+?)\*\*\s*\|\s*`(@[a-z][a-z-]*)`\s*\|\s*(.+?)\s*\|\s*$/gm;

export function parseReadmeRoster(text) {
  const rows = [];
  for (const m of text.matchAll(README_ROW_RE)) {
    rows.push({ name: m[1].trim(), tag: m[2].trim() });
  }
  return rows;
}

// ── CONTRIBUTING table parser ──────────────────────────────────────────────────
// Matches a 2-column row inside a "Who contributes what" block.
export function parseContributingRoster(text) {
  const start = text.indexOf('## Who contributes what');
  if (start < 0) return [];
  const block = text.slice(start, text.indexOf('\n## ', start + 1) >>> 0 || text.length);
  const names = [];
  const rowRe = /^\|\s*([A-Za-z][A-Za-z /-]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
  for (const m of block.matchAll(rowRe)) {
    const name = m[1].trim();
    if (name === 'Role' || /^-+$/.test(name)) continue;
    names.push(name);
  }
  return names;
}

// ── architecture.md per-role bash table parser ─────────────────────────────────
// Matches: | `<@tag>` | <c1> | <c2> | <c3> | <c4> | <c5> | <c6> |
const ARCH_BASH_ROW_RE = /^\|\s*`(@[a-z][a-z-]*)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;

export function parseArchitectureBashTable(text) {
  const start = text.indexOf('### Per-role bash permission model');
  if (start < 0) return new Map();
  const end = text.indexOf('\n### ', start + 1);
  const block = end < 0 ? text.slice(start) : text.slice(start, end);
  const out = new Map();
  for (const m of block.matchAll(ARCH_BASH_ROW_RE)) {
    const tag = m[1];
    out.set(tag, {
      gitRead: cellTo(m[2]),
      gitStage: cellTo(m[3]),
      gitBranch: cellTo(m[4]),
      gitPush: cellTo(m[5]),
      npm: cellTo(m[6]),
      docker: cellTo(m[7]),
    });
  }
  return out;
}

function cellTo(raw) {
  const v = raw.replace(/\*/g, '').trim().toLowerCase();
  if (v === 'allow') return 'allow';
  if (v === 'deny') return 'deny';
  return 'none';
}

// ── architecture.md agent diagram parser ───────────────────────────────────────
// Matches lines inside the box like `   │  PM ─── orchestrator`.
// Leading whitespace before │ is allowed (indented code-block lines).
const ARCH_DIAGRAM_ROW_RE = /^\s*│\s+([A-Z][A-Za-z /]+?)\s+───\s+/gm;

export function parseArchitectureDiagramRoster(text) {
  const start = text.indexOf('### Architecture Overview');
  if (start < 0) return [];
  const end = text.indexOf('\n### ', start + 1);
  const block = end < 0 ? text.slice(start) : text.slice(start, end);
  return [...block.matchAll(ARCH_DIAGRAM_ROW_RE)].map(m => m[1].trim());
}

// ── Memory opt-in banner check (ADR-0006) ──────────────────────────────────────
// The memory subsystem ships disabled in the OSS template release. ADR-0006
// requires a "Status: opt-in" callout in README and the three primary docs
// surfaces so users see the opt-in state before they discover the runtime
// behavior. This check fails CI if any of those four files drops the marker.

export const MEMORY_BANNER_MARKER = '**Status: opt-in.**';
export const MEMORY_BANNER_FILES = [
  'README.md',
  'docs/index.md',
  'docs/architecture.md',
  'docs/specs/agent-memory.md',
];

export function checkOptInBanners(repoRoot) {
  const violations = [];
  for (const rel of MEMORY_BANNER_FILES) {
    const p = resolve(repoRoot, rel);
    if (!existsSync(p)) {
      violations.push(`memory opt-in banner (ADR-0006): required file missing: ${rel}`);
      continue;
    }
    const text = readFileSync(p, 'utf8');
    if (!text.includes(MEMORY_BANNER_MARKER)) {
      violations.push(`memory opt-in banner (ADR-0006): missing "${MEMORY_BANNER_MARKER}" marker in ${rel}`);
    }
  }
  return violations;
}

// ── Comparators ────────────────────────────────────────────────────────────────
function diff(setA, setB) {
  const onlyA = [...setA].filter(x => !setB.has(x)).sort();
  const onlyB = [...setB].filter(x => !setA.has(x)).sort();
  return { onlyA, onlyB };
}

export function compareRosters(canonical, derivedTags, label) {
  const violations = [];
  const can = new Set(canonical.map(r => r.tag));
  const der = new Set(derivedTags);
  const { onlyA, onlyB } = diff(can, der);
  if (onlyA.length) violations.push(`${label}: missing tag(s) present in pm.md: ${onlyA.join(', ')}`);
  if (onlyB.length) violations.push(`${label}: extra tag(s) not in pm.md: ${onlyB.join(', ')}`);
  return violations;
}

export function compareRosterByName(canonical, derivedNames, label) {
  const violations = [];
  const can = new Set(canonical.map(r => r.name));
  const der = new Set(derivedNames);
  const { onlyA, onlyB } = diff(can, der);
  if (onlyA.length) violations.push(`${label}: missing name(s) present in pm.md: ${onlyA.join(', ')}`);
  if (onlyB.length) violations.push(`${label}: extra name(s) not in pm.md: ${onlyB.join(', ')}`);
  return violations;
}

export function compareBashTables(opencodeBash, archTable) {
  const violations = [];
  const cols = ['gitRead', 'gitStage', 'gitBranch', 'gitPush', 'npm', 'docker'];
  const allTags = new Set([...opencodeBash.keys(), ...archTable.keys()]);
  for (const tag of [...allTags].sort()) {
    const oc = opencodeBash.get(tag);
    const ar = archTable.get(tag);
    if (oc && !ar) { violations.push(`architecture.md bash table: missing row for ${tag} (has per-role block in opencode.json)`); continue; }
    if (ar && !oc) { violations.push(`architecture.md bash table: row for ${tag} has no per-role block in opencode.json`); continue; }
    for (const col of cols) {
      if (oc[col] !== ar[col]) {
        violations.push(`architecture.md bash table: ${tag} column "${col}" says "${ar[col]}", opencode.json computes "${oc[col]}"`);
      }
    }
  }
  return violations;
}

// ── Main orchestration ────────────────────────────────────────────────────────
export function runChecks(repoRoot) {
  const errors = [];
  const violations = [];

  function readOrErr(rel) {
    const p = resolve(repoRoot, rel);
    if (!existsSync(p)) { errors.push(`missing file: ${rel}`); return null; }
    return readFileSync(p, 'utf8');
  }

  const opencodeText = readOrErr('.opencode/opencode.json');
  const pmText = readOrErr('.opencode/agents/pm.md');
  const readmeText = readOrErr('README.md');
  const contributingText = readOrErr('CONTRIBUTING.md');
  const archText = readOrErr('docs/architecture.md');

  if (errors.length) return { errors, violations };

  let opencode;
  try { opencode = parseOpencodeConfig(opencodeText); }
  catch (e) { errors.push(`opencode.json parse: ${e.message}`); return { errors, violations }; }

  const pmRoster = parsePmCheatSheet(pmText);
  if (pmRoster.length === 0) {
    errors.push('pm.md: cheat-sheet roster parsed 0 rows — parser regex or section missing');
    return { errors, violations };
  }

  // Check 1: opencode.json agent set === pm.md cheat sheet
  const ocTags = new Set(opencode.agents);
  const pmTags = new Set(pmRoster.map(r => r.tag));
  const { onlyA: ocOnly, onlyB: pmOnly } = diff(ocTags, pmTags);
  if (ocOnly.length) violations.push(`opencode.json has agent(s) missing from pm.md cheat sheet: ${ocOnly.join(', ')}`);
  if (pmOnly.length) violations.push(`pm.md cheat sheet has agent(s) missing from opencode.json: ${pmOnly.join(', ')}`);

  // Check 2: README roster
  const readmeRows = parseReadmeRoster(readmeText);
  violations.push(...compareRosters(pmRoster, readmeRows.map(r => r.tag), 'README.md roster'));

  // Check 3: CONTRIBUTING roster (by name, since CONTRIBUTING uses name only)
  const contributingNames = parseContributingRoster(contributingText);
  violations.push(...compareRosterByName(pmRoster, contributingNames, 'CONTRIBUTING.md roster'));

  // Check 4: architecture.md diagram roster (by name)
  const archDiagramNames = parseArchitectureDiagramRoster(archText);
  if (archDiagramNames.length === 0) {
    errors.push('architecture.md: agent diagram parsed 0 rows — parser regex or section missing');
  } else {
    violations.push(...compareRosterByName(pmRoster, archDiagramNames, 'docs/architecture.md diagram'));
  }

  // Check 5: architecture.md per-role bash table === opencode.json per-role bash
  const archBash = parseArchitectureBashTable(archText);
  if (archBash.size === 0) {
    errors.push('architecture.md: per-role bash table parsed 0 rows — parser regex or section missing');
  } else {
    violations.push(...compareBashTables(opencode.perRoleBash, archBash));
  }

  // Check 6: memory opt-in banner present in all required docs (ADR-0006)
  violations.push(...checkOptInBanners(repoRoot));

  return { errors, violations };
}

function main() {
  const repoRoot = process.argv.includes('--repo-root')
    ? process.argv[process.argv.indexOf('--repo-root') + 1]
    : process.cwd();

  const { errors, violations } = runChecks(repoRoot);

  if (errors.length) {
    console.error('docs-consistency: parse errors');
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  if (violations.length) {
    console.error(`docs-consistency: ${violations.length} drift violation(s)`);
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error('\nSee ADR-0008 for the canonical source-of-truth policy.');
    process.exit(2);
  }
  console.log('docs-consistency: ok');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
