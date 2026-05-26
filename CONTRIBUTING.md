# Contributing to this template

## Who contributes what

> **Canonical roster:** `.opencode/agents/pm.md` (single source of truth — see ADR-0008). This table mirrors the squad cheat sheet there.

| Role | Contributes |
|------|-------------|
| PM | Sequencing, board management, gate enforcement |
| PO | Ticket descriptions, acceptance criteria |
| Tech Lead | Architecture decisions, ADRs in `docs/adr/` |
| BE | Backend implementation — only after design gate passes |
| FE | Frontend implementation + UX fidelity — only after design gate passes |
| Reviewer | PR review, can approve Tier 1/2 autonomously |
| QA | Test plans, acceptance tests, regression verification |
| Security | Threat modeling, vulnerability scanning |
| SRE | Reliability, performance, incident response |
| DevOps | CI/CD, Docker, GitHub Pages |
| Researcher | Deep research, Research Brief (read-only) |
| AI | Agent config, `opencode.json`, skills, MCP integration |

## Development tooling

### Pre-commit hooks (lefthook)

This repo uses [lefthook](https://github.com/evilmartians/lefthook) to run
pre-commit checks. The configuration lives in `lefthook.yml` (top-level) and
the shipped hook scripts in `.lefthook/scripts/`.

**Install (optional but recommended):**

```bash
npm ci
npx lefthook install
```

After installation, every `git commit` triggers the configured hooks.

**What runs (per `lefthook.yml`):**

- `memory-secret-scan` — scans staged files under `.opencode/memory/**`
  against the shared secret/PII pattern module
  (`scripts/memory-secret-patterns.mjs`) used by `npm run memory:lint`. Blocks
  the commit on any match.

**Bypass:** `git commit --no-verify` (emergency only — the CI
`memory:lint` step enforces the same check on push).

## Workflow in 6 steps

1. Open an issue (no issue = no code)
2. Get design gate sign-off on the issue (see three-tier gate in _workflow.md)
3. Branch: `feature/<issue#>-<slug>` from main
4. Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
5. Open a PR referencing the issue (`Closes #N`)
6. Get review + green CI before merging

## Design gate (three tiers)

| Tier | Scope | Sign-off | Target time |
|------|-------|----------|-------------|
| T1 — Trivial | Docs, typos, CI config, refactors | PM stamps "tier-1" | < 5 min |
| T2 — Standard | Single feature, API extension, bug fix | PO + Tech Lead | < 30 min |
| T3 — Major | New architecture, new dep, security boundary | PO + Tech Lead + Security + QA | < 4 h |

## Never

- Push directly to main
- Merge without a reviewed PR
- Create a branch without a ticket
- Write code before the design gate passes

## Docs-first

Every PR that changes behaviour must update `/docs/` unless labeled `docs-skip`.
ADRs are required for architectural decisions.
