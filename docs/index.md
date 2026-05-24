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

Requires `GITHUB_PAT` in `.env`. See [Architecture](architecture.md) for
the full design or [Changelog](changelog.md) for version history.

## What's Included

| Area | What You Get |
|------|--------------|
| **Agents** | PM, PO, SA, UX, BE, FE, QA, SRE, DevOps, AI, Researcher — 11 defined roles with scoped MCP servers |
| **Workflow** | Universal contract (6 hard rules), definition of ready/done, design gate, SCRUM-light ceremonies |
| **Skills** | 18 domain skill packs (NestJS, Next.js, React, Docker, security, accessibility, etc.) |
| **CI/CD** | GitHub Actions — build pipeline and docs-check workflow (expects project to add `package.json`) |
| **Docs** | GitHub Pages-ready documentation site |

## Template Structure

```
.opencode/
├── opencode.json      # Platform config: agents, MCP, permissions, models
├── agents/            # 11 role definitions (system prompts + tool bindings)
├── skills/            # 18 skill packs (NestJS, React, security, etc.)
└── start.sh           # Launches opencode with GITHUB_PAT
.github/workflows/     # CI templates (ci.yml, docs-check.yml)
docs/                  # This site — update for your project
```

## Documentation

- [Architecture](architecture.md) — template design, agent system, workflow
- [API Reference](api.md) — template interface, how to consume
- [Research Agent](research-agent.md) — read-only troubleshooting sub-agent
- [Changelog](changelog.md) — version history
