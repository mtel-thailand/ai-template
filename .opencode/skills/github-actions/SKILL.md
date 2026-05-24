---
name: github-actions
description: GitHub Actions CI/CD workflow patterns for this project
license: MIT
compatibility: opencode
metadata:
  audience: devops
  workflow: ci-cd
---

## Current state

This project has two workflows:
1. `.github/workflows/ci.yml` — lint + type-check + build + test on push/PR to `main`
2. `.github/workflows/docs-check.yml` — verify `/docs` is updated when `src/` changes
A deploy workflow (GitHub Pages or Docker) is still future work.

## Workflow conventions

- Workflows in `.github/workflows/` — one file per concern
- Trigger on `push` and `pull_request` to `main`
- Pin action versions by SHA (not semver tags) for supply-chain security
- Use `actions/cache` for `node_modules` to speed up runs

## Required workflows

1. **CI** — `npm ci` → `npm run lint` → `npm run build` → `npm test` ✅ *implemented*
2. **Docs check** — verify `/docs` is updated when `src/` changes ✅ *implemented*
3. **Deploy** — deploy `dist/` or publish Pages (future)

## Runner

- `ubuntu-latest` for all jobs
- Node 22 LTS (match project `.nvmrc` or `engines` field)

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll use the latest version tag for actions" | Pin action versions by SHA to prevent supply-chain attacks — tags can be moved to malicious versions. |
| "All checks should run on every push" | Use path filters (`paths:`, `paths-ignore:`) to only run relevant workflows and save CI minutes. |
| "I'll install dependencies without caching" | Use `actions/cache` for `node_modules` — it cuts CI time from ~1min to ~10s. |
| "A single workflow file is simpler" | One file per concern keeps workflows independent, easier to read, and allows selective triggering. |

## Red Flags

- Using `actions/checkout@v3` or other outdated action versions without updating
- Running `npm install` instead of `npm ci` — `npm ci` uses the lockfile and is deterministic
- Hardcoding secrets in workflow YAML instead of using `${{ secrets.SECRET_NAME }}`
- Missing `timeout-minutes` on jobs — runaway workflows can run indefinitely
- Using `pull_request_target` without understanding the security implications (it has write access to the base repo)

## Verification

- [ ] All action versions are pinned by SHA digest (e.g., `actions/checkout@abc123def456`)
- [ ] Workflows use `actions/cache` for dependency caching
- [ ] Path filters are applied to avoid running irrelevant workflows
- [ ] All secrets are referenced via `${{ secrets.* }}` — none are hardcoded
- [ ] All jobs have `timeout-minutes` set
