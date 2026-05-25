# ADR-0002: Memory GC Script

## Status

Accepted

## Date

2026-05-25

## Context

Issue #16 implements the garbage collection script (`npm run memory:gc`) called out in the
[Agent Memory Specification](../specs/agent-memory.md) (§6 — Eviction Rules,
§14 — Reference Materials). The spec defines:

- Five memory tiers with distinct retention policies (`short`, `mid`, `long`, `frequent`, `forgettable`).
- An 11-field strict Zod schema for frontmatter validation (per §3).
- Budget limits per tier (e.g., `mid` ≤ 50, `long` ≤ 200, `frequent` ≤ 20).

The squad needs a single-entry-point script that an operator (or CI) can run to:

1. Validate that every memory file conforms to the 11-field strict schema.
2. Check that each tier is within its budget.
3. Flag and/or remove entries that violate eviction rules (TTL-based).
4. Report results in a human-readable format.

The script must be safe to run in CI (`--validate-only`) and safe to preview
before making changes (`--dry-run`). It must also write changes atomically to
avoid corruption.

## Decisions

### 1. Language & Runtime — Node.js ESM

The script is a standalone ES module (`memory-gc.mjs`) running on Node.js ≥22. Node is already a project dependency and ESM is the standard for new Node.js scripts. Bun and Deno were considered but would add a new runtime requirement with no benefit for a file-system walk + YAML parse workload.

### 2. Dependencies — `gray-matter` and `zod` only

| Dependency | Purpose | Type |
|-----------|---------|------|
| `gray-matter` ^4.0.3 | YAML frontmatter parsing + stringify for round-trip writes | dev |
| `zod` ^3.23.0 | Runtime schema validation (11-field strict schema) | dev |

Both are dev dependencies — they are not required at production runtime. No other runtime dependencies are introduced.

### 3. 5-Phase Architecture

The script runs five sequential phases:

| Phase | Name | What it does | Exit on |
|-------|------|-------------|---------|
| 1 | Discover & Parse | Walk `.opencode/memory/`, parse all `.md` with `gray-matter` | I/O error → 3 |
| 2 | Validate | Validate each entry's frontmatter against the 11-field Zod schema | Violation → 1 (with `--validate-only`) |
| 3 | Enforce Budgets | Count entries per tier, compare against budget limits | Over-budget → 2 |
| 4 | Evict & GC | Apply TTL rules: `mid` (30d), `forgettable` (7d); flag entries | N/A (reported in output) |
| 5 | Write Back | Atomic-rename writes for updated entries; remove evicted files | Skipped in `--dry-run`/`--validate-only` |

### 4. Flags — `--validate-only` and `--dry-run`

Two flags control execution mode:

- **`--validate-only`**: Runs phases 1–2 only. Exits 0 if all entries are valid (including empty vault), exits 1 if any entry fails schema validation.
- **`--dry-run`**: Runs all five phases but skips the write/delete operations in phase 5.

### 5. Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All entries valid, within budgets, evictions applied |
| 1 | Schema validation failure |
| 2 | Budget violations |
| 3 | I/O error or unexpected internal failure |

Exit code 2 is documented per the Issue #16 spec: "Budget enforcement → exit code 2".

### 6. Atomic Writes

All writes to the memory vault use atomic-rename: write to a temp file, then `renameSync()` over the target path. On Unix-like systems (including CI containers), `rename()` is atomic at the filesystem level.

### 7. Eviction — Soft-Delete for Forgettable, Flag for Mid

- `forgettable` past 7-day TTL: truncated and renamed to `<name>.md.evicted` extension (soft-delete; recoverable).
- `mid` past 30-day sliding TTL: flagged in the report; no automatic deletion.
- `long` and `frequent`: no auto-eviction by GC. `frequent` LFU recompute is out of scope for this ticket.
- `short`: session-scoped, gitignored, purged outside this script.

### 8. Testing — `node:test` (built-in)

The test suite uses Node's built-in `node:test` and `node:assert` modules. Zero extra dependencies. Sufficient for a script-level test suite.

**Known issue:** the current test suite destructively uses the real `.opencode/memory/` directory for setup/teardown. Tracked as a follow-up bug.

### 9. Fixture Vault

A fixture directory at `scripts/memory-gc.fixture/` holds sample memory files for manual smoke-testing. All fixture files use the canonical 11-field frontmatter. The `bad-schema.md` fixture includes an extra `random_field` to verify strict-mode rejection.

## Consequences

### Positive

- Single entry point for all memory GC operations.
- CI integration via `--validate-only`.
- Safe preview via `--dry-run`.
- Atomic writes prevent file corruption.
- Zero runtime deps.

### Negative

- No automatic mid-tier summarisation — stale mid entries are flagged but not auto-archived.
- No concurrent-safe locking — atomic rename prevents corruption but the second process may see stale state.
- `frequent` LFU recompute is out of scope.
- Tests are currently destructive on local dev (follow-up).

## Alternatives Considered

### Script runtime

- **Node.js ESM (chosen)**: already in the project, no new runtime.
- **Python 3**: adds Python to CI and dev machines. Rejected.
- **Shell script (bash)**: too limited for Zod schema validation.

### Validation library

- **Zod (chosen)**: `strict()` mode for unknown field rejection, excellent error messages.
- **Valibot**: smaller bundle, not already in the project.
- **Manual validation**: fragile and verbose.

### Test framework

- **`node:test` (chosen)**: built-in, zero deps.
- **Vitest**: adds a dependency for a single test file.
- **Jest**: CommonJS-first, slower.

## References

- Issue #16 — GC script implementation
- PM schema ruling: https://github.com/mtel-thailand/ai-template/issues/16#issuecomment-4531853051
- [Agent Memory Specification §3](../specs/agent-memory.md) — 11-field schema
- [Agent Memory Specification §6](../specs/agent-memory.md) — eviction rules
- ADR-0001 — Grant git access to squad agents
- [Operator Runbook](../runbooks/agent-memory.md) — how to operate the GC
