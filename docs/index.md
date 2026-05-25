# ai-todo

A **multi-agent AI coding template** — not a traditional application. This
repository contains agent definitions, skill packs, platform configuration,
and a universal workflow contract that turns a GitHub repo into a
spec-driven, TDD, gitflow-disciplined AI development squad.

> **No application source code lives here.** Use this template to start new
> projects with the full squad already configured.

## Getting Started

```bash
# 1. Clone the template
git clone <your-repo>

# 2. Start opencode
./.opencode/start.sh
```

Requires a single `GITHUB_PAT` in `.env` (see `.env.example`). See
[Architecture](architecture.md) for the full design or
[CHANGELOG.md](../CHANGELOG.md) for version history.

## What's Included

| Area | What You Get |
|------|--------------|
| **Agents** | PM, PO, Tech Lead, BE, FE, Reviewer, QA, Security, SRE, DevOps, AI, Researcher — 12 defined roles with role-scoped MCP servers (single shared `GITHUB_PAT`) |
| **Workflow** | Universal contract (6 hard rules), three-tier design gate (T1/T2/T3), autonomy tiers, long-running session protocol |
| **Skills** | 33 domain skill packs (NestJS, Next.js, React, Docker, security, accessibility, etc.) |
| **CI/CD** | GitHub Actions — build pipeline and docs-check workflow (expects project to add `package.json`) |
| **Docs** | GitHub Pages-ready documentation site |

## Template Structure

```
.opencode/
├── opencode.json      # Platform config: agents, MCP, permissions, models
├── agents/            # 12 role definitions (system prompts + tool bindings)
├── skills/            # 33 skill packs (NestJS, React, security, etc.)
└── start.sh           # Launches opencode after loading GITHUB_PAT from .env
.github/workflows/     # CI templates (ci.yml, docs-check.yml)
docs/                  # This site — update for your project
```

## Documentation

- [Architecture](architecture.md) — template design, agent system, workflow
- [API Reference](api.md) — template interface, how to consume
- [CHANGELOG.md](../CHANGELOG.md) — version history
