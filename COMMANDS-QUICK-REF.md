# Quick reference — how to work with this system

## Starting work
| What you want | How to do it |
|---|---|
| Start opencode | `./.opencode/start.sh` |
| Open a new ticket | GitHub → Issues → New issue (use template) |
| Check the board | GitHub → Projects |
| Begin a feature | `@pm create issue for: [description]` |

## Talking to agents
Use `@agent-name` in opencode to address a specific role.

| Agent | When to use |
|---|---|
| `@pm` | Sequencing, board, gate enforcement |
| `@po` | Acceptance criteria, scope decisions |
| `@tech-lead` | Architecture, ADRs, technical authority |
| `@be` | Server-side implementation |
| `@fe` | Client-side implementation + UX |
| `@reviewer` | PR review, Tier 1/2 auto-approval |
| `@qa` | Test plans, acceptance testing |
| `@security` | Threat modeling, vulnerability scanning |
| `@sre` | Reliability, performance, incident response |
| `@devops` | CI/CD, Docker, deployment |
| `@ai` | Agent config, MCP, opencode itself, deep research |

## Branch naming
```
feature/<issue#>-<short-slug>
fix/<issue#>-<short-slug>
docs/<issue#>-<short-slug>
chore/<issue#>-<short-slug>
```

## Commit format
```
feat: add user authentication
fix: correct date parsing in scheduler
docs: update architecture diagram
chore: upgrade opencode dependency
refactor: extract payment service
test: add QA acceptance tests for login
```

## The design gate (three tiers)
Before any BE/FE writes code, the required sign-offs depend on the tier:

| Tier | Scope | Required sign-offs |
|------|-------|-------------------|
| **T1** — Trivial | Docs, typos, CI config, refactors | PM stamps "tier-1" |
| **T2** — Standard | Single feature, API extension, bug fix | PO + Tech Lead |
| **T3** — Major | New architecture, new dep, security boundary | PO + Tech Lead + Security + QA |

## What agents cannot do without your explicit OK
- Push to remote
- Create or merge a PR
- Post issue comments
- Modify opencode config
