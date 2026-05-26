# ADR-0008: Canonical source of truth for squad roster and per-role bash policy

**Status:** Accepted
**Date:** 2026-05-26

## Context

Issue #61 (documentation consistency audit) surfaced that the squad roster and
per-role bash permission policy are duplicated across multiple files —
`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/architecture.md`, and
`.opencode/agents/pm.md`. The duplicates have drifted: the README listed
11 agents with obsolete `SA` and `UX` roles; the architecture.md per-role
bash table claimed "five agents" when six have explicit per-role blocks
(Reviewer was missing); CHANGELOG referenced ADR-0004 and ADR-0005 that
never landed on disk.

Without an explicit ground-truth designation, future drift is the default.
Three forces converge here:

1. **Discoverability.** A new contributor or external reader should know
   where to look for the authoritative roster and policy.
2. **Enforcement.** Once a canonical source is named, an automated check
   can fail CI on drift. Without one, there is no contract to enforce.
3. **Maintainability.** A single source of truth means edits happen in one
   place; every other reference is derived (and machine-verified).

The PO sign-off and Tech Lead sign-off on #61 both confirmed
`.opencode/agents/pm.md` as the canonical roster source. This ADR records
that decision and extends it to the per-role bash policy.

## Decision

We will treat **`.opencode/opencode.json`** as the canonical source for the
**per-role bash permission policy**, and **`.opencode/agents/pm.md`**
("Squad self-announcing" block and "Agent cheat sheet" table) as the
canonical source for the **squad roster** (agent names, tags, and one-line
purpose).

All other documents — `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
`docs/architecture.md`, `CHANGELOG.md`, `.env.example` — must derive their
roster and per-role-bash content from these two files. Where duplication is
unavoidable for narrative readability (e.g., the bash matrix in
`docs/architecture.md`), the derived copy must:

1. Carry an inline note pointing back to the canonical source.
2. Be covered by `scripts/docs-consistency.mjs`, which fails CI on drift.

### Enforcement

A new ESM script — `scripts/docs-consistency.mjs` — mirrors the
`memory-gc.mjs` pattern and runs in the `docs-check.yml` CI workflow. It
asserts:

- The set of `agent.*` keys in `opencode.json` equals the roster in
  `pm.md` (cheat-sheet table).
- The roster rows in `README.md`, `CONTRIBUTING.md`, and the architecture
  diagram in `docs/architecture.md` match the canonical roster (name set,
  ignoring order).
- The per-role bash table in `docs/architecture.md` matches the per-role
  `permission.bash` blocks in `opencode.json` (presence/absence of git
  push, git read, npm, docker entries per role).

Exit codes follow the `memory-gc.mjs` convention: `0` = clean, `1` =
schema/parse error, `2` = drift detected.

### Scope of "canonical"

- **In scope:** roster (names, tags, purpose), per-role bash permissions.
- **Out of scope (handled elsewhere):** MCP toolset assignments
  (declared in `opencode.json` `mcp.*` blocks; no separate doc duplication);
  individual agent system prompts (each `.opencode/agents/<role>.md` owns
  its own behavior — only the *list* of agents is roster-canonical);
  workflow contract content (`_workflow.md` is itself canonical for the
  6 hard rules).

## Consequences

**Positive:**

- One place to update when adding, renaming, or removing an agent role
  (`.opencode/agents/pm.md` for the roster; `opencode.json` for bash policy).
- CI catches drift before merge — no more "README says 11, CHANGELOG says
  12" issues.
- ADR-0008 itself becomes the rationale citation for the lint script and
  for future PRs touching docs.
- Reviewers can point to this ADR when blocking PRs that introduce
  inconsistencies.

**Negative:**

- Adds one CI check (~150 LOC script + spec). Marginal cost.
- Contributors editing docs need to know "canonical = pm.md +
  opencode.json"; mitigated by an inline note in each derived file (already
  added to README, CONTRIBUTING, architecture.md in PR #61).
- Future ADRs that change the roster shape (e.g., adding a column to the
  cheat sheet) must also update the lint script's parser. Acceptable cost
  given roster changes are rare.

## Alternatives considered

- **(a) Let each file own its own roster, no canonical source.** Status
  quo before #61. Rejected: produces exactly the drift this ticket is
  fixing. Without a designated authority, every edit is a coordination
  problem.

- **(b) Use `opencode.json` as the sole canonical source for both roster
  and policy.** Rejected: `opencode.json` carries no human-facing purpose
  description per agent (only `model`, `temperature`, `permission`,
  `tools`). The cheat-sheet "When to use" column lives in `pm.md` and is
  user-facing material. Splitting roster (pm.md) from policy
  (opencode.json) keeps each source aligned with its native audience —
  pm.md is the squad's introduction; opencode.json is the runtime config.

- **(c) Generate `README.md`/`CONTRIBUTING.md`/`SECURITY.md` from a
  template engine at build time.** Rejected for now: adds a build-step
  dependency for marginal benefit. The set of derived files is small
  (4 today). A lint-on-drift check is simpler, faster to implement, and
  preserves human-edited prose around the canonical tables. Revisit if
  the derived-file count grows past ~8.

- **(d) Use `docs/architecture.md` as the canonical roster source.**
  Rejected: `pm.md` is already loaded into every PM-led session and is the
  Squad self-announcing surface. Moving canonical roster authority away
  from it would either require duplication back into pm.md (defeating the
  purpose) or remove squad self-announcement (worse UX for new sessions).

## References

- Issue: https://github.com/mtel-thailand/ai-template/issues/61
- @po sign-off: https://github.com/mtel-thailand/ai-template/issues/61#issuecomment-4539540957
- @tech-lead sign-off: https://github.com/mtel-thailand/ai-template/issues/61#issuecomment-4539546971
- PM consolidation: https://github.com/mtel-thailand/ai-template/issues/61#issuecomment-4539687921
- Related: [ADR-0001](./0001-grant-git-access.md) (per-role bash policy origin), [ADR-0007](./0007-single-shared-github-pat.md) (canonical `GITHUB_PAT` resolution — pattern this ADR mirrors)
