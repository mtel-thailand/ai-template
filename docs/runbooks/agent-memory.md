# Agent Memory — Operator Runbook

> **Audience:** SRE, DevOps, or any operator running `npm run memory:gc`.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **Status:** v1 — initial GC script

## 1. Quick Reference

| Command | What it does | Exit codes |
|---------|-------------|------------|
| `npm run memory:gc` | Full GC run: validate, budget check, evict, write back | 0 OK, 2 budget violation, 3 I/O error |
| `npm run memory:gc:validate` | Validate only (phases 1–2) — safe for CI | 0 pass, 1 fail |
| `npm run memory:gc:dry` | Preview mode — all phases, no writes | 0 OK, 2 budget violation |
| `npm test` | Run GC test suite | 0 pass, 1 fail |

## 2. Common Operations

### 2.1 Validate memory files in CI

The CI workflow `.github/workflows/docs-check.yml` includes a `validate-memory`
job that runs on every PR:

```yaml
validate-memory:
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    - run: npm install --no-audit --no-fund
    - run: node scripts/memory-gc.mjs --validate-only
```

If validation fails:
1. Check the error output for the specific file and field.
2. Open the failing file and fix the offending frontmatter field.
3. Re-run `npm run memory:gc:validate` locally to confirm the fix.

### 2.2 Run a full GC cycle

```bash
# 1. Preview changes
npm run memory:gc:dry

# 2. Review the report. Look for:
#    - Invalid entries (fix before proceeding)
#    - Budget violations (decide on pruning strategy)
#    - Evictions (verify TTL-based removals are expected)

# 3. Apply changes
npm run memory:gc
```

### 2.3 Handle budget violations (exit code 2)

| Tier | Budget | Action |
|------|--------|--------|
| `mid` | ≤ 50 | Review stale entries; summarise into `long` if valuable; delete or let expire |
| `long` | ≤ 200 | Manual review — prune entries with `importance < 3` and `access_count < 5` |
| `frequent` | ≤ 20 | Demote manually by editing `tier:` to `long` (LFU recompute is out of scope for v1) |

### 2.4 Recover an accidentally evicted file

When `forgettable` entries are evicted, the file is renamed with a `.evicted`
suffix. To recover:

```bash
find .opencode/memory/forgettable/ -name "*.evicted" -ls
mv .opencode/memory/forgettable/quick-thought.md.evicted .opencode/memory/forgettable/quick-thought.md
# Update last_accessed to today's date to avoid re-eviction on next run
```

## 3. Troubleshooting

### 3.1 Parse error for a specific file

Malformed YAML frontmatter (unterminated `---`, invalid indentation, tab chars).

**Solution:** Inspect frontmatter delimiters, validate YAML, fix and re-run.

### 3.2 Atomic write fails with EACCES

Filesystem permissions on `.opencode/memory/`.

**Solution:**
```bash
ls -la .opencode/memory/
# Ensure the running user has write permission
```

### 3.3 Gray-matter or Zod not found

```
Error: Cannot find module 'gray-matter'
```

**Solution:**
```bash
npm install
```

### 3.4 `npm test` deleted my memory files

**Known issue.** The current test suite destructively uses the real
`.opencode/memory/` directory. Tracked as a follow-up bug. Until fixed:

- Do NOT run `npm test` if you have real memory files you want to keep.
- Back up `.opencode/memory/` before running the test suite locally.
- CI runs are safe (no real files exist in the CI checkout).

## 4. Schedule

| Cadence | Action | Who |
|---------|--------|-----|
| Every PR touching `.opencode/memory/` or `scripts/memory-gc.*` | CI runs `--validate-only` | CI (docs-check.yml) |
| Weekly (recommended) | Full GC cycle via `npm run memory:gc` | SRE / DevOps |
| Monthly | Manual review of `long` tier | SRE / Tech Lead |
| Ad-hoc | When budget warnings appear in CI | Operator |

## 5. Budget Reference

| Tier | Max entries | TTL | Auto-eviction |
|------|-------------|-----|---------------|
| `short` | Unlimited (≤ 4 KB) | End of session | Session-end purge (out of scope) |
| `mid` | 50 | 30-day sliding | Flagged, not auto-deleted |
| `long` | 200 | None (manual) | None |
| `frequent` | 20 | Nightly recompute | LFU demotion (out of scope) |
| `forgettable` | Unlimited | 7-day hard | Hard-deleted (`.evicted` suffix) |

## 6. Related Documents

- [ADR-0002: Memory GC Script](../adr/0002-memory-gc-script.md) — architectural decisions
- [Agent Memory Specification §3](../specs/agent-memory.md) — 11-field schema
- [Agent Memory Specification §6](../specs/agent-memory.md) — eviction rules
- `.opencode/memory/` — vault root
- `scripts/memory-gc.mjs` — the script
- `scripts/memory-gc.test.mjs` — tests
- `scripts/memory-gc.fixture/` — test fixture vault
