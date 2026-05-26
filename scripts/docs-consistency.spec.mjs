// scripts/docs-consistency.spec.mjs
// Unit tests for the docs-consistency lint script (run via `node --test`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  stripJsonComments,
  parseOpencodeConfig,
  classifyBashPolicy,
  parsePmCheatSheet,
  parseReadmeRoster,
  parseContributingRoster,
  parseArchitectureBashTable,
  parseArchitectureDiagramRoster,
  compareRosters,
  compareRosterByName,
  compareBashTables,
  checkOptInBanners,
  MEMORY_BANNER_MARKER,
  MEMORY_BANNER_FILES,
  runChecks,
} from './docs-consistency.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// ── JSONC stripper ────────────────────────────────────────────────────────────
test('stripJsonComments: strips // line comments outside strings', () => {
  const input = `{
  // top-level comment
  "a": 1, // trailing
  "b": "value // not a comment"
}`;
  const out = stripJsonComments(input);
  const parsed = JSON.parse(out);
  assert.equal(parsed.a, 1);
  assert.equal(parsed.b, 'value // not a comment');
});

test('stripJsonComments: handles escaped quotes inside strings', () => {
  const input = `{"s": "a \\"// inside\\" b"}`;
  const out = stripJsonComments(input);
  assert.equal(JSON.parse(out).s, 'a "// inside" b');
});

// ── classifyBashPolicy ────────────────────────────────────────────────────────
test('classifyBashPolicy: maps an explicit per-role block correctly', () => {
  const policy = classifyBashPolicy({
    'git status': 'allow',
    'git add *': 'allow',
    'git branch *': 'allow',
    'git push *': 'deny',
    'npm run *': 'allow',
    '*': 'deny',
  });
  assert.equal(policy.gitRead, 'allow');
  assert.equal(policy.gitStage, 'allow');
  assert.equal(policy.gitBranch, 'allow');
  assert.equal(policy.gitPush, 'deny');
  assert.equal(policy.npm, 'allow');
  assert.equal(policy.docker, 'none');
});

test('classifyBashPolicy: devops broad `git *: allow` covers all git groups', () => {
  const policy = classifyBashPolicy({
    'git *': 'allow',
    'docker *': 'allow',
    'npm run *': 'allow',
    'git push *': 'deny',
    '*': 'deny',
  });
  assert.equal(policy.gitRead, 'allow');
  assert.equal(policy.gitStage, 'allow');
  assert.equal(policy.gitBranch, 'allow');
  assert.equal(policy.docker, 'allow');
});

// ── parseOpencodeConfig ───────────────────────────────────────────────────────
test('parseOpencodeConfig: extracts agent set and per-role bash maps', () => {
  const json = JSON.stringify({
    agent: {
      pm: {},
      be: { permission: { bash: { 'git status': 'allow', 'git push *': 'deny' } } },
    },
  });
  const { agents, perRoleBash } = parseOpencodeConfig(json);
  assert.ok(agents.has('@pm'));
  assert.ok(agents.has('@be'));
  assert.equal(perRoleBash.has('@be'), true);
  assert.equal(perRoleBash.has('@pm'), false);
});

test('parseOpencodeConfig: throws on missing agent block', () => {
  assert.throws(() => parseOpencodeConfig('{}'), /missing or malformed agent block/);
});

// ── parsePmCheatSheet ─────────────────────────────────────────────────────────
test('parsePmCheatSheet: parses cheat-sheet rows', () => {
  const md = [
    '| Role | Tag | When to use |',
    '|------|-----|-------------|',
    '| PM | `@pm` | Board, sequencing, gate decisions |',
    '| Tech Lead | `@tech-lead` | Architecture, ADRs, technical authority |',
    '',
  ].join('\n');
  const rows = parsePmCheatSheet(md);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: 'PM', tag: '@pm' });
  assert.deepEqual(rows[1], { name: 'Tech Lead', tag: '@tech-lead' });
});

// ── parseReadmeRoster ─────────────────────────────────────────────────────────
test('parseReadmeRoster: parses README bold-name rows', () => {
  const md = '| **PM** | `@pm` | desc |\n| **BE** | `@be` | desc |';
  const rows = parseReadmeRoster(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tag, '@pm');
  assert.equal(rows[1].tag, '@be');
});

// ── parseContributingRoster ───────────────────────────────────────────────────
test('parseContributingRoster: parses 2-column "Who contributes what" table', () => {
  const md = [
    '## Who contributes what',
    '',
    '| Role | Contributes |',
    '|------|-------------|',
    '| PM | Sequencing |',
    '| BE | Backend |',
    '',
    '## Next section',
    '| Should | Not match |',
  ].join('\n');
  const names = parseContributingRoster(md);
  assert.deepEqual(names, ['PM', 'BE']);
});

// ── parseArchitectureBashTable ────────────────────────────────────────────────
test('parseArchitectureBashTable: parses 7-column bash policy rows', () => {
  const md = [
    '### Per-role bash permission model',
    '',
    '| Role | git read | git stage/commit | git branch/checkout/fetch | **git push** | npm/npx | docker |',
    '|------|----------|-----------------|--------------------------|-------------|---------|--------|',
    '| `@devops` | allow | allow | allow | **deny** | allow | allow |',
    '| `@be` | allow | allow | allow | **deny** | allow | none |',
    '',
    '### Next section',
  ].join('\n');
  const table = parseArchitectureBashTable(md);
  assert.equal(table.size, 2);
  assert.equal(table.get('@devops').docker, 'allow');
  assert.equal(table.get('@be').docker, 'none');
  assert.equal(table.get('@be').gitPush, 'deny');
});

// ── parseArchitectureDiagramRoster ────────────────────────────────────────────
test('parseArchitectureDiagramRoster: extracts role names from the box diagram', () => {
  const md = [
    '### Architecture Overview',
    '',
    '```',
    '│  PM ─── orchestrator                  │',
    '│  Tech Lead ─── architecture & ADRs    │',
    '```',
    '',
    '### Next section',
  ].join('\n');
  const names = parseArchitectureDiagramRoster(md);
  assert.deepEqual(names, ['PM', 'Tech Lead']);
});

// ── Comparators ───────────────────────────────────────────────────────────────
test('compareRosters: clean match returns no violations', () => {
  const canonical = [{ name: 'PM', tag: '@pm' }, { name: 'BE', tag: '@be' }];
  const out = compareRosters(canonical, ['@pm', '@be'], 'README');
  assert.deepEqual(out, []);
});

test('compareRosters: reports missing and extra tags', () => {
  const canonical = [{ name: 'PM', tag: '@pm' }, { name: 'BE', tag: '@be' }];
  const out = compareRosters(canonical, ['@pm', '@fe'], 'README');
  assert.equal(out.length, 2);
  assert.ok(out.some(v => v.includes('missing tag(s)')));
  assert.ok(out.some(v => v.includes('extra tag(s)')));
});

test('compareRosterByName: clean match returns no violations', () => {
  const canonical = [{ name: 'PM', tag: '@pm' }, { name: 'BE', tag: '@be' }];
  const out = compareRosterByName(canonical, ['PM', 'BE'], 'CONTRIBUTING');
  assert.deepEqual(out, []);
});

test('compareBashTables: flags missing row when opencode has a block', () => {
  const oc = new Map([
    ['@reviewer', { gitRead: 'allow', gitStage: 'allow', gitBranch: 'allow', gitPush: 'deny', npm: 'none', docker: 'none' }],
  ]);
  const arch = new Map();
  const out = compareBashTables(oc, arch);
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('missing row for @reviewer'));
});

test('compareBashTables: flags cell mismatch', () => {
  const oc = new Map([
    ['@be', { gitRead: 'allow', gitStage: 'allow', gitBranch: 'allow', gitPush: 'deny', npm: 'allow', docker: 'none' }],
  ]);
  const arch = new Map([
    ['@be', { gitRead: 'allow', gitStage: 'allow', gitBranch: 'allow', gitPush: 'deny', npm: 'allow', docker: 'allow' }],
  ]);
  const out = compareBashTables(oc, arch);
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('@be'));
  assert.ok(out[0].includes('docker'));
});

test('compareBashTables: clean match returns no violations', () => {
  const policy = { gitRead: 'allow', gitStage: 'allow', gitBranch: 'allow', gitPush: 'deny', npm: 'none', docker: 'none' };
  const oc = new Map([['@reviewer', policy]]);
  const arch = new Map([['@reviewer', policy]]);
  assert.deepEqual(compareBashTables(oc, arch), []);
});

// ── checkOptInBanners (ADR-0006) ──────────────────────────────────────────────
function withTempRepo(setup, fn) {
  const root = mkdtempSync(resolve(tmpdir(), 'docs-consistency-'));
  try {
    setup(root);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('checkOptInBanners: all four required files present with marker → no violations', () => {
  withTempRepo((root) => {
    mkdirSync(resolve(root, 'docs/specs'), { recursive: true });
    for (const rel of MEMORY_BANNER_FILES) {
      writeFileSync(resolve(root, rel), `# stub\n\n${MEMORY_BANNER_MARKER} blah\n`);
    }
  }, (root) => {
    assert.deepEqual(checkOptInBanners(root), []);
  });
});

test('checkOptInBanners: missing marker in a file → violation names the file', () => {
  withTempRepo((root) => {
    mkdirSync(resolve(root, 'docs/specs'), { recursive: true });
    for (const rel of MEMORY_BANNER_FILES) {
      writeFileSync(resolve(root, rel), `# stub\n\n${MEMORY_BANNER_MARKER} blah\n`);
    }
    // Wipe the marker from one file.
    writeFileSync(resolve(root, 'docs/index.md'), '# stub without marker\n');
  }, (root) => {
    const v = checkOptInBanners(root);
    assert.equal(v.length, 1);
    assert.match(v[0], /docs\/index\.md/);
    assert.match(v[0], /missing/);
  });
});

test('checkOptInBanners: missing file entirely → violation', () => {
  withTempRepo((root) => {
    mkdirSync(resolve(root, 'docs/specs'), { recursive: true });
    for (const rel of MEMORY_BANNER_FILES) {
      if (rel === 'README.md') continue;
      writeFileSync(resolve(root, rel), `# stub\n\n${MEMORY_BANNER_MARKER} blah\n`);
    }
  }, (root) => {
    const v = checkOptInBanners(root);
    assert.equal(v.length, 1);
    assert.match(v[0], /README\.md/);
    assert.match(v[0], /required file missing/);
  });
});

// ── End-to-end: real repo must pass ───────────────────────────────────────────
test('runChecks(repoRoot): returns 0 errors and 0 violations on the real repo', () => {
  const { errors, violations } = runChecks(repoRoot);
  assert.deepEqual(errors, [], `parse errors: ${errors.join(' | ')}`);
  assert.deepEqual(violations, [], `drift: ${violations.join(' | ')}`);
});

test('CLI: exits 0 on the real repo', () => {
  const r = spawnSync(process.execPath, [resolve(here, 'docs-consistency.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
});
