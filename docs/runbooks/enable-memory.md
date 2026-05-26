# Runbook: Enable the Memory Subsystem

> **When to use this runbook.** You are an operator of a fork of this
> template who wants to turn on the dual-backend agent memory vault
> (`.opencode/memory/memory.db` + file-vault tiers). The template ships
> with memory **disabled** per
> [ADR-0006](../adr/0006-memory-opt-in-for-oss-release.md); this runbook is
> the supported opt-in path.

## What "enabled" means

- The `memory:` block in `.opencode/opencode.json` is uncommented.
- `scripts/memory-export.mjs` and `scripts/memory-import.mjs` no longer
  fail-fast — they operate on `.opencode/memory/memory.db`.
- `scripts/memory-gc.mjs` exercises both file-vault and SQLite-tier paths.
- On first embed call, `@xenova/transformers` fetches
  `Xenova/all-MiniLM-L6-v2` ONNX weights from HuggingFace (≈ 25 MB) into
  the local cache.
- On first SQLite open, the `sqlite-vec` native extension is loaded into
  the `better-sqlite3` connection.

## Always-on (regardless of enable state)

These remain active whether memory is enabled or disabled — they are
security guards, not memory operations (per ADR-0006 §"SR-to-test
mapping"):

- `npm run memory:lint` — SR6, JSONL secrets-ban regex scan.
- `.github/workflows/db-guard.yml` → `scripts/ci-check-db-not-staged.mjs`
  — SR1, prevents `.db*` files from entering the git index.
- `npm run memory:gc:validate` — file-vault frontmatter validation
  (Zod schema check from
  [`/docs/specs/agent-memory.md`](../specs/agent-memory.md#3-frontmatter-schema-strict--unknown-fields-rejected)).

## Before you enable — security checklist

Complete every item before flipping the switch. Skipping any one of them
is a security regression, not a convenience trade-off.

- [ ] **Replace placeholder SHAs in `embeddings.lock`.** Open
      `.opencode/memory/embeddings.lock`. Each file entry currently lists
      `0000000000000000000000000000000000000000000000000000000000000000`.
      Compute the real SHA-256 of every file you are willing to load
      (`shasum -a 256 <file>`) using artefacts you obtained from
      `Xenova/all-MiniLM-L6-v2` on HuggingFace, and paste the real digests
      into the lockfile. The integrity verifier
      (`scripts/_integrity-verifier.mjs`) is fail-closed — placeholder
      zeros guarantee a crash on first embed, by design (SR3).
- [ ] **Replace placeholder SHAs in `sqlite-vec.lock`.** Same procedure,
      per-platform (darwin-arm64, linux-x86_64, etc.). If you ship a
      pre-built binary at `bin/sqlite-vec`, its SHA must match the
      lockfile entry for your platform (SR4). If you rely on the
      npm-bundled binary, populate the SHA the bundled artefact resolves
      to.
- [ ] **Confirm `npm run memory:lint` is wired into pre-commit and CI.**
      The shipped Lefthook config (`.lefthook/`) and the
      `quality-gate.yml` workflow already run it; verify your fork has
      not removed it (SR6).
- [ ] **Confirm `db-guard.yml` is active in CI.** Inspect
      `.github/workflows/db-guard.yml`. It must fail any PR that stages a
      `*.db`, `*.db-wal`, `*.db-shm`, or `*.db-journal` file (SR1).
- [ ] **Read the supply-chain trust anchors** named in
      [ADR-0006 §Supply-chain trust anchors](../adr/0006-memory-opt-in-for-oss-release.md#supply-chain-trust-anchors-named-per-ac-sec-a3).
      Enabling memory means you accept these as trusted code paths in
      your fork.
- [ ] **Be aware of Security Finding 2.**
      `scripts/_memory-backend.mjs:117–124` calls `sqliteVec.load(db)`
      without invoking `verifyExtensionIntegrity` — the SR4 enforcement
      currently lives only in the TypeScript backend
      (`memory/src/sqlite-vec-backend.ts:222`). The script-path gap is
      tracked as a follow-up to #64; until it is closed, SR4 is enforced
      only on the TS code path.

## Enable

Once the checklist is complete:

```bash
# 1. Edit .opencode/opencode.json and uncomment the memory: block
#    (lines 10–50). Strip the leading `//` from each line.

# 2. Reinstall to ensure better-sqlite3 + sqlite-vec are built locally.
npm install

# 3. Validate the file-vault path still parses (frontmatter check).
npm run memory:gc:validate

# 4. Run the full GC. First run will create memory.db, init the schema,
#    and pre-load the sqlite-vec extension. ONNX weights are fetched
#    only when an embed call actually fires.
npm run memory:gc
```

If step 4 prints `memory subsystem disabled in opencode.json — running
file-vault GC only`, the uncomment did not take effect — re-check
`.opencode/opencode.json` line by line.

## Verify

| Check | Command | Expected |
|---|---|---|
| Memory detected as enabled | `node -e "import('./scripts/_config.mjs').then(m => console.log(m.isMemoryEnabled()))"` | `true` |
| `memory.db` exists | `ls -lh .opencode/memory/memory.db` | file present |
| Schema initialized | `sqlite3 .opencode/memory/memory.db ".tables"` | `entries entries_fts entries_vec ...` |
| SR1 still active | `git check-ignore .opencode/memory/memory.db` | path printed (gitignored) |
| SR6 still active | `npm run memory:lint` | exits 0 on a clean export dir |

Additionally, run the runbook **end-to-end in a clean clone within 7 days
of merging any change to `opencode.json` or this runbook** (per @qa
refinement #4 on Issue #64). Record tester + timestamp in the PR
description.

## Disable (reverse the enable)

```bash
# 1. Re-comment the memory: block in .opencode/opencode.json
#    (prepend // to each line of the block).

# 2. The on-disk memory.db is left in place (gitignored). To purge:
rm -f .opencode/memory/memory.db .opencode/memory/memory.db-wal .opencode/memory/memory.db-shm

# 3. Confirm scripts return to file-only mode.
npm run memory:gc:validate
# → "memory subsystem disabled in opencode.json — running file-vault GC only"
```

## Script behavior matrix (per ADR-0006)

| Script | Memory disabled | Memory enabled |
|---|---|---|
| `npm run memory:gc` (full) | File-vault GC; prints disabled INFO; exit 0 | Full GC across file + SQLite tiers |
| `npm run memory:gc:validate` | File-vault frontmatter check; exit 0 | Same |
| `npm run memory:gc:dry` | File-vault dry-run; prints disabled INFO; exit 0 | Full GC dry-run across both backends |
| `node scripts/memory-export.mjs` | **Exit 1** with canonical message | Exports `memory.db` to JSONL |
| `node scripts/memory-import.mjs` | **Exit 1** with canonical message | Imports JSONL into `memory.db` |
| `npm run memory:lint` | Active (SR6) | Active (SR6) |
| `npm run memory:ci:db-check` | Active (SR1) | Active (SR1) |

The fail-fast canonical message for SQLite-tier scripts is:

```
<script>: memory is disabled in opencode.json; see /docs/runbooks/enable-memory.md
```

## Related runbooks

- [`memory-db-setup`](./memory-db-setup.md) — database initialization, PRAGMAs, verification
- [`memory-backup-restore`](./memory-backup-restore.md) — backup and restore of the SQLite vault
- [`memory-troubleshooting`](./memory-troubleshooting.md) — common error diagnosis
- [`memory-embedder-load-failure`](./memory-embedder-load-failure.md) — what to do when SR3 fails closed
- [`memory-lint`](./memory-lint.md) — SR6 operations

## References

- [ADR-0006: Memory Subsystem Opt-In for OSS Release](../adr/0006-memory-opt-in-for-oss-release.md)
- [ADR-0003: SQLite + sqlite-vec as Default Memory Backend](../adr/0003-sqlite-vec-memory-backend.md)
- [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
- Issue #64 — design gate sign-offs
