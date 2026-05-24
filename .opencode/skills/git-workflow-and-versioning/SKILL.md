---
name: git-workflow-and-versioning
description: Gitflow-style Git workflow with protected main, issue-scoped branches, Conventional Commits, atomic commits, and the never-push-without-explicit-request rule. Load when branching, committing, planning change sizing, or setting up release tooling.
license: MIT
compatibility: opencode
metadata:
  audience: fe, be, devops, pm, ai
  workflow: versioning
---

## When to use this skill

Load this skill when creating branches, writing commit messages, reviewing commit history, planning change sizing, or setting up CI/CD that depends on commit parsing (changelogs, version bumps, release notes). Read `.opencode/agents/_workflow.md` first — it is the canonical contract; this skill is the operational detail.

## Overview

This squad uses a gitflow-style discipline with a single protected long-lived branch (`main`), short-lived issue-scoped branches, mandatory PR reviews, and green CI before merge. Conventional Commits power changelog and release tooling.

> **Important policy change.** Earlier versions of this skill described a *trunk-based* workflow. That is superseded. `main` is now protected; all changes land via reviewed PR.

## The non-negotiables

1. **`main` is protected.** No direct commits, no force pushes, no bypass.
2. **Every branch is tied to an Issue.** Branch name encodes the Issue number.
3. **Never push to remote unless the user has explicitly asked in this session.**
   Local commits are fine. `git push`, `gh pr create`, and any
   `gh_*_create_pull_request` / `gh_*_merge_pull_request` require explicit
   authorization.
4. **Always pull latest before starting work.** `git fetch --all --prune` then
   `git pull --rebase origin main`. If you have uncommitted changes, stop and
   ask before pulling.
5. **Conventional Commits, every commit, with Issue reference.**

## Branch strategy

### Branches
- **`main`** — protected, always green, always deployable.
- **Issue branches** — short-lived (1–3 days), branched from `main`, merged
  back via PR.
- No long-running `develop` / `staging` / `release` branches. Use feature
  flags for incomplete work.

### Branch naming
```
<type>/<issue#>-<short-slug>
```

| Type | When |
|------|------|
| `feature/` | New feature or user-facing enhancement |
| `fix/` | Bug fix |
| `refactor/` | Code restructuring with no behaviour change |
| `chore/` | Tooling, config, dependency updates |
| `docs/` | Documentation-only changes |
| `test/` | Adding or fixing tests |

Examples: `feature/42-due-date-filter`, `fix/87-null-localstorage`,
`refactor/91-extract-hook`, `chore/16-universal-workflow-contract`.

Slug: kebab-case, lowercase, ≤ 5 words, summarises intent.

## Commit conventions

### Conventional Commits format
```
<type>(<scope>): <imperative description> (#NNN)

[optional body — what and why, wrap 72 chars]

[optional footer — Closes #NNN, BREAKING CHANGE: ...]
```

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change with no behaviour change |
| `test` | Adding or modifying tests |
| `docs` | Documentation |
| `chore` | Maintenance, config, deps |
| `style` | Formatting, whitespace (no logic) |
| `perf` | Performance improvement |
| `ci` | CI configuration |
| `build` | Build system / external deps |

Examples:
```
feat(todos): add due-date filter dropdown (#42)

fix(useTodos): handle null localStorage on initial load (#87)

refactor(TodoItem): extract LabelList sub-component (#91)
```

### Commit rules
- One logical change per commit. Not "fix stuff".
- Imperative mood: "add feature", not "added feature".
- No trailing period on the subject line.
- Reference the Issue with `(#NNN)` in the subject or `Closes #NNN` in the
  footer.
- Body explains WHAT and WHY, not HOW.

## Change sizing

| Size | Lines changed | Scope |
|------|---------------|-------|
| XS | 1–20 | Single function, config tweak |
| S | 20–50 | Small component change |
| M | 50–100 | One feature slice |
| L | 100–300 | Multi-file feature — consider splitting |
| XL | 300+ | Must split into multiple commits |

**Rule of ~100:** aim for ~100 lines per commit. Larger diffs are harder to
review and more likely to contain bugs.

## Atomic commits

Each commit must:
1. Compile and pass tests (`git bisect`-friendly).
2. Contain one coherent change — not a WIP dump.
3. Be independently revertable.

Squash temporary commits before merging.

## PR discipline

- PR title mirrors the lead commit's subject.
- PR description follows the project's template and includes:
  `Closes #NNN`, summary, screenshots if UI, test plan, rollback plan.
- Reviewers requested per CODEOWNERS or role.
- CI must be green before merge.
- Merge strategy: **squash** by default (one Issue → one commit on `main`).
  Use **merge commit** only when commits are already atomic and meaningful.

## Push & PR authorization

- Local commits: always fine.
- `git push`, `gh pr create`, `gh_*_create_pull_request`,
  `gh_*_merge_pull_request`: only with explicit user authorization for that
  action in the current session.
- If unsure, ask the user. Default to NOT pushing.

## Common rationalisations

| Rationalisation | Reality |
|---|---|
| "I'll clean up the commits later." | Later never arrives. Squash before opening a PR. |
| "This is just a small fix, no need for a branch." | Every change gets a branch. No exceptions. |
| "The commit message is obvious from the diff." | The diff shows WHAT, not WHY. The message captures intent. |
| "I'll push now and clean up after." | No. Pushing changes the contract with the team and triggers CI. |

## Red flags

- Commits titled "fix", "update", "stuff", "WIP".
- Branches with many authors or lasting more than a few days.
- Large diffs (300+ lines) in a single commit.
- Commits that don't compile or fail tests.
- Pushes that were not explicitly authorized.

## Verification

- [ ] Branch name follows `<type>/<issue#>-<slug>` convention.
- [ ] Commit messages follow Conventional Commits and reference the Issue.
- [ ] Each commit is < ~100 lines where possible.
- [ ] All commits compile and tests pass.
- [ ] Branch is rebased onto latest `main` before opening a PR.
- [ ] No push or PR action was taken without explicit user authorization.
