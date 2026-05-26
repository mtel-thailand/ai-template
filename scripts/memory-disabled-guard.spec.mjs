// scripts/memory-disabled-guard.spec.mjs
//
// Unit tests for the memory-disabled detection helpers in _config.mjs.
// Covers isMemoryEnabled() and requireMemoryEnabled() per ADR-0006.
// Run via `node --test scripts/memory-disabled-guard.spec.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { isMemoryEnabled, requireMemoryEnabled, stripJsonComments } from './_config.mjs';

const CANONICAL_MESSAGE_RE = /memory is disabled in opencode\.json; see \/docs\/runbooks\/enable-memory\.md/;

function withTempConfig(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'memory-guard-'));
  const path = join(dir, 'opencode.json');
  writeFileSync(path, content);
  const prev = process.env.OPENCODE_CONFIG;
  process.env.OPENCODE_CONFIG = path;
  try { return fn(path); }
  finally {
    if (prev === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── stripJsonComments ─────────────────────────────────────────────────────────
test('stripJsonComments: strips // line comments outside strings', () => {
  const input = `{
    // top-level comment
    "a": 1, // trailing
    "b": "value // not a comment"
  }`;
  const parsed = JSON.parse(stripJsonComments(input));
  assert.equal(parsed.a, 1);
  assert.equal(parsed.b, 'value // not a comment');
});

test('stripJsonComments: handles a commented-out memory block (mirrors real opencode.json)', () => {
  const input = `{
    "$schema": "https://opencode.ai/config.json",
    // "memory": {
    //   "version": 1,
    //   "backends": { "short": { "type": "file" } }
    // },
    "agent": {}
  }`;
  const parsed = JSON.parse(stripJsonComments(input));
  assert.equal(parsed.memory, undefined);
  assert.ok(parsed.agent);
});

// ── isMemoryEnabled ──────────────────────────────────────────────────────────
test('isMemoryEnabled: returns true when memory block is uncommented', () => {
  withTempConfig('{"memory": {"version": 1}, "agent": {}}', () => {
    assert.equal(isMemoryEnabled(), true);
  });
});

test('isMemoryEnabled: returns false when memory block is commented out', () => {
  const commented = `{
    "$schema": "https://opencode.ai/config.json",
    // "memory": { "version": 1 },
    "agent": {}
  }`;
  withTempConfig(commented, () => {
    assert.equal(isMemoryEnabled(), false);
  });
});

test('isMemoryEnabled: returns false when memory block is absent entirely', () => {
  withTempConfig('{"agent": {}}', () => {
    assert.equal(isMemoryEnabled(), false);
  });
});

test('isMemoryEnabled: returns false when opencode.json is missing', () => {
  const prev = process.env.OPENCODE_CONFIG;
  process.env.OPENCODE_CONFIG = '/nonexistent/path/opencode.json';
  try {
    assert.equal(isMemoryEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = prev;
  }
});

test('isMemoryEnabled: returns false on unparseable opencode.json', () => {
  withTempConfig('{not valid json', () => {
    assert.equal(isMemoryEnabled(), false);
  });
});

// ── requireMemoryEnabled ─────────────────────────────────────────────────────
test('requireMemoryEnabled: invokes exit(1) with canonical message when disabled', () => {
  withTempConfig('{"agent": {}}', () => {
    let exitCode = null;
    let errOut = '';
    requireMemoryEnabled('test-script', {
      exit: (c) => { exitCode = c; },
      errorLog: (m) => { errOut = m; },
    });
    assert.equal(exitCode, 1);
    assert.match(errOut, CANONICAL_MESSAGE_RE);
    assert.match(errOut, /test-script/);
  });
});

test('requireMemoryEnabled: does not invoke exit when enabled', () => {
  withTempConfig('{"memory": {}, "agent": {}}', () => {
    let exitCalled = false;
    requireMemoryEnabled('test-script', {
      exit: () => { exitCalled = true; },
      errorLog: () => {},
    });
    assert.equal(exitCalled, false);
  });
});

test('requireMemoryEnabled: also exits when config file is missing', () => {
  const prev = process.env.OPENCODE_CONFIG;
  process.env.OPENCODE_CONFIG = '/nonexistent/path/opencode.json';
  try {
    let exitCode = null;
    let errOut = '';
    requireMemoryEnabled('test-script', {
      exit: (c) => { exitCode = c; },
      errorLog: (m) => { errOut = m; },
    });
    assert.equal(exitCode, 1);
    assert.match(errOut, CANONICAL_MESSAGE_RE);
  } finally {
    if (prev === undefined) delete process.env.OPENCODE_CONFIG;
    else process.env.OPENCODE_CONFIG = prev;
  }
});
