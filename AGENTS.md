# Team working agreement

This is an **agent-infrastructure / team-template repo**, not a traditional
application. The real content is `.opencode/` — agent definitions, skills, and
platform config. No application source code exists yet (no `src/`, no root
`package.json`).

CI workflows reference `npm ci`, `npm run lint`, `npm run build`, `npm test` —
they **will fail** until a root `package.json` with those scripts is created.

---

## Universal workflow contract (read first)

Every agent operates under `.opencode/agents/_workflow.md`. Read it before
doing anything else. The 6 hard rules apply without exception:

1. **Gitflow-style branching.** `main` is protected. Branch from `main` using
   `feature/<#>-<slug>`, `fix/<#>-<slug>`, `refactor/<#>-<slug>`,
   `chore/<#>-<slug>`, `docs/<#>-<slug>`, or `test/<#>-<slug>`. All merges to
   `main` go through a reviewed PR with green CI. Conventional Commits.
2. **Never push to remote unless explicitly asked.** `git push`, PR creation,
   and PR merge require explicit user authorization in the current session.
3. **Always pull latest before starting work.** `git fetch --all --prune`
   then `git pull --rebase origin main`.
4. **Never work without a ticket.** No code, docs, or design without an open
   Issue.
5. **Always keep GitHub up to date.** Issue status, board card, labels, PR
   links, and `/docs/` move together.
6. **Always document changes.** ADRs for architectural decisions, specs under
   `/docs/specs/`, UX specs under `/docs/ux/`, runbooks under
   `/docs/runbooks/`. `docs-skip` is for trivial changes only.

Full contract (DoR, DoD, handoff template, rollback, escalation):
`.opencode/agents/_workflow.md`.

---

## How this repo is structured

| Path | What it is |
|---|---|
| `.opencode/opencode.json` | Platform config: agents, MCP servers, permissions, model selection |
| `.opencode/agents/_workflow.md` | **Universal workflow contract — read first** |
| `.opencode/agents/*.md` | Per-role system prompts |
| `.opencode/skills/` | Domain skill packs |
| `.opencode/start.sh` | Loads `GITHUB_PAT` from `.env`, then launches opencode |
| `.github/workflows/ci.yml` | Build & test pipeline (expects npm scripts that don't exist yet) |
| `.github/workflows/docs-check.yml` | Enforces docs update when `src/` changes |
| `docs/` | Template documentation site (GitHub Pages) |

## Starting opencode

```bash
./.opencode/start.sh            # loads .env then launches opencode
```

The start script reads `GITHUB_PAT` from `.env` before starting opencode.
Without it, the `gh_*` MCP tools will not be available.

`.envrc` (direnv) auto-exports `GITHUB_PAT` from `.env` — install direnv or
use `start.sh` directly.

This file is loaded as a system instruction via `opencode.json` →
`instructions: ["AGENTS.md", "docs/index.md", "docs/architecture.md"]`.
These docs files are present as template content; update them for your
project.

---

## GitHub as work management

- **Issues** = unit of work & bug log. PO writes description + acceptance
  criteria. QA/SRE file bugs as Issues.
- **Project board** = status tracking across design → build → ship phases.
  PM owns it.
- **Pull requests** = code changes. Every PR references its Issue
  ("Closes #N"). Opened/merged only on explicit user authorization.
- **Pages** = `/docs` published as GitHub Pages. DevOps owns site config.

Each agent has a **role-scoped GitHub MCP server** — it only sees the tools
its role needs. `opencode.json` maps toolsets per agent. Agent files in
`.opencode/agents/*.md` further restrict tool access via `tools:`
frontmatter.

## Conventions

- Link everything: every PR references its Issue; every ticket Issue is on
  the Project board.
- Keep the board current as tickets move through phases and the design gate.
- New ticket = one Issue with acceptance criteria as a checklist.
- Docs-first: every PR changing source must update `/docs/` unless labeled
  `docs-skip`.
- Bug reports: clear title, reproduction steps, expected vs. actual, severity
  label.
- The squad is spec-driven & TDD. Implementation is gated behind design
  sign-off (PO, SA, QA, SRE all must agree; UX too for user-facing work).
- BE/FE must not write code until the design gate has passed.

## Agent roles at a glance

| Agent | Owns | MCP server |
|---|---|---|
| **PM** | Board, tickets, sequencing, gate & contract enforcement | `gh_pm` |
| **PO** | Ticket desc, acceptance criteria, scope, MVP | `gh_design` |
| **Tech Lead** | Architecture, components, data, BE/FE split, ADRs, technical authority | `gh_tech_lead` |
| **BE** | Server-side implementation (TDD, spec-driven, gitflow) | `gh_dev` |
| **FE** | Client-side implementation + UX fidelity (TDD, spec-driven, gitflow) | `gh_dev` |
| **Reviewer** | Automated PR review, can approve Tier 1/2 autonomously | `gh_reviewer` |
| **QA** | Test plan, acceptance tests, verification, regression | `gh_qa` |
| **Security** | Threat modeling, vulnerability scanning, secret detection, OWASP Top 10 | `gh_sec` |
| **SRE** | Reliability & performance, SLOs/SLIs, load testing, incident response | `gh_sre` |
| **DevOps** | Docker, CI/CD, GitHub Pages, releases, runbooks, observability (event tracking, error logging, monitoring) | `gh_devops` |
| **AI** | Agent system, opencode config, skills, MCP integration, deep research | `gh_ai` |
| **Docs Writer** | User-facing documentation, in-app copy, onboarding content, error messages, release notes, help articles | `gh_design` (shares) |

> **Note:** Docs Writer is a lightweight sub-role with no dedicated MCP server; it shares the `gh_design` server with PO.

Route opencode/MCP/agent-infrastructure questions to **AI** (`@ai`), not
BE/FE.

---

## Environment & secrets

- `GITHUB_PAT` is stored in `.env` (gitignored) and used in `.envrc` for
  direnv auto-loading.
- The `.opencode/.gitignore` keeps `node_modules`, `package.json`, and
  `package-lock.json` out of the `.opencode/` subtree in git.

## Operational gotchas

- **opencode config is NOT hot-reloaded** — after editing `opencode.json` or
  any agent file, quit and restart opencode.
- **No root `package.json` exists** — CI will fail. Before adding application
  code, create one with `lint`, `build`, and `test` scripts matching CI.
- **`docs/` exists** — contains template documentation for the AI workflow
  template. Replace with your project's documentation when starting a new
  project.
- Agent permissions in `opencode.json` restrict bash: only `npm run *`,
  `npm test*`, `npx *`, `git *`, and a few other safe commands are allowed.
