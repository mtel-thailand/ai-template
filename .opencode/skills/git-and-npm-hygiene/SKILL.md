---
name: git-and-npm-hygiene
description: Hygiene rules for git, npm, and destructive shell commands. Load before any git, npm, or npx invocation.
license: MIT
compatibility: opencode
metadata:
  audience: devops, ai, be, fe
  workflow: git-operations
---

## Why this exists

The four agents with bash entitlements (@devops, @ai, @be, @fe per
ADR-0001) run git, npm, and npx commands as part of daily work.
This skill codifies the hygiene rules that govern how those commands
are used. It is additive to the universal workflow contract
(.opencode/agents/_workflow.md) — the 6 hard rules, especially Rule 2
(routine remote writes are autonomous; destructive ops need
authorization), apply without exception and are not replaced by
anything here.

## When to use this skill

This skill is loaded by @devops, @ai, @be, and @fe before any git,
npm, or npx command. It applies to every action that touches the
working tree, the remote, or the dependency graph.

---

## 1. Pre-flight checks

Before running any git or npm action:

1. Run `git status` — confirm working tree is in the expected state.
2. Run `git branch --show-current` — confirm you are on the correct
   branch.
3. Run `git remote -v` — confirm the remote is the expected upstream
   (the canonical remote pinned in `.env` via `GITHUB_OWNER`/`GITHUB_REPO`).
4. If anything is unexpected (detached HEAD, dirty tree, wrong remote,
   wrong branch), STOP and diagnose before proceeding.

Never assume state. Read it.

## 2. Local cleanliness

- Leave the working tree clean when a task is done. No stray debug
  logs, scratch files, temp artifacts, or .DS_Store droppings.
- Before creating a new file, check whether one already exists with a
  similar name or purpose. Do not create duplicates.
- Delete temporary branches when they have served their purpose and
  have been merged or abandoned.
- __pycache__/, .tsbuildinfo, dist/, node_modules/, and similar build
  artifacts belong in .gitignore, not in the working tree.

## 3. Commits

- Commit only when asked or at a clear logical unit. One logical
  change per commit.
- Commit messages must follow Conventional Commits:
  <type>(<scope>): <short imperative summary> (#NNN). Explain WHAT
  and WHY, not HOW.
- Never commit secrets. Before staging, run `git diff --cached` and
  check for .env files, API keys, tokens, credentials, connection
  strings, or personal data. If in doubt, do not stage the suspicious
  file.
- One logical change per commit. If you accidentally stage unrelated
  changes, unstage them with `git restore --staged <file>` before
  committing.

## 4. Remote safety

- Always `git fetch` before pushing. Confirm the upstream
  relationship is correct with `git remote -v` and `git branch -vv`.
- Never force-push shared branches (main, master, develop, release/*,
  or any branch others are working on).
- --force-with-lease requires explicit user approval per session. Use
  it only on private feature branches, and only when you can explain
  why a force-push is necessary (e.g. rebasing before opening a PR).
- Never push to main or master without explicit user instruction.
- Never rewrite already-pushed shared history. Once a commit is
  pushed to a shared branch, it is immutable.
- Before `git reset --hard`, `git clean -fd`, `git checkout -- .`, or
  any other destructive command: describe exactly what will be
  destroyed and confirm with the user. Example: "This will discard
  uncommitted changes in 3 files: src/a.ts, src/b.ts, docs/c.md.
  Proceed?"

## 5. Recovery

If you are confused about the repository state:

1. STOP. Do not run another command hoping it will fix things.
2. Diagnose with:
   - `git status` — current tree state
   - `git log --oneline -10` — recent commit history
   - `git branch -a` — all local and remote branches
   - `git reflog` — the full action log (use this instead of guessing)
3. Reflog is your safety net. If you lost a commit or a branch,
   `git reflog` shows every HEAD movement. Recover with
   `git checkout <sha>` or `git cherry-pick <sha>`.
4. Never run a destructive command to "fix" confusion. If you cannot
   determine the state from the diagnostic commands above, ASK the
   user — asking is cheap, rewriting history is expensive.

## 6. npm hygiene

- Never assume install state. Check whether node_modules/ exists,
  whether package.json has been modified since the last install, and
  whether package-lock.json (or the project's lockfile) is present.
- When a lockfile is present, prefer `npm ci` over `npm install`.
  npm ci is reproducible, faster, and will fail if the lockfile is
  out of sync with package.json.
- If no lockfile exists, use `npm install`. Verify that one is
  created after install.
- After any install, verify it succeeded: check exit code, check that
  expected packages exist under node_modules/, and check for
  postinstall errors.
- Respect the project's package manager. If the project uses npm, do
  not introduce a yarn.lock or pnpm-lock.yaml. If the project uses
  yarn, do not touch package-lock.json.
- Prefer local/dev dependencies over global installs. `npm install -g`
  is almost never the right answer in this template.
- New dependencies must be declared in package.json (via
  `npm install <pkg> --save` or `--save-dev`). Never copy files
  manually into node_modules/.

## 7. General destructive-command etiquette

- Describe before you destroy. Before running any command that alters
  or removes data — rm -rf, git reset --hard, git clean -fd, git
  checkout -- ., git branch -D, npm cache clean --force, docker
  system prune -a, etc. — state the exact command, what it will
  affect, and ask for confirmation if the impact is not trivially
  reversible.
- Verify outcomes. Do not claim "done" without checking. After a
  commit, run `git log --oneline -3`. After a push, run `git status`.
  After an install, run `npm ls <key-package>`. Confirm the result
  matches the intent.
- When uncertain, ASK. If you are unsure whether a command is safe,
  whether a file should be deleted, or whether a branch is still in
  use, ask the user. Asking takes 10 seconds; force-pushed history
  takes hours to untangle.
