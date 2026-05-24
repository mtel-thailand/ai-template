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

Requires per-role PATs in `.env` (see `.env.example`). See
[Architecture](architecture.md) for the full design or
[CHANGELOG.md](../CHANGELOG.md) for version history.

## What's Included

| Area | What You Get |
|------|--------------|
| **Agents** | PM, PO, Tech Lead, BE, FE, Reviewer, QA, Security, SRE, DevOps, AI — 11 defined roles with scoped MCP servers and per-role PATs |
| **Workflow** | Universal contract (6 hard rules), three-tier design gate, squad metrics tracking |
| **Skills** | 18 domain skill packs (NestJS, Next.js, React, Docker, security, accessibility, etc.) |
| **CI/CD** | GitHub Actions — build pipeline and docs-check workflow (expects project to add `package.json`) |
| **Docs** | GitHub Pages-ready documentation site |

## Template Structure

```
.opencode/
├── opencode.json      # Platform config: agents, MCP, permissions, models
├── agents/            # 11 role definitions (system prompts + tool bindings)
├── skills/            # 18 skill packs (NestJS, React, security, etc.)
└── start.sh           # Launches opencode with per-role PATs
.github/workflows/     # CI templates (ci.yml, docs-check.yml)
docs/                  # This site — update for your project
```

## Documentation

- [Architecture](architecture.md) — template design, agent system, workflow
- [API Reference](api.md) — template interface, how to consume
- [CHANGELOG.md](../CHANGELOG.md) — version history
