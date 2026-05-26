# ai-template — opencode team template

> A pre-wired multi-agent AI development squad template. Powered by opencode with 11 AI agent roles — GitHub is the work management layer (issues, board, PRs, Pages).

## What this is

- **Agent-infrastructure scaffold**, not an application
- 11 AI agent roles: PM, PO, SA, UX, BE, FE, QA, SRE, DevOps, AI, Researcher
- GitHub = work management: Issues → Design gate → PRs → Merge → Pages
- Spec-driven, TDD, gitflow-disciplined development workflow

## Team roles at a glance

| Agent | Owns |
|---|---|
| **PM** | Board, tickets, sequencing, gate & contract enforcement |
| **PO** | Ticket desc, acceptance criteria, scope, MVP |
| **SA** | Architecture, components, data, BE/FE split, ADRs |
| **UX** | Flows, layout, states, accessibility (UI tickets) |
| **BE** | Server-side implementation (TDD, spec-driven, gitflow) |
| **FE** | Client-side implementation (TDD, spec-driven, gitflow) |
| **QA** | Test plan, acceptance tests, verification, regression |
| **SRE** | Security & reliability requirements, vuln scans, perf tests |
| **DevOps** | Docker, CI/CD, GitHub Pages, releases, runbooks |
| **AI** | Agent system, opencode config, skills, MCP integration |
| **Researcher** | Deep research (web, codebase, libraries) — read-only |

## Prerequisites

- opencode installed (latest version)
- GitHub PAT with `repo`, `project`, `read:org` scopes
- direnv (optional, for .envrc auto-loading)

## Quick start (under 2 minutes)

1. Use this repo as a GitHub template (click "Use this template")
2. Clone your new repo
3. Copy `.env.example` to `.env` and fill in `GITHUB_PAT`
4. Run `./.opencode/start.sh`
5. Tell the PM agent: "Read AGENTS.md and create the project board"

## How work flows

```
Issue (PO writes AC)
  ↓
Design gate (SA + UX + QA + SRE sign off)
  ↓
Branch (feature/<#>-<slug> from main)
  ↓
Implement (BE/FE — TDD, spec-driven)
  ↓
PR → Review → Green CI → Merge
  ↓
Docs updated / Board moved / Issue closed
```

## What to replace before first use

- [ ] `docs/` placeholder content — replace with your project's docs
- [ ] This README — update for your project and remove template instructions
- [ ] `.env` values — fill in your GITHUB_PAT

## Operational gotchas

- **opencode config is NOT hot-reloaded** — after editing `opencode.json` or any agent file, quit and restart opencode.
- **No root `package.json` exists** — CI will fail until you add one. See `ci.yml` for required scripts.
- **`docs/` exists** — contains template documentation. Replace with your project's documentation.
- Agent permissions restrict bash: only `npm run *`, `npm test*`, `npx *`, `git *`, and a few other safe commands.

## License

MIT — see [LICENSE](LICENSE).
