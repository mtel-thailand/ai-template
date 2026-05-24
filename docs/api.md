# API Reference

This template **exposes no runtime API**. It is an infrastructure
configuration repo. The "API" it provides is the agent system interface
consumed by opencode and the workflow contract consumed by the squad.

## Agent System Interface

The template is loaded by opencode via `opencode.json`:

```json
{
  "agents": { /* 11 role definitions */ },
  "mcpServers": { /* GitHub, file system, web */ },
  "permissions": { /* per-agent command/tool access */ }
}
```

### Entrypoints

| File | Purpose |
|------|---------|
| `.opencode/opencode.json` | Platform bootstrap — agent definitions, MCP servers, permissions |
| `.opencode/agents/_workflow.md` | Universal workflow contract (6 hard rules, DoR, DoD) |
| `.opencode/agents/{role}.md` | Per-role system prompt with tool restrictions |
| `.opencode/skills/{name}/SKILL.md` | Domain-specific instruction packs |
| `.opencode/start.sh` | Launch script — loads `GITHUB_PAT` from `.env` |
| `AGENTS.md` | Team working agreement (loaded as system instruction) |

### Agent MCP Server Mapping

Each agent has a **scoped** GitHub MCP server:

| Agent | MCP Server | Scope |
|-------|-----------|-------|
| PM | `gh_pm` | Board, notifications, PRs, projects |
| PO, SA, UX | `gh_design` | Issues, labels, branches, files |
| BE, FE | `gh_dev` | Code, PRs, actions, gists |
| QA | `gh_qa` | Code, PRs, actions |
| SRE | `gh_sre` | Security advisories, alerts |
| DevOps | `gh_devops` | Actions, deployments, alerts |
| AI, Researcher | `gh_research` | Code search, repository browsing |

See `.opencode/opencode.json` for per-agent tool restrictions.

## How to Consume This Template

### As a new project starter

1. Clone or fork this repository
2. Remove `.opencode/start.sh` sample `.env` references, add your own
3. Create a root `package.json` with `lint`, `build`, `test` scripts
   (matching `.github/workflows/ci.yml`)
4. Add your application code under `src/` (or wherever your stack places it)
5. Replace `docs/` content with your project's documentation
6. The squad is ready to go — start filing Issues

### Contract

The template guarantees:

- **No application code** — zero business logic shipped
- **No runtime** — no server, no DB, no API endpoints
- **No dependencies** — no `package.json`, no `node_modules`
- **CI is a template** — workflows exist but will not pass until a project
  adds its own `package.json`
- **Portable** — copy the `.opencode/` directory into any repo to activate
  the agent squad there
