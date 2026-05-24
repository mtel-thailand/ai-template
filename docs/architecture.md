# Architecture

This template is a **developer-infrastructure repo** — it configures the
opencode platform to run a multi-agent AI development squad. No application
server or frontend code is shipped here.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | opencode | Multi-agent orchestration, MCP integration, role-scoped tool access |
| Agent config | `opencode.json` | Declarative agent definitions with MCP server mappings |
| Workflow | Custom (`.opencode/agents/_workflow.md`) | Spec-driven, TDD, gitflow, design-gate enforced |
| CI | GitHub Actions | Standard for GitHub repos; templates ready for new projects |
| Docs | GitHub Pages via `/docs/` | Colocated with source, auto-deployed |

## Agent System

### Architecture Overview

```
GitHub (Issues/PRs/Board)
        ↑ MCP (role-scoped)
   ┌────┴────┐
   │ opencode│
   │ platform│
   └────┬────┘
        │
   ┌────┴──────────────────────────────────┐
   │  Agent Squad                          │
   │                                       │
   │  PM ─── orchestrator                  │
   │  PO ─── scope & criteria              │
   │  SA ─── design & ADRs                 │
   │  UX ─── flow & accessibility          │
   │  BE ─── backend impl (TDD)            │
   │  FE ─── frontend impl (TDD)           │
   │  QA ─── test plan & sign-off          │
   │  SRE ─── security & perf              │
   │  DevOps ─── infra & CI/CD             │
   │  AI ─── agent system config           │
   │  Researcher ─── read-only deep        │
   │                 research              │
   └───────────────────────────────────────┘
```

### Design Gate

Every feature follows a **hard gate** before any code is written:

```
PO writes Issue + AC
  → SA designs architecture
  → UX designs flows (if user-facing)
  → QA writes test plan
  → SRE states requirements
  → ALL sign off
  → BE/FE implement TDD against spec
  → QA verifies → SRE checks → Ship
```

## Workflow Contract

The 6 hard rules in `_workflow.md` enforce:

1. **Gitflow branching** — `feature/<#>-<slug>` off `main`, PRs, Conventional Commits
2. **No remote push without authorization** — human in the loop
3. **Pull latest before work** — always start fresh
4. **No work without a ticket** — every change traces to an Issue
5. **Keep GitHub current** — board, labels, PR links, docs move together
6. **Always document** — ADRs, specs, runbooks

## Skill System

Skills are reusable instruction packs loaded on demand by agents:

- **Domain skills**: NestJS, Next.js, React, TypeScript, Vite, Docker, etc.
- **Cross-cutting skills**: accessibility, security, performance, code review
- **Workflow skills**: spec-driven development, incremental implementation,
  planning & task breakdown, shipping & launch

Skills are stored under `.opencode/skills/<name>/SKILL.md` and loaded via
the `skill` tool when a task matches a skill's description.

## CI/CD

| Workflow | Purpose | Current Status |
|----------|---------|---------------|
| `ci.yml` | `npm ci` → `lint` → `build` → `test` | ❌ Fails until project adds `package.json` |
| `docs-check.yml` | Enforces docs update when `src/` changes | ✅ No-op until source exists |

New projects should create a root `package.json` with matching scripts.

## Persistence

This template has no runtime persistence. The only mutable state is:

| Store | What |
|-------|------|
| GitHub Issues | Tickets, bugs, feature requests |
| GitHub Project | Board status per ticket |
| `docs/` | Documentation (checked into git) |
| `.opencode/` | Agent and skill configuration (checked into git) |
