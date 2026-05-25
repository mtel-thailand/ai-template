# Team working agreement

This is an **agent-infrastructure / team-template repo**, not a traditional
application. The real content is `.opencode/` — agent definitions, skills, and
platform config. No application source code exists yet (no `src/`, no root
`package.json`).

CI workflows reference `npm ci`, `npm run lint`, `npm run build`, `npm test` —
they **will fail** until a root `package.json` with those scripts is created.

---

## Universal workflow contract (read first)

Every agent operates under `.opencode/agents/_workflow.md`. Read it before
doing anything else. The 6 hard rules apply without exception:

1. **Gitflow branching.** `main` is protected. Branch from latest `main` using
   `feature/<#>-`, `fix/<#>-`, `refactor/<#>-`, `chore/<#>-`,
   `docs/<#>-`, or `test/<#>-`. Merges to `main` go through a reviewed PR
   with green CI. Conventional Commits.
2. **Routine remote writes are autonomous; destructive ops need authorization.**
   Autonomous: pushing to feature branches, opening PRs, posting comments,
   applying labels, moving board cards, creating branches, filing follow-up
   tickets. Requires explicit user authorization: merging any PR; pushing to
   `main` or protected branches; force-push / history rewrite; deleting
   branches with unmerged commits; bypassing failing CI.
3. **Pull before starting.** `git fetch --all --prune` then
   `git pull --rebase origin main`.
4. **Substantive work has a ticket.** Trivial-fix exception: docs typos,
   formatting, broken links, orphaned-file commits, dependabot acks.
5. **GitHub mirrors reality.** Issue status, board card, labels, PR links,
   and `/docs/` move together.
6. **Document substantive decisions.** ADRs for architectural choices, specs
   under `/docs/specs/`, UX specs under `/docs/ux/`, runbooks under
   `/docs/runbooks/`. `docs-skip` for trivial changes only.

Full contract (DoR, DoD, handoff template, rollback, escalation):
`.opencode/agents/_workflow.md`.

---

## How this repo is structured

| Path | What it is |
|---|---|
| `.opencode/opencode.json` | Platform config: agents, MCP servers, permissions, model selection |
| `.opencode/agents/_workflow.md` | **Universal workflow contract — read first** |
| `.opencode/agents/*.md` | Per-role system prompts |
| `.opencode/skills/` | Domain skill packs |
| `.opencode/start.sh` | Loads `GITHUB_PAT` from `.env`, then launches opencode |
| `.opencode/memory/` | Shared agent memory vault — five tiers, strict YAML frontmatter, `[[wikilinks]]`. See `/docs/specs/agent-memory.md`. |
| `.github/workflows/ci.yml` | Build & test pipeline (expects npm scripts that don't exist yet) |
| `.github/workflows/docs-check.yml` | Enforces docs update when `src/` changes |
| `docs/` | Template documentation site (GitHub Pages) |

## Starting opencode

```bash
./.opencode/start.sh            # loads .env then launches opencode
```

The start script reads `GITHUB_PAT` from `.env` before starting opencode.
Without it, the `gh_*` MCP tools will not be available.

`.envrc` (direnv) auto-exports `GITHUB_PAT` from `.env` — install direnv or
use `start.sh` directly.

This file is loaded as a system instruction via `opencode.json` →
`instructions: ["AGENTS.md", "docs/index.md", "docs/architecture.md"]`.
These docs files are present as template content; update them for your
project.

---

## GitHub as work management

- **Issues** = unit of work & bug log. PO writes description + acceptance
  criteria. QA/SRE file bugs as Issues.
- **Project board** = status tracking across design → build → ship phases.
  PM owns it.
- **Pull requests** = code changes. Every PR references its Issue
  ("Closes #N"). Opened/merged only on explicit user authorization.
- **Pages** = `/docs` published as GitHub Pages. DevOps owns site config.

Each agent has a **role-scoped GitHub MCP server** — it only sees the tools
its role needs. `opencode.json` maps toolsets per agent. Agent files in
`.opencode/agents/*.md` further restrict tool access via `tools:`
frontmatter.

## Conventions

- Link everything: every PR references its Issue; every ticket Issue is on
  the Project board.
- Keep the board current as tickets move through phases and the design gate.
- New ticket = one Issue with acceptance criteria as a checklist.
- Docs-first: every PR changing source must update `/docs/` unless labeled
  `docs-skip`.
- Bug reports: clear title, reproduction steps, expected vs. actual, severity
  label.
- The squad is spec-driven & TDD. Implementation is gated behind design
  sign-off per the three-tier model in `docs/architecture.md`.
- BE/FE must not write code until the design gate has passed.

## Agent roles

The full squad roster, tags, and "when to use" cheat sheet live in
`.opencode/agents/pm.md` (single source of truth). Route opencode / MCP /
agent-infrastructure questions to **AI** (`@ai`), not BE/FE.

---

## Environment & secrets

- `GITHUB_PAT` is stored in `.env` (gitignored) and used in `.envrc` for
  direnv auto-loading.
- The `.opencode/.gitignore` keeps `node_modules`, `package.json`, and
  `package-lock.json` out of the `.opencode/` subtree in git.

## Canonical repo identity

The canonical owner/repo for this project is **`mtel-thailand/ai-template`**.
Agents must use these values for every GitHub MCP tool call (`gh_*_issue_read`,
`gh_*_push_files`, etc.) — do not guess from `git remote`, the user's email,
or prior session context. They are pinned in `.env` as:

- `GITHUB_OWNER=mtel-thailand`
- `GITHUB_REPO=ai-template`
- `GITHUB_REPO_URL=https://github.com/mtel-thailand/ai-template`

If `.env` is missing these, fall back to `.git/config` `remote.origin.url`,
not to guessing.

## Operational gotchas

- **opencode config is NOT hot-reloaded** — after editing `opencode.json` or
  any agent file, quit and restart opencode.
- **No root `package.json` exists** — CI will fail. Before adding application
  code, create one with `lint`, `build`, and `test` scripts matching CI.
- **`docs/` exists** — contains template documentation for the AI workflow
  template. Replace with your project's documentation when starting a new
  project.
- Agent permissions in `opencode.json` restrict bash: only `npm run *`,
  `npm test*`, `npx *`, `git *`, and a few other safe commands are allowed.