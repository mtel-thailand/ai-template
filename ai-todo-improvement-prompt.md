# ai-todo Template Improvement Prompt

> **How to use:** Paste this entire prompt to your opencode AI agent (PM, SA, or AI role) to execute the improvements. Each section is an actionable task with acceptance criteria.

---

## Context

`mtel-thailand/ai-todo` is an **opencode agent-infrastructure template** — not an application repo. Its purpose is to give teams a pre-wired multi-agent workflow system (PM, PO, SA, UX, BE, FE, QA, SRE, DevOps, AI, Researcher) backed by GitHub as the work management layer.

Reviewed against `affaan-m/ECC` (189k stars, production-hardened agent harness), this prompt closes the gaps needed to make ai-todo genuinely production-ready as a template.

---

## Task 1 — Add a root README.md

**Priority: BLOCKER**

Create `README.md` at the repo root. A new team member or manager must be able to read it and understand the system in under 5 minutes.

Required sections (in order):

```
# [Project Name] — opencode team template

> One-sentence description. What this template is and who it's for.

## What this is
- Agent-infrastructure scaffold, not an application
- Powered by opencode with 11 AI agent roles
- GitHub = work management (issues, board, PRs, Pages)

## Team roles at a glance
| Agent | Owns | Start here |
[copy from AGENTS.md role table]

## Prerequisites
- opencode installed (version requirement)
- GitHub PAT with repo + project scope
- direnv (optional, for .envrc auto-loading)

## Quick start (under 2 minutes)
1. Use this repo as a GitHub template (click "Use this template")
2. Clone your new repo
3. Copy .env.example to .env and fill in GITHUB_PAT
4. Run ./.opencode/start.sh
5. Tell the PM agent: "Read AGENTS.md and create the project board"

## How work flows
[Simple diagram: Issue → Design gate → PR → Merge]

## What to replace before first use
- [ ] docs/ placeholder content
- [ ] This README (update for your project)
- [ ] .env values

## Operational gotchas
[Copy the gotchas section from AGENTS.md]

## License
[See LICENSE]
```

**Acceptance criteria:** A non-developer (PM, PO) can read README.md alone and know how to start the system.

---

## Task 2 — Add a LICENSE file

**Priority: BLOCKER**

Create a `LICENSE` file at the repo root. Choose one:

- **MIT** — if this template is open for anyone to fork and use freely
- **Apache 2.0** — if you want patent protection
- **Internal/proprietary** — if this is mtel-thailand internal only (write a short proprietary notice)

Template for MIT:
```
MIT License

Copyright (c) 2026 mtel-thailand

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Task 3 — Add .env.example

**Priority: BLOCKER**

Create `.env.example` at the repo root. This is the canonical reference for all environment variables the template needs. `.env` is gitignored; `.env.example` is committed.

```bash
# .env.example — copy to .env and fill in your values

# GitHub Personal Access Token
# Required scopes: repo, project, read:org
# Create at: https://github.com/settings/tokens
GITHUB_PAT=ghp_your_token_here

# GitHub repository (used by MCP tools)
GITHUB_REPO=your-org/your-repo

# Opencode model selection (optional override)
# Default is set in .opencode/opencode.json
# OPENCODE_MODEL=claude-sonnet-4-6

# Optional: override which agents are active
# OPENCODE_AGENTS=pm,po,sa,ux,be,fe,qa,sre,devops,ai,researcher
```

**Acceptance criteria:** Running `cp .env.example .env` gives a working starting point with no hidden required variables.

---

## Task 4 — Fix CI so it is green by default

**Priority: BLOCKER for template users**

The current `ci.yml` references `npm ci`, `npm run lint`, `npm run build`, `npm test` but no `package.json` exists. A template must have green CI out of the box — otherwise every team that uses it gets a red badge on day one.

**Option A (recommended for a pure config template):** Replace the npm-based CI with a template validation workflow that actually tests what exists:

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-template:
    name: Validate template structure
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check required files exist
        run: |
          files=(
            "README.md"
            "LICENSE"
            ".env.example"
            "AGENTS.md"
            ".opencode/opencode.json"
            ".gitignore"
          )
          missing=0
          for f in "${files[@]}"; do
            if [ ! -f "$f" ]; then
              echo "MISSING: $f"
              missing=1
            else
              echo "OK: $f"
            fi
          done
          exit $missing

      - name: Lint markdown
        uses: DavidAnson/markdownlint-cli2-action@v16
        with:
          globs: "**/*.md"
          config: ".markdownlint.json"
        continue-on-error: true

      - name: Validate opencode.json is valid JSON
        run: |
          python3 -c "import json,sys; json.load(open('.opencode/opencode.json'))" && echo "opencode.json: valid JSON"

      - name: Validate agent files exist
        run: |
          agent_dir=".opencode/agents"
          count=$(ls "$agent_dir"/*.md 2>/dev/null | wc -l)
          echo "Found $count agent files"
          [ "$count" -gt 0 ] || (echo "ERROR: no agent files found" && exit 1)
```

Create `.markdownlint.json`:
```json
{
  "default": true,
  "MD013": false,
  "MD033": false,
  "MD041": false
}
```

**Option B:** If you plan to add a Node.js app later, add a minimal `package.json` now:
```json
{
  "name": "ai-todo-template",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "lint": "echo 'No lint configured yet' && exit 0",
    "build": "echo 'No build configured yet' && exit 0",
    "test": "echo 'No tests configured yet' && exit 0"
  }
}
```

**Acceptance criteria:** Every PR shows a green CI check. The main branch badge is green.

---

## Task 5 — Add GitHub issue and PR templates

**Priority: HIGH — enforces the workflow contract automatically**

Inspired by ECC's CONTRIBUTING.md pattern. Create these files:

### `.github/ISSUE_TEMPLATE/feature.md`
```yaml
---
name: Feature / User story
about: New feature or enhancement
title: "feat: "
labels: ["feature", "enhancement"]
assignees: ""
---

## Summary
<!-- One sentence: what and why -->

## Acceptance criteria
<!-- Checklist format — BE/FE cannot start until all items are agreed -->
- [ ] 
- [ ] 
- [ ] 

## Out of scope
<!-- What this ticket explicitly does NOT cover -->

## Design gate
<!-- All must sign off before BE/FE writes code -->
- [ ] PO approved scope
- [ ] SA approved architecture  
- [ ] QA approved test plan
- [ ] UX approved flows (if user-facing)
- [ ] SRE approved reliability requirements

## Notes
<!-- Links to ADRs, specs, UX flows, runbooks -->
```

### `.github/ISSUE_TEMPLATE/bug.md`
```yaml
---
name: Bug report
about: Something is broken
title: "fix: "
labels: ["bug"]
assignees: ""
---

## Severity
<!-- P0 (down) / P1 (broken) / P2 (degraded) / P3 (minor) -->

## Steps to reproduce
1. 
2. 
3. 

## Expected behaviour

## Actual behaviour

## Environment
- Branch:
- Commit:

## Logs / screenshots
```

### `.github/PULL_REQUEST_TEMPLATE.md`
```markdown
## Summary
<!-- What does this PR do? One paragraph. -->

## Related issue
Closes #

## Type of change
- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — no behaviour change
- [ ] docs — documentation only
- [ ] chore — tooling, dependencies
- [ ] test — tests only

## Definition of Done checklist
- [ ] All AC from the issue are met
- [ ] Tests written and passing
- [ ] Docs updated (or `docs-skip` label applied)
- [ ] No secrets or credentials in code
- [ ] Branch is up to date with main
- [ ] CI is green

## Notes for reviewers
```

---

## Task 6 — Add CONTRIBUTING.md

**Priority: HIGH**

Create `CONTRIBUTING.md` at the repo root. Keep it short and practical:

```markdown
# Contributing to this template

## Who contributes what

| Role | Contributes |
|------|-------------|
| PM | Sequencing, board management, gate enforcement |
| PO | Ticket descriptions, acceptance criteria |
| SA | Architecture decisions (ADRs in docs/architecture/) |
| UX | Flow diagrams, layout specs (docs/ux/) |
| BE/FE | Implementation — only after design gate passes |
| QA | Test plans, acceptance tests |
| SRE | Reliability/security requirements |
| DevOps | CI/CD, Docker, GitHub Pages |
| AI | Agent config, opencode.json, skills, MCP |

## Workflow in 6 steps
1. Open an issue (no issue = no code)
2. Get design gate sign-off on the issue
3. Branch: `feature/<issue#>-<slug>` from main
4. Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
5. Open a PR referencing the issue (`Closes #N`)
6. Get review + green CI before merging

## Never
- Push directly to main
- Merge without a reviewed PR
- Create a branch without a ticket
- Write code before the design gate passes
```

---

## Task 7 — Add SECURITY.md

**Priority: MEDIUM**

Create `SECURITY.md`:

```markdown
# Security policy

## Secrets
- Never commit secrets, tokens, or credentials
- All secrets live in `.env` (gitignored)
- Use `.env.example` to document required variables
- GITHUB_PAT is the only credential this template needs at runtime

## Reporting a vulnerability
If you find a security issue in this template, open a GitHub issue with the label `security`.
Do not include sensitive details in the issue body — use GitHub's private vulnerability reporting instead.

## MCP server security
Each agent role has a scoped MCP server with only the GitHub tools it needs.
Do not grant agents tools beyond their defined role scope.
Full MCP tool list is in `.opencode/opencode.json`.

## Permissions
Agent bash permissions are restricted to: `npm run *`, `npm test*`, `npx *`, `git *`.
Do not expand these without a reviewed ADR.
```

---

## Task 8 — Add CHANGELOG.md

**Priority: MEDIUM**

Create `CHANGELOG.md` using Keep a Changelog format. This lets teams that fork the template track what changed upstream.

```markdown
# Changelog

All notable changes to this template are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

## [Unreleased]

## [0.2.0] — 2026-05-24
### Added
- Root README.md with quickstart guide
- LICENSE (MIT)
- .env.example with all required variables
- GitHub issue and PR templates
- CONTRIBUTING.md
- SECURITY.md
- CHANGELOG.md
- CI workflow validates template structure instead of broken npm scripts
- .markdownlint.json for markdown consistency

### Fixed
- CI was referencing npm scripts that don't exist — replaced with template validation

### Changed
- docs/ marked as placeholder content requiring replacement

## [0.1.0] — 2026-05-22
### Added
- AGENTS.md with universal workflow contract
- 11 agent roles: PM, PO, SA, UX, BE, FE, QA, SRE, DevOps, AI, Researcher
- Role-scoped GitHub MCP servers
- .opencode/ folder with agent definitions and skills
- .github/workflows/ci.yml and docs-check.yml
- .envrc + .env pattern for GITHUB_PAT
- Gitflow branching, Conventional Commits, TDD mandate
```

---

## Task 9 — Add a SOUL.md for agent character

**Priority: MEDIUM — borrowed from ECC**

ECC includes a `SOUL.md` that defines the character and values of the agent system — what it cares about, how it makes decisions under ambiguity, and what it refuses to do. This prevents agents from drifting into unhelpful or unsafe behaviors.

Create `.opencode/SOUL.md` (loaded via `opencode.json` instructions):

```markdown
# Agent soul — team values and operating principles

This document defines how every agent in this system should think and behave,
beyond the tactical rules in _workflow.md.

## Core values

**Quality over speed.** We ship when it's done, not when the deadline hits.
Cutting corners creates debt that slows the whole team later.

**Humans in the loop.** Agents propose, humans decide. No code merges, no PRs,
no external actions without explicit user authorization in the current session.

**Transparency.** When uncertain, say so. When something fails, surface it
immediately. Never silently continue past an error.

**Minimal footprint.** Do the smallest thing that solves the problem.
Don't expand scope without a ticket. Don't touch files outside your task.

**Security by default.** Secrets stay in .env. Permissions stay scoped.
When in doubt, restrict, not expand.

## What agents must never do without explicit authorization
- Push to any remote branch
- Create or merge a pull request
- Post comments on issues (unless asked)
- Modify .opencode/opencode.json
- Expand bash permissions

## How to handle ambiguity
1. State your interpretation explicitly
2. Ask one clarifying question
3. Wait for confirmation before proceeding

## On mistakes
Acknowledge them immediately. Explain what happened. Propose a fix.
Never silently overwrite work or pretend an error didn't occur.
```

Update `opencode.json` instructions array to include `".opencode/SOUL.md"`.

---

## Task 10 — Add a TROUBLESHOOTING.md

**Priority: MEDIUM — borrowed from ECC**

The most common friction points for new teams using this template. Document them proactively.

Create `TROUBLESHOOTING.md`:

```markdown
# Troubleshooting

## opencode won't start

**Symptom:** `start.sh` exits with an error about GITHUB_PAT.
**Fix:** Ensure `.env` exists and contains `GITHUB_PAT=ghp_...`. The start script reads this file before launching opencode.

## MCP tools not available

**Symptom:** Agents report GitHub tools unavailable.
**Fix:**
1. Check GITHUB_PAT is set: `echo $GITHUB_PAT`
2. Verify scopes: token needs `repo`, `project`, `read:org`
3. Restart opencode — config is not hot-reloaded

## After editing opencode.json, changes aren't taking effect

opencode does not hot-reload config. Quit and restart after any change to:
- `.opencode/opencode.json`
- Any agent file in `.opencode/agents/`
- `.opencode/SOUL.md` or `AGENTS.md`

## CI is failing

CI validates template structure. Required files:
- `README.md`
- `LICENSE`
- `.env.example`
- `AGENTS.md`
- `.opencode/opencode.json`

If any of these are missing, CI will fail with `MISSING: <filename>`.

## Agent is doing work without a ticket

This violates rule 4 of the workflow contract. Tell the agent:
> "Stop. Create an issue first. No code without a ticket."

The agent should open an issue and wait for your confirmation before continuing.

## docs/ content looks like template boilerplate

It is. Replace `docs/index.md`, `docs/architecture.md`, and related files
with your actual project documentation before inviting the wider team.

## PR was merged without review

This should not be possible if branch protection is enabled on main.
To enable: Settings → Branches → Branch protection rules → Require a pull request before merging.
```

---

## Task 11 — Add a COMMANDS-QUICK-REF.md

**Priority: LOW — borrowed from ECC**

Create `COMMANDS-QUICK-REF.md` as a one-page reference for the whole team:

```markdown
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
```

---

## Task 12 — Clean up legacy agents

**Priority: LOW — close issue #17**

Issue #17 proposes deprecating `code-reviewer`, `security-auditor`, and `test-engineer` as these roles are now covered by QA and SRE.

Resolution options (pick one and close #17):

**Option A — Remove them:**
```bash
# In opencode.json, remove entries for:
# code-reviewer, security-auditor, test-engineer
# Archive the agent .md files to .opencode/agents/_deprecated/
```

**Option B — Document them as opt-in:**
Add a comment in `opencode.json`:
```json
// Legacy agents — not loaded by default, available for specific use cases
// Uncomment to enable:
// "code-reviewer" (replaced by QA + SA review gate)
// "security-auditor" (replaced by SRE)
// "test-engineer" (replaced by QA)
```

---

## Summary — what to ship in what order

| # | Task | Priority | Effort | Who |
|---|---|---|---|---|
| 1 | README.md | BLOCKER | 2h | PM + AI |
| 2 | LICENSE | BLOCKER | 15m | DevOps |
| 3 | .env.example | BLOCKER | 30m | AI |
| 4 | Fix CI | BLOCKER | 1h | DevOps + AI |
| 5 | Issue/PR templates | HIGH | 1h | PM + AI |
| 6 | CONTRIBUTING.md | HIGH | 30m | PM |
| 7 | SECURITY.md | MEDIUM | 30m | SRE |
| 8 | CHANGELOG.md | MEDIUM | 30m | PM |
| 9 | SOUL.md | MEDIUM | 1h | AI + PO |
| 10 | TROUBLESHOOTING.md | MEDIUM | 1h | AI + DevOps |
| 11 | COMMANDS-QUICK-REF.md | LOW | 1h | PM |
| 12 | Clean up legacy agents | LOW | 30m | AI |

**Total estimated effort:** ~10 hours, deliverable in one sprint.

After these 12 tasks, the template will be production-ready for any team to fork and start using immediately.
