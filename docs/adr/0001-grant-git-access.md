# ADR-0001: Grant git access to squad agents

**Status:** Accepted  
**Date:** 2026-05-25  

## Context

Issue #17 surfaced a recurring blocker: no implementation agent has effective
local shell access for git. During #15, `@ai` authored 17 file changes but
could not branch/commit; `@devops` was dispatched for the commit step and hit
the same wall. PR #18 was therefore pushed via `gh_dev_push_files` (GitHub
API) — collapsing the local-commit and remote-push gates into one operation
and breaking the multi-commit dispatch plan.

Although `.opencode/opencode.json` declares a global `permission.bash` block,
agents lack effective entitlement; per-agent blocks are needed for explicit,
scoped, auditable grants.

## Decision

| Role | git read (`status`/`diff`/`log`) | git stage/commit | git branch/checkout/fetch/rebase/stash | `git push *` | shell side-effects |
|---|---|---|---|---|---|
| `@devops` | allow | allow | allow | **deny** | `npm`/`npx` allowed, `docker` allowed |
| `@ai` | allow | allow | allow | **deny** | none |
| `@be` | allow | allow | allow | **deny** | `npm`/`npx` allowed |
| `@fe` | allow | allow | allow | **deny** | `npm`/`npx` allowed |
| pm, po, tech-lead, reviewer, qa, security, sre, researcher | **no bash** | — | — | — | — |

Explicit allow for `@ai`/`@be`/`@fe`: `git status`, `git diff`, `git add`,
`git commit`, `git log`, `git branch`, `git checkout`, `git fetch`,
`git rebase`, `git stash`.

Explicit deny across all: `git push *`, `git push --force *`, `git remote add *`,
`git config --global *`.

### Permission encoding

Per-agent block under `agent.<role>` in `.opencode/opencode.json` and matching
`permission.bash` block in each agent's YAML frontmatter under
`.opencode/agents/`.

`@devops` keeps `git *: allow` plus the same deny set, plus `npm`/`npx`/`docker`.
Global `permission.bash` stays as a deny-by-default safety net.

### Push remains gated

`git push *` is denied for every role. Pushes happen only via (a) user running
`git push` themselves outside opencode, or (b) `gh_*_push_files` MCP tools
which already require `GITHUB_PAT` and authenticated API auth. No agent can
write to the remote without explicit, session-scoped user authorization.

## Consequences

**Positive:**
- Local-commit gate unblocked for implementation agents.
- Multi-commit dispatch plans work end-to-end (commit local → push remote).
- Commit/push separation restored.
- Per-role audit trail in one config file.

**Negative:**
- Broader shell surface for 4 agents — new risk vectors (arg-string crafting,
  accidental destructive ops).
- Mitigated by explicit deny rules + trailing `"*": "deny"`.
- Some config duplication across agent blocks; acceptable at this scale.

## Alternatives considered

- **(a) Always use `gh_*_push_files`** — collapses commit+push, cannot express
  multi-commit plans, awkward beyond ~5 files. Rejected as default (kept as
  fallback).
- **(b) Always ask user to run git locally** — high friction; defeats
  orchestration. Rejected.
- **(c) Grant `bash: true` unconditionally** — opens `curl`, `rm -rf`,
  installs. Rejected; violates least-privilege.

## Smoke-test plan

After push + merge + user restarts opencode:

1. Dispatch `@devops` with: `Run 'git status' and 'git log --oneline -5' and
   report output.` → should succeed.
2. Dispatch `@ai` with: `Run 'git status'.` → should succeed.
3. Dispatch `@ai` with: `Run 'git push origin main'.` → should be **DENIED**
   with a permission prompt.
4. Dispatch `@qa` with: `Run 'git status'.` → should be **DENIED** (QA has no
   bash entitlement).
5. Dispatch `@be` with: `Run 'git checkout -b chore/smoke && git commit
   --allow-empty -m "smoke"'.` → should succeed.
6. Dispatch `@be` with: `Run 'git push origin chore/smoke'.` → should be
   **DENIED**.

## References

- Issue: https://github.com/mtel-thailand/ai-template/issues/17
- ADR comment (Tech Lead): https://github.com/mtel-thailand/ai-template/issues/17#issuecomment-4531806135
- PO sign-off: https://github.com/mtel-thailand/ai-template/issues/17#issuecomment-4531810026
