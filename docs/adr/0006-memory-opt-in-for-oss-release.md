# ADR-0006: Memory Subsystem Opt-In for OSS Release

## Status

**Accepted** — design gate cleared on Issue #64 with sign-offs from
@po ([4541312570]), @tech-lead ([4539595040]), @security ([4539595395]),
@qa ([4539590786]). PM consolidation: [4541348824].

[4541312570]: https://github.com/mtel-thailand/ai-template/issues/64#issuecomment-4541312570
[4539595040]: https://github.com/mtel-thailand/ai-template/issues/64#issuecomment-4539595040
[4539595395]: https://github.com/mtel-thailand/ai-template/issues/64#issuecomment-4539595395
[4539590786]: https://github.com/mtel-thailand/ai-template/issues/64#issuecomment-4539590786
[4541348824]: https://github.com/mtel-thailand/ai-template/issues/64#issuecomment-4541348824

## Date

2026-05-26

## Issue

#64 — `epic: memory subsystem — decide & document enable/disable state for
OSS release` (parent: #59 OSS readiness).

## Context

The memory subsystem is fully designed and security-controlled but
**runtime-inert** in the shipped template:

- [ADR-0003](./0003-sqlite-vec-memory-backend.md) ratifies the SQLite +
  `sqlite-vec` + transformers-js backend stack.
- [`/docs/specs/agent-memory.md`](../specs/agent-memory.md) defines the
  five-tier architecture, frontmatter schema, and retrieval flow.
- 12 runbooks under `/docs/runbooks/memory-*.md` cover bootstrap, backup,
  troubleshooting, performance, and lint operations.
- Six security controls (SR1–SR6) are wired at the file-system and CI level
  (see threat model T-01..T-10 in ADR-0003 and the SR table in
  [`/docs/architecture.md`](../architecture.md#security-controls)).
- The `memory:` configuration block in
  [`.opencode/opencode.json`](../../.opencode/opencode.json) (lines 10–50)
  is **commented out** as of commit `a209fa4`.

This creates a credibility risk for new OSS users: documentation describes a
working memory subsystem; the running template silently does nothing.

Three options surfaced in #64:

| Option | Description |
|---|---|
| A | Ship enabled (uncomment block, ensure first-run graceful handling) |
| B | Ship disabled, document the opt-in path loudly |
| C | Toggle via `.env` flag wired through `start.sh` |

### Decision drivers

1. **Honest first-run experience.** New users cloning the template should
   not encounter a crash on `npm run memory:*` because of unsolved binary
   distribution.
2. **Security-by-default.** Memory enabling activates a network fetch (ONNX
   weights from HuggingFace via `@xenova/transformers`) and loads a native
   SQLite extension (`sqlite-vec`). The user should make those trust
   decisions consciously.
3. **No erosion of SR1–SR6.** Whichever option ships, the six security
   controls must remain active and CI-verified.
4. **Reversibility.** The choice should not foreclose later transitions to
   Option A once the `bin/sqlite-vec` distribution story is solved.

### Investigation findings (Tech Lead, comment [4539595040])

- **`bin/sqlite-vec` does not exist in the repo.**
  `scripts/_memory-backend.mjs:116–124` throws if the extension fails to
  load. Option A as written cannot work today on a fresh clone.
- **The `memory:` block in `opencode.json` is not interpreted by opencode
  itself.** Only `scripts/*.mjs` consumers read it via `_config.mjs`.
- **`scripts/_config.mjs:129`** — `const rawMemory = raw.memory ?? {}`
  applies the full DEFAULTS regardless. Scripts behave identically whether
  the block is present or commented.
- **SR1–SR6 are decoupled from `opencode.json` state.** All six controls
  live at file-system + CI level.

### Threat-model findings (Security, comment [4539595395])

- **Finding 1** — Lock files (`embeddings.lock`, `sqlite-vec.lock`) ship
  with all-zero placeholder SHAs. Option A's first-run would crash
  fail-closed on `IntegrityVerificationError` (`scripts/_integrity-verifier.mjs:82`).
  This is safe but is a first-run UX cliff.
- **Finding 2** — SR4 enforcement gap in `scripts/_memory-backend.mjs:117–124`:
  `sqliteVec.load(db)` is called without a preceding
  `verifyExtensionIntegrity` check. SR4 is enforced in the TS backend
  (`memory/src/sqlite-vec-backend.ts:222`) but not in the script path.
  This is a pre-existing gap, filed as a follow-up ticket (not blocking
  this ADR).

## Decision

**Ship the memory subsystem disabled by default.** Keep the `memory:`
block commented in `.opencode/opencode.json`. Document the opt-in path via
`/docs/runbooks/enable-memory.md`. Add "Status: opt-in" callouts to
`README.md`, `/docs/index.md`, `/docs/architecture.md`, and
`/docs/specs/agent-memory.md`.

### Script behavior matrix (when memory disabled)

| Script | Behavior | Rationale |
|---|---|---|
| `memory:gc` (full run) | Operate on file vault; **print clear INFO** naming this runbook | File-vault GC of `short/` and `forgettable/` is independent of the SQLite tier |
| `memory:gc:validate` | Validate file-vault frontmatter; exit 0 on clean | CI's `validate-memory` job depends on this working when memory is disabled |
| `memory:gc:dry` | Same as `memory:gc` (INFO log, file-only) | Dry-run of the full GC path |
| `memory-export.mjs` (no npm wrapper) | **Fail-fast with exit 1** + canonical message | SQLite-tier op; meaningless without the backend |
| `memory-import.mjs` (no npm wrapper) | **Fail-fast with exit 1** + canonical message | SQLite-tier op; meaningless without the backend |
| `memory:lint` | **Always active** | Security guard (SR6); active even when memory disabled |
| `memory:ci:db-check` | **Always active** | Security guard (SR1); active even when memory disabled |

Canonical fail-fast message (per @qa refinement #3, accepted by @po):

```
memory is disabled in opencode.json; see /docs/runbooks/enable-memory.md
```

### Banner messaging (per @po directive)

The banners and runbook **must avoid** the word "experimental." The
subsystem is production-quality. Preferred framing:

> Opt-in for OSS users. Memory infrastructure is fully built and
> security-controlled (SR1–SR6); enabling requires populating lock files
> and accepting documented trust anchors. See
> [`/docs/runbooks/enable-memory.md`](../runbooks/enable-memory.md).

## Consequences

### Easier

- No first-run crash from missing `bin/sqlite-vec` or placeholder lock SHAs.
- CI stays green without shipping the native binary.
- Lower OSS support burden — users opt in deliberately.
- SR1–SR6 guards remain wired at the file-system + CI level regardless of
  the memory enable/disable state.

### Harder

- Must maintain `/docs/runbooks/enable-memory.md` in sync with the SQLite
  backend lifecycle.
- Must keep this ADR in sync when (a) `bin/sqlite-vec` distribution is
  solved or (b) Finding 2 is fixed or (c) agent-runtime memory tools ship.
- Doc surface area grows by one runbook + four banner callouts +
  `docs-consistency` banner check.

### Neutral

- Architecture diagrams remain accurate. Memory IS core architecturally;
  it is opt-in for the template's OSS release.

## Alternatives Considered

### Option A — Ship enabled (rejected)

Rejected because:
- `bin/sqlite-vec` distribution is unsolved (Tech Lead investigation).
- Lock files ship with all-zero placeholder SHAs; first-run on a fresh
  clone would crash fail-closed (Security Finding 1).
- Finding 2 (SR4 enforcement gap in the `.mjs` script path) would have to
  be fixed first; @security marked this as a hard precondition for A
  (AC-SEC-A2).

Re-evaluable once: (a) `bin/sqlite-vec` distribution ships, (b) lock files
contain real SHAs, (c) Finding 2 fixed.

### Option C — `.env` toggle (rejected)

Rejected because:
- The `memory:` block in `opencode.json` is not interpreted by opencode
  itself; only our scripts read it via `_config.mjs`. A toggle would build
  enable/disable machinery for a flag with no runtime effect on the
  platform.
- We can flip to A by uncommenting + amending this ADR once A's
  preconditions are met. A toggle is premature.
- @qa's CI verification plan for C required two named jobs
  (`memory-enabled`, `memory-disabled`) both running the full SR suite — a
  significant CI footprint expansion for a state-flip we can do via ADR
  amendment.

### Amendment to ADR-0003 (rejected as the vehicle)

Considered but rejected (per @tech-lead recommendation): ADR-0003 is the
**backend technology** decision (SQLite + sqlite-vec + transformers-js).
This ADR is the **release-mode** decision (opt-in vs. enabled-by-default
for OSS). Different concern; different reversibility window. Linking
ADR-0006 → ADR-0003 as a dependency is the cleaner relationship.

## SR-to-test mapping (per AC-SEC-1)

Each security control with its enforcing artifact, verifying that SR1–SR6
remain active under Option B:

| SR | Control | Enforcing artifact | Active when memory disabled? |
|---|---|---|---|
| SR1 | No `.db*` files in git | `.gitignore` + `.github/workflows/db-guard.yml` running `scripts/ci-check-db-not-staged.mjs` | **Yes** — index scan, not runtime |
| SR2 | JSONL export excludes embeddings (mitigates T-10 Vec2Text) | `scripts/_config.mjs:62` (`exports.excludeFields:["embedding"]`) + `sr2-jsonl-no-embedding.spec.ts` | Yes — script-level rule (no runtime export trigger) |
| SR3 | ONNX weight integrity via `embeddings.lock` | `scripts/_embedder.mjs:89–106` (fail-closed: drop pipe, unlink cache, throw `IntegrityVerificationError`) | Yes — code path unreachable when memory disabled; activates on opt-in |
| SR4 | sqlite-vec extension integrity | `memory/src/integrity-verifier.ts` (TS backend) — **gap in `scripts/_memory-backend.mjs` script path tracked as Finding 2 follow-up** | Yes for TS path; gap follow-up filed |
| SR5 | FTS5 query safety | Phrase-quoting by default; allowlist in advanced mode; `search.ftsTimeoutMs=500` | Yes — script-level, no runtime invocation when disabled |
| SR6 | JSONL secrets-ban regex | `npm run memory:lint` via `scripts/memory-lint.mjs` + `scripts/memory-secret-patterns.mjs` | **Yes** — always active, CI-required regardless of memory state |

## Supply-chain trust anchors (named, per AC-SEC-A3)

When an operator enables memory, they implicitly trust:

1. **`@xenova/transformers`** (npm) — ONNX runtime + `Xenova/all-MiniLM-L6-v2`
   model delivery from HuggingFace on first embed call. Mitigated by SR3
   (fail-closed SHA-256 check of `.opencode/memory/embeddings.lock`)
   **only after** the operator replaces placeholder zeros with real SHAs.
2. **`sqlite-vec`** (npm) — bundled native extension loaded via
   `sqliteVec.load(db)`. SR4 enforcement currently TS-only; script-path
   gap tracked as Finding 2.
3. **`bin/sqlite-vec`** (optional, operator-supplied) — when present,
   takes precedence over the npm-bundled binary. SHA verification against
   `.opencode/memory/sqlite-vec.lock` per platform.
4. **`better-sqlite3`** (npm) — synchronous SQLite driver. Standard npm
   trust model.

`/docs/runbooks/enable-memory.md` surfaces these in a "before you enable"
security checklist (AC-SEC-B2).

## Out of scope

- Solving `bin/sqlite-vec` distribution (would unblock a future ADR
  transitioning to Option A).
- Fixing Finding 2 (SR4 enforcement gap in the script path) — separate
  follow-up issue.
- Building agent-runtime memory tools (separate epic).
- Any change to the embedder, tiers, or backend (locked by ADR-0003).

## References

- [ADR-0003: SQLite + sqlite-vec as Default Memory Backend](./0003-sqlite-vec-memory-backend.md)
- [ADR-0008: Canonical Roster Source of Truth](./0008-canonical-roster-source-of-truth.md) (numbering convention; 0004 and 0005 are reserved-but-unused per CHANGELOG Errata)
- [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
- [`/docs/runbooks/enable-memory.md`](../runbooks/enable-memory.md)
- Issue #64 — design gate (PO + Tech Lead + Security + QA sign-offs)
- Issue #59 — OSS readiness epic (parent)
