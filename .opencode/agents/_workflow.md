# Universal Workflow Contract

Every agent in this squad operates under this contract. Read it first. The 6
hard rules apply without exception. This document is referenced by every file
under `.opencode/agents/`.

Autonomous long-running sessions follow the **Long-running session protocol**
(see below) but remain bound by all 6 hard rules — especially rule 2 (never
push without explicit user authorization in the current session).

---

## The 6 Hard Rules (non-negotiable)

1. **Gitflow-style branching. `main` is protected.**
   Branch from `main`. Never commit or push directly to `main`. All merges to
   `main` happen via PR with required reviews and green CI.
   Branch names: `feature/<issue#>-<slug>`, `fix/<issue#>-<slug>`,
   `refactor/<issue#>-<slug>`, `chore/<issue#>-<slug>`,
   `docs/<issue#>-<slug>`, `test/<issue#>-<slug>`.
   Commits follow Conventional Commits and reference the Issue (`#NNN`).

2. **Never push to remote unless explicitly asked.**
   Local commits are fine. `git push`, `gh pr create`, any
   `gh_*_create_pull_request`, any `gh_*_merge_pull_request`, and any tool that
   publishes to GitHub require explicit user authorization in the current
   session. This applies to every agent.

3. **Always pull latest before starting any work.**
   First action of every work session: `git fetch --all --prune` then
   `git pull --rebase origin main` (or rebase the working branch onto the
   latest `main`). If there are local uncommitted changes, stop and ask before
   pulling.

4. **Never work without a ticket.**
   No code, docs, or design artifacts without an open GitHub Issue assigned or
   at minimum referenced. If asked to "just do a quick thing", first create or
   locate the Issue. PM creates the tracking Issue; PO fills description and
   acceptance criteria; everyone else attaches their work to it.

5. **Always keep GitHub up to date.**
   Issue: status, labels, assignee, comments at every phase transition.
   Board: card moves with the phase. PR: linked to Issue ("Closes #N"), follows
   template, reviewers requested. Pages (`/docs`): every PR that changes
   behavior, contracts, or architecture also updates `/docs/`. Use the
   role-scoped `gh_*` MCP tools — never bypass them.

6. **Always document changes and update technical documents.**
   Code change → `/docs/` update (ADRs, architecture, API contracts, runbooks
   as relevant). SA writes ADRs. PO writes feature specs in `/docs/specs/`.
   UX writes UX specs in `/docs/ux/`. DevOps writes runbooks in
   `/docs/runbooks/`. The `docs-skip` label is the ONLY exception, and only for
   trivial changes (typos, formatting, CI tweaks with no behavior impact).

---

## Design Gate — two tiers

FAST-TRACK (no gate required): changes scoped to docs, config, chore,
or refactor with no API/schema/UI impact. PM declares fast-track
on the issue. BE/FE may proceed immediately.

FULL GATE (required for feat/fix with user-facing or architectural impact):
PO + SA required. QA required if logic changes. UX required only if
UI/flow changes. SRE required only if security or infra is affected.
Minimum sign-offs: 2. Maximum required: all applicable roles.

Gate is async — agents leave a sign-off comment on the issue.
PM polls and unblocks when minimum threshold is met.

## Definition of Ready (DoR) — before starting

- [ ] GitHub Issue exists, is assigned, and is on the Project board.
- [ ] Acceptance criteria are written, testable, and unambiguous.
- [ ] Dependencies and blockers are identified and linked.
- [ ] Design gate has passed for implementation work (PO, SA, QA, SRE signed
      off; UX too for user-facing changes).
- [ ] Latest `main` is pulled and the working branch is up to date.
- [ ] Branch is created from `main` using the correct naming convention.

## Definition of Done (DoD) — before reporting complete

- [ ] All acceptance criteria are met and demonstrated.
- [ ] Tests are green locally and in CI (when a PR exists).
- [ ] `/docs/` is updated for any behavior, contract, or architecture change.
- [ ] Issue is updated with a status comment and labels reflect current state.
- [ ] Project board card is moved to the correct column.
- [ ] PR is opened (or ready to open on explicit request), with the Issue
      linked via "Closes #N" and reviewers requested.
- [ ] Handoff comment is posted on the Issue if another agent is next.

---

## Pre-flight checklist (every work session)

1. Read the Issue and its comments. Confirm you are the right owner for the
   current phase.
2. `git fetch --all --prune` then rebase onto latest `main`.
3. Confirm DoR is satisfied. If not, stop and request what is missing.
4. Create or check out the correct branch (`<type>/<issue#>-<slug>`).
5. Post a status comment on the Issue: "Starting work — phase X".

## Per-phase checklist (during work)

- Commit in small, atomic, Conventional-Commit-formatted units. Reference the
  Issue: `feat(scope): short imperative (#NNN)`.
- Keep changes spec-driven; do not expand scope. Flag scope creep to the PM.
- Update `/docs/` alongside code in the same commit when behavior changes.
- Re-run tests after each green increment.

## Post-flight checklist (before reporting done)

1. Confirm DoD is satisfied.
2. Push only if explicitly authorized in this session.
3. Post a structured handoff comment on the Issue (template below).
4. Move the board card. Update labels. Re-assign if needed.
5. Stop. Do not auto-start the next ticket.

---

## Branch naming reference

| Type | Example |
|------|---------|
| Feature | `feature/42-todo-due-date-filter` |
| Bug fix | `fix/87-null-guard-localstorage` |
| Refactor | `refactor/91-extract-use-due-date-filter` |
| Chore | `chore/16-universal-workflow-contract` |
| Docs | `docs/55-adr-state-management` |
| Test | `test/63-e2e-overdue-scope` |

Slug: kebab-case, lowercase, ≤ 5 words, summarizes intent.

## Commit message reference

```
<type>(<scope>): <imperative short summary> (#NNN)

<body — what and why, not how. Wrap at 72 chars.>

<footer — Closes #NNN, Refs #NNN, BREAKING CHANGE: ...>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`,
`ci`, `build`. One logical change per commit. Imperative mood. No trailing
period in the subject.

---

## Handoff template (post as Issue comment)

```
### Handoff → @<next-agent>

**Done in this phase:**
- <bullet points of what is complete>

**Next:**
- <what the receiving agent must do>

**Artifacts:**
- PR: <link or "not yet opened — awaiting authorization">
- Docs: <links to /docs files touched>
- Tests: <files added/changed>

**Open questions / risks:**
- <anything the next agent needs to decide or watch>

**Status:** moving board card to "<column>".
```

---

## Rollback procedure

- Every change must be independently revertable. No commit may depend on a
  later commit to be safe.
- Incomplete behavior ships behind a feature flag (default off).
- If a change causes a regression in `main`:
  1. Open a `fix/<issue#>-revert-<slug>` branch.
  2. `git revert <sha>` for the offending commit(s) — preserve history; do
     not force-push.
  3. Open a PR labeled `rollback`. Reference the original Issue and the
     incident in the description.
  4. Notify the PM. The PM updates the Issue and board.

---

## Autonomy tiers

AUTONOMOUS (no human approval needed):
- Creating and updating issues
- Moving board cards
- Commenting on issues and PRs
- Creating branches
- Committing locally

NEEDS ONE-TIME SESSION APPROVAL:
- First push of a new branch ("Ready to push branch X?")
- Opening a PR ("Ready to open PR for #N?")

ALWAYS REQUIRES EXPLICIT APPROVAL PER ACTION:
- Merging a PR
- Closing an issue manually
- Modifying opencode.json or any agent file

Agents should batch their approval requests — ask once per session,
not once per command.

## Long-running session protocol

For autonomous multi-agent sessions. Replaces the older "stop and hand back"
escalation pattern. All 6 hard rules still apply — especially rule 2: this
protocol never pushes, opens, or merges PRs without explicit user
authorization. The autonomous loop runs local-only by default.

### §1. Time-boxed blocker detection

Declare a blocker if **any one** of these is true:

- 30 minutes of focused work with no measurable progress.
- 3 consecutive failed attempts at the same step (red → red → red, no new
  learning between attempts).
- An external dependency you cannot resolve (missing credentials, missing
  decision, ambiguous spec, third-party outage).
- A decision required that exceeds the agent's authority (scope change,
  architecture deviation, security trade-off).
- A failing test you cannot diagnose after one full debugging pass using the
  `debugging-and-error-recovery` skill.

Do not improvise around a blocker. Do not silently change scope, contracts,
or architecture. File the blocker (§2) and move on (§4).

### §2. Blocker Issue protocol

When blocked, the agent MUST:

1. Create a **new GitHub Issue** (not a comment on the parent) titled
   `[BLOCKER] <parent#> <short summary>`.
2. Label it `blocker` plus the most appropriate of `needs-decision`,
   `needs-info`, or `needs-review`.
3. Fill the Blocker Issue template (§3) completely. Suggestions are required,
   not optional.
4. Link to the parent ticket: post a comment on the parent saying
   `Blocked by #<blocker#>`.
5. Move the parent ticket's board card to `Blocked`. Remove the agent's
   assignment from the parent (keep it on the blocker Issue).
6. Post a one-line status on the parent referencing the blocker Issue.
7. **Pick the next ticket** from the work queue (§4) and continue. Do not
   stop the session.

### §3. Blocker Issue template

```
**Parent ticket:** #<N>

**What I was trying to do:**
<1–2 sentences describing the goal>

**Where I am stuck:**
<exact step / error message / decision point>

**What I tried:**
- <attempt 1 — outcome>
- <attempt 2 — outcome>
- <attempt 3 — outcome>

**What I need:**
<decision / info / credentials / review — be specific>

**Suggested options:**
1. <option A> — trade-offs: <pros/cons>
2. <option B> — trade-offs: <pros/cons>
3. <option C> — trade-offs: <pros/cons>

**Recommended option:** <A | B | C> — <why>

**Default I will take if no answer by <ISO timestamp>:**
<a safe default — usually "wait" or "lowest-risk option". Never "ship anyway".>

**Impact of waiting:**
<what else this blocks, urgency>

**Owner needed:** @<user> / <role>

**Files / links:**
- <path:line>
- <log excerpt>
- <draft PR or branch link, if any>
```

### §4. Work-queue selection (next-ticket rules)

After filing a blocker, the idle agent picks the next ticket in this strict
priority order:

1. An **unblocked ticket already assigned** to this agent role.
2. A board ticket labeled `ready` or in column `In Progress` with **no
   assignee** that matches this agent's role.
3. A ticket in `Design Approved` matching this agent's role and not blocked.
4. The agent's role-specific backlog filtered by `priority:high`.
5. If none of the above: file a `needs-work` Issue addressed to PM and pause
   this role's loop (see §6 / §8).

**Single-active-ticket rule still applies.** Each implementer agent (BE, FE)
holds at most **one** ticket in `In Progress` at any time. Parked or blocked
tickets do not count toward this limit. Park with a comment + board move to
`Paused` before switching; the blocker Issue itself is the park record for
blocked tickets.

### §5. Poll-for-answers (unblock sweep)

The session does **not** poll synchronously after filing a blocker. It runs
an **unblock sweep** at every phase transition: start of a new ticket, end of
a ticket, end of a TDD red-green-refactor cycle.

For each blocker Issue this agent (or its orchestrator) filed:

1. Query GitHub for comments newer than the agent's last visit timestamp on
   Issues still labeled `blocker`.
2. If a comment contains a clear decision / answer:
   - Unblock the parent ticket, remove the `Blocked` board state, requeue
     the parent at the **front** of the work queue.
   - Close the blocker Issue with a comment summarising the resolution.
   - Add label `auto-resolved` if the agent applied the recommended option
     or its documented default per §3.
3. If the comment is ambiguous: reply **once** asking for clarification. Do
   not re-spam. Leave the blocker open and the parent in `Blocked`.

**Cadence with exponential backoff per blocker:** 15min → 30min → 1h → 2h →
4h → 8h → daily. Cap at 24h. Reset to 15min on any new comment.

**Long-stall rule:** if a blocker has no human response for 24h, add the
`escalate` label and tag the PM agent via an Issue comment. PM may re-route
the work or accept the agent's documented default from §3.

### §6. Session loop (autonomous mode)

The orchestrator (PM) runs this loop. Implementer agents are invoked from
step 4.

```
loop:
  1. Refresh state — fetch GitHub, prune stale board cards.
  2. Unblock sweep — check filed blockers for answers (§5).
  3. Pick next ticket from queue (§4) for each idle implementer.
  4. Delegate ticket to the right agent.
  5. Receive result:
       done    → handoff, move card, continue.
       blocked → blocker Issue created (§2), card → Blocked, continue.
       failed  → file `bug` Issue against the workflow itself,
                 pause that role, continue with other roles.
  6. Session summary every 5 tickets or every 60 min, whichever first (§7).
  7. Check hard-stop conditions (§8). If any hit, stop and wait for human.
```

### §7. Session summary (checkpoint)

PM creates and maintains one pinned `Session Log` Issue per long-run session,
labeled `session-log`. At every checkpoint (every 60 min OR every 5 tickets,
whichever first), the orchestrator posts a single comment containing:

- **Completed this checkpoint:** ticket #s.
- **In progress:** ticket # + owner agent.
- **Blocked:** blocker # + age + parent #.
- **Queued:** next tickets to pick up.
- **Decisions made autonomously:** with one-line rationale each.
- **Needs human attention:** explicit list, top of comment if non-empty.

### §8. Hard stops (never auto-continue past these)

The autonomous session MUST stop and wait for the user when any of these are
true:

- A push, PR open, or PR merge is needed (hard rule 2 — never push without
  explicit ask in the current session).
- **All** implementer roles are simultaneously blocked.
- A blocker Issue has been open >24h with no human answer **and** no safe
  default is available.
- A change would touch the 6 hard rules, `main` directly, or production
  config.
- A security alert appears (SRE escalation path).
- The Session Log Issue accumulates >10 unanswered blockers.

When stopping, the orchestrator posts a `Session paused — awaiting human`
summary comment on the Session Log Issue with the reason and the smallest
unblocking action the user can take.

### §9. Required labels

These labels must exist in the repo. PM (or AI agent) creates any missing
ones before starting an autonomous session.

| Label | Color | Meaning |
|-------|-------|---------|
| `blocker` | red | Blocking other work |
| `needs-decision` | yellow | Human decision required |
| `needs-info` | yellow | More info required to proceed |
| `needs-review` | yellow | Human review required |
| `escalate` | orange | Stalled >24h, needs PM attention |
| `ready` | green | Design-approved, ready to implement |
| `session-log` | gray | Long-running session tracking issue |
| `auto-resolved` | blue | Agent unblocked itself with documented default |

### §10. Cross-references

- Time-box triggers in §1 supersede the older 30-min / 3-attempt language
  that previously lived in `Escalation rules`.
- Single-active-ticket rule is folded into §4.
- Hard rule 2 (never push without explicit ask) governs §6 step 5 and §8.
- Debugging failures invoke the `debugging-and-error-recovery` skill before
  declaring a §1 blocker.

## Status broadcast

At every phase transition, the responsible agent posts a one-paragraph status
comment on the Issue: what just finished, what is next, who owns it.
Phases: `triage → design → design-approved → implementation → review → qa →
sre → ready-to-ship → shipped`.

## Least-privilege enforcement

Agents must not use tools outside their declared `tools:` allowlist. The AI
agent audits this periodically and files Issues for violations.

---

## When the 6 hard rules conflict with a request

The hard rules win. Tell the user which rule applies, why, and what the
correct path is. Do not silently bypass.
