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
| `@sa` | Architecture questions, ADRs |
| `@ux` | User flows, layout specs |
| `@be` | Server-side implementation |
| `@fe` | Client-side implementation |
| `@qa` | Test plans, acceptance testing |
| `@sre` | Security, reliability, performance |
| `@devops` | CI/CD, Docker, deployment |
| `@ai` | Agent config, MCP, opencode itself |
| `@researcher` | Deep research — read-only, no code changes |

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

## The design gate
Before any BE/FE writes code, the issue must have:
- [ ] PO signed off on scope
- [ ] SA signed off on architecture
- [ ] QA signed off on test plan
- [ ] UX signed off on flows (if user-facing)

## What agents cannot do without your explicit OK
- Push to remote
- Create or merge a PR
- Post issue comments
- Modify opencode config
