# ai-template — opencode team template

> A pre-wired multi-agent AI development squad template. Powered by opencode with 12 AI agent roles — GitHub is the work management layer (issues, board, PRs, Pages).

> **Status: opt-in.** The memory subsystem is fully built and
> security-controlled (SR1–SR6) but ships **disabled** in this OSS
> release. Enabling triggers a network fetch of ONNX embedding weights
> and loads the native `sqlite-vec` extension; you are responsible for
> populating real SHAs in `.opencode/memory/embeddings.lock` and
> `.opencode/memory/sqlite-vec.lock` before enabling. See the
> [enable-memory runbook](docs/runbooks/enable-memory.md) and
> [ADR-0006](docs/adr/0006-memory-opt-in-for-oss-release.md).

## What this is

- **Agent-infrastructure scaffold**, not an application
- 12 AI agent roles: PM, PO, Tech Lead, BE, FE, Reviewer, QA, Security, SRE, DevOps, AI, Researcher
- GitHub = work management: Issues → Design gate → PRs → Merge → Pages
- Spec-driven, TDD, gitflow-disciplined development workflow

## Team roles at a glance

> **Canonical roster:** `.opencode/agents/pm.md` (Squad self-announcing block + Agent cheat sheet). All other docs derive from it — see ADR-0008.

| Agent | Tag | When to use |
|---|---|---|
| **PM** | `@pm` | Board, sequencing, gate decisions |
| **PO** | `@po` | Scope, acceptance criteria, prioritisation |
| **Tech Lead** | `@tech-lead` | Architecture, ADRs, technical authority |
| **BE** | `@be` | Backend implementation (after gate) |
| **FE** | `@fe` | Frontend implementation + UX fidelity (after gate) |
| **Reviewer** | `@reviewer` | Automated PR review (T1/T2 auto-approve) |
| **QA** | `@qa` | Test plans, verification, regression |
| **Security** | `@security` | Threat modelling, vulnerabilities, OWASP |
| **SRE** | `@sre` | Reliability, performance, runbooks, incidents |
| **DevOps** | `@devops` | CI/CD, Docker, deploy, Pages |
| **Researcher** | `@researcher` | Deep research, Research Brief |
| **AI** | `@ai` | Agent config, MCP, `opencode.json` — only when explicitly invoked |

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
Design gate (three-tier — T1: PM stamp / T2: PO + Tech Lead / T3: + Security + QA)
  ↓
Branch (<type>/<#>-<slug> from main; type ∈ feature|fix|refactor|chore|docs|test)
  ↓
Implement (BE/FE — TDD, spec-driven)
  ↓
PR → Reviewer → Green CI → Merge (explicit user authorization)
  ↓
Docs updated / Board moved / Issue closed
```

See `.opencode/agents/_workflow.md` for the full universal contract and `docs/architecture.md` for the three-tier gate definition.

## What to replace before first use

- [ ] `docs/` placeholder content — replace with your project's docs
- [ ] This README — update for your project and remove template instructions
- [ ] `.env` values — fill in your GITHUB_PAT

## Operational gotchas

- **opencode config is NOT hot-reloaded** — after editing `opencode.json` or any agent file, quit and restart opencode.
- **`package.json` ships with placeholder scripts** (`lint: echo '0'`, `build: echo 'build ok'`). Replace with real implementations before adding application code; `npm ci` will still fail until `package-lock.json` is committed (see `docs/architecture.md` CI section).
- **`docs/` exists** — contains template documentation. Replace with your project's documentation.
- **Agent bash permissions are scoped per role** (least privilege). `git push *` is denied for every role — pushes require explicit user authorization. See the per-role matrix in `docs/architecture.md#per-role-bash-permission-model` and the design rationale in [ADR-0001](docs/adr/0001-grant-git-access.md).

## License

MIT — see [LICENSE](LICENSE).
