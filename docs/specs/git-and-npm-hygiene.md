# Feature spec — Git & npm hygiene skill

**Status:** Draft (awaiting design gate)
**Tier:** T2 (Standard — PO + Tech Lead sign-off)
**Owner role:** @ai (post-gate)
**Related:** ADR-0001 (per-role bash permission matrix)

## Problem statement

The four agents that hold bash entitlements — `@devops`, `@ai`, `@be`,
`@fe` (per ADR-0001) — can currently run `git`, `npm`, and `npx`
commands without an explicit, shared rulebook governing **how** they
should run them. The universal workflow contract (`_workflow.md`)
covers gitflow branching and the "no remote push without
authorization" rule, but it intentionally stays short and does not
prescribe day-to-day pre-flight checks, npm install hygiene, recovery
procedures, or destructive-command etiquette.

This gap creates real risk:

- **Repo corruption** — agents acting on stale or detached state
  without first running `git status` / `git branch --show-current` /
  `git remote -v`.
- **Force-push accidents** — no shared norm against rewriting shared
  history or pushing to `main`/`master` without explicit instruction.
- **Leaked secrets** — no explicit rule against committing `.env`
  files or other untracked artifacts that may slip in.
- **Broken installs** — agents assuming `node_modules` exists, using
  `npm install` when `npm ci` is correct, or introducing a second
  lockfile by switching package managers mid-task.
- **Silent destructive actions** — running `rm -rf`, `git reset
  --hard`, `git clean -fd`, `git checkout -- .`, etc. without first
  describing the action and its blast radius.

A shared, role-scoped skill pack is the lightest fix that follows the
existing template patterns (32 skills already live under
`.opencode/skills/`).

## Target user

The four bash-enabled agents (`@devops`, `@ai`, `@be`, `@fe`) and,
through them, every human reviewer or operator who inherits the
repository state those agents produce.

## Value

- Removes a class of "should-have-known-better" mistakes.
- Makes guardrails legible and versioned, so they evolve with the
  template instead of living in agent prompts or human memory.
- Carries forward to every cloned project — new squads inherit the
  same hygiene baseline.

## In scope

- A new skill pack at
  `.opencode/skills/git-and-npm-hygiene/SKILL.md` with frontmatter
  (`name`, `description`) and body covering the 7 rule categories
  enumerated below.
- A binding mechanism — chosen by Tech Lead at the design gate —
  that ensures `@devops`, `@ai`, `@be`, and `@fe` load this skill.
  Candidate mechanisms: `skills:` frontmatter on the agent file, an
  in-body `skill` directive, or a sufficiently specific
  auto-load description.
- An update to `docs/architecture.md` "Skill System" section so the
  new skill is discoverable.
- A `CHANGELOG.md` entry under **Unreleased**.

## Out of scope

- Modifications to the 6 hard rules in
  `.opencode/agents/_workflow.md`. This change is **additive**; the
  contract is unchanged.
- Modifications to bash permission scopes in
  `.opencode/opencode.json`. The permission matrix from ADR-0001
  stays as-is.
- Adding bash entitlements to roles that don't currently have them.
- Authoring or modifying any application code.

## The 7 rule categories the skill must cover

1. **Pre-flight checks** — always run `git status`, `git branch
   --show-current`, and `git remote -v` before acting; surface
   anything unexpected before proceeding.
2. **Local cleanliness** — leave the working tree clean; no stray
   temp files or branches; no duplicate files; clean up artifacts
   the task created.
3. **Commits** — only commit when asked or at a clear logical unit;
   clear Conventional Commit messages; one logical change per
   commit; never commit secrets, `.env`, or other untracked
   credentials.
4. **Remote safety** — always `git fetch` before push; never
   force-push shared branches; never push to `main`/`master` without
   explicit instruction; never rewrite shared history; describe
   destructive actions before running them.
5. **Recovery** — if confused, **STOP** and diagnose with
   `git status`, `git log`, `git branch -a`, and `git reflog`; use
   reflog instead of guessing; do not "fix" with another destructive
   command.
6. **npm hygiene** — never assume install state; check for
   `node_modules`, `package.json`, and lockfiles; prefer `npm ci`
   when a lockfile exists; verify install succeeded (don't trust
   exit codes blindly); use the project's existing package manager
   (don't introduce a second lockfile); prefer project-local or
   dev dependencies over global installs.
7. **General** — describe destructive commands **before** running
   them; verify outcomes (don't just say "done"); ask when
   uncertain about destructive actions.

The skill should preserve the **spirit and intent** of the rules
verbatim — agents must read them as operating norms, not
suggestions.

## Acceptance criteria

- [ ] **AC1** — Skill file exists at
  `.opencode/skills/git-and-npm-hygiene/SKILL.md` with valid
  frontmatter (`name`, `description`).
  - **Given** a fresh clone of the repo
  - **When** a reader navigates to the skill path
  - **Then** the file is present and parses as a valid skill pack
    (frontmatter + body)
- [ ] **AC2** — Skill body covers all 7 rule categories above, each
  as a clearly labelled section.
  - **Given** the skill file is open
  - **When** a reader scans the headings
  - **Then** sections for *Pre-flight checks*, *Local cleanliness*,
    *Commits*, *Remote safety*, *Recovery*, *npm hygiene*, and
    *General destructive-command etiquette* are present
- [ ] **AC3** — All four bash-enabled agents (`@devops`, `@ai`,
  `@be`, `@fe`) reference or load the skill via the mechanism Tech
  Lead selects at the design gate.
  - **Given** the four agent definition files
  - **When** the binding mechanism is inspected
  - **Then** each of the four agents demonstrably loads or
    references `git-and-npm-hygiene`
- [ ] **AC4** — `docs/architecture.md` "Skill System" section
  mentions the new skill (or is regenerated from a skill inventory
  that includes it).
  - **Given** the rendered architecture page
  - **When** a reader searches for the skill name
  - **Then** the skill appears in the documented inventory
- [ ] **AC5** — No changes are made to the 6 hard rules in
  `.opencode/agents/_workflow.md`.
  - **Given** the diff for this PR
  - **When** `_workflow.md` is inspected
  - **Then** rules 1–6 are byte-for-byte unchanged
- [ ] **AC6** — No changes are made to agent bash permissions in
  `.opencode/opencode.json`.
  - **Given** the diff for this PR
  - **When** `opencode.json` is inspected
  - **Then** the permissions block is byte-for-byte unchanged
- [ ] **AC7** — `CHANGELOG.md` has a new entry under **Unreleased**
  describing the addition.
  - **Given** the updated `CHANGELOG.md`
  - **When** a reader scans the Unreleased section
  - **Then** an entry referencing the new skill and this Issue is
    present
- [ ] **AC8** — The PR is reviewed by `@reviewer` and CI is green
  before merge (standard merge gate; called out for clarity).

## Minimal Valuable Slice

The slice above **is** the MVP. Splitting the skill body from the
binding mechanism would ship a dead file to `main`; bundling them is
correct.

## Prioritization (RICE)

- **Reach:** 4 agents × every cloned project — broad.
- **Impact:** Medium-high — prevents a class of repo-corruption
  mistakes; high blast radius if a force-push or secret-leak occurs
  even once.
- **Confidence:** High — pattern matches the 32 existing skill
  packs, no novel infrastructure required.
- **Effort:** Small — one new skill file, four agent bindings, two
  doc touches.
- **Verdict:** Ship before further bash-enabled work lands on `main`.

## Open questions (for design gate)

- **For Tech Lead:** which binding mechanism — `skills:`
  frontmatter, in-body `skill` directive, or auto-load description —
  best matches existing patterns and is least likely to drift over
  time?
- **For Tech Lead:** should the skill cite ADR-0001 inline, or is
  the spec link sufficient?
- **For QA:** how should AC3 be verified mechanically (grep across
  agent files, a script, or manual inspection during review)?
- **For Security:** does the "never commit secrets" rule duplicate
  any existing pre-commit hook coverage (e.g. lefthook secret/PII
  scrubber), and if so should the skill explicitly reference it?
- **For SRE:** any reliability or rollout concern beyond standard
  PR review?

## Dependencies / blockers

None known. ADR-0001 (per-role bash permission matrix) is referenced
informationally only.

## Out-of-band notes

- This spec is the source of truth for the design gate. Tech Lead's
  ADR (if produced) supersedes the binding-mechanism question above.
- Authoring of the skill itself is **post-gate** work assigned to
  `@ai`.
