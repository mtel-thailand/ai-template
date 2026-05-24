---
name: devops-skill
description: CI/CD standard for this template. Required steps, green build definition, GitHub Pages deployment, and release checklist.
license: MIT
compatibility: opencode
metadata:
  audience: devops
  workflow: deployment
---

## When to use this skill

Load this skill when setting up CI/CD for a new project, editing workflow files, deploying to GitHub Pages, cutting a release, or diagnosing a build failure. Essential for DevOps on every ticket that touches build, deploy, or CI config.

## Overview

CI/CD is the automated quality gate between a developer's machine and production. Every commit on every branch (except docs-only) must pass the full CI pipeline. A "green build" is the minimum bar for merging to `main`. Releasing is a manual, documented process triggered only on explicit user authorization.

## Required CI Steps (In Order)

| Step | Command | Failure = Block? | Notes |
|------|---------|-----------------|-------|
| 1. Install | `npm ci` | Yes | Uses lockfile. `npm install` is NOT acceptable — must be reproducible |
| 2. Lint | `npm run lint` | Yes | ESLint with project config. No warnings as errors unless configured. |
| 3. Type-check | `npx tsc --noEmit` | Yes | Full TypeScript check. `// @ts-ignore` and `any` are flagged for review |
| 4. Unit tests | `npm run test` | Yes | Vitest. Must include coverage report. |
| 5. Build | `npm run build` | Yes | Production build. Must produce output in `dist/` |
| 6. E2E tests | `npx playwright test` | Yes | Playwright. Headless. Against production build. |
| 7. Security audit | `npm audit --audit-level=high` | Yes | Zero high or critical vulnerabilities |
| 8. Docs check | Docs-check workflow | Yes | Docs updated when source changes |

### Optional CI Steps (add per project)

| Step | When to Add |
|------|-------------|
| Bundle size check | When bundle size budget is defined |
| Lighthouse CI | When performance budget is defined |
| Dependency review | When reviewing PRs from forks |
| CodeQL analysis | For security-sensitive projects |

## Definition of a "Green Build"

A build is GREEN only when ALL of these conditions are met:

1. All 8 required CI steps pass (exit code 0)
2. Test output is included in the PR description or as a CI artifact
3. No step is skipped, disabled, or has `continue-on-error: true`
4. Coverage report shows no significant drop (configurable threshold)
5. No warnings that the project's eslint config treats as errors

A build is YELLOW when:
- All steps pass but coverage drops below threshold
- All steps pass but there are warnings (not errors)
- All steps pass but the SRE audit has notes (not blockers)

A build is RED when:
- Any required step fails
- Security audit fails
- Build output is missing or corrupted

**Only green builds merge to `main`.** Yellow builds require PM approval. Red builds are blocked.

## GitHub Pages Deployment Standard

### What Must Be Live Before a Release is Tagged

1. The `/docs/` site (GitHub Pages) must be deployed and accessible at `https://<org>.github.io/<repo>/`
2. All `/docs/specs/` documents must be rendered and readable
3. All ADRs under `/docs/adr/` must be linked from the architecture page
4. The changelog (`/docs/changelog.md`) must be up to date for the release
5. The site must pass Lighthouse Accessibility ≥ 95

### Deployment Workflow

```yaml
name: Deploy Docs
on:
  push:
    branches: [main]
    paths: ['docs/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/
      - uses: actions/deploy-pages@v4
```

## Release Checklist

Before every release:

- [ ] All PRs targeting this release are merged to `main`
- [ ] CI is green on `main`
- [ ] QA has signed off on all tickets in the release
- [ ] SRE has signed off on all security checks
- [ ] Version bumped according to semver in `package.json`
- [ ] Changelog updated with release notes
- [ ] Git tag created: `v<major>.<minor>.<patch>` (e.g., `v0.1.0`)
- [ ] GitHub Release created with changelog content
- [ ] GitHub Pages docs site deployed and verified
- [ ] Release announced per announcement format below

### Version Bumping
```
v0.1.0  — First MVP release
v0.2.0  — Feature release (backward compatible)
v0.3.0  — Another feature release
v1.0.0  — First stable release
```

### Tag Format
```
v<major>.<minor>.<patch>[-<pre-release>.<number>]
Examples: v0.1.0, v1.0.0, v1.2.3-alpha.1
```

### Changelog Entry Format
```markdown
## [v0.1.0] - 2026-05-24

### Added
- Todo CRUD with localStorage persistence (#1)
- Add labels to todos (#10)
- Hide completed toggle (#8)

### Changed
- Storage format migrated to envelope with versioning (#10)

### Fixed
- Null guard on localStorage read (#7)

### Security
- Input sanitisation on label text (#5)

### Known Issues
- Labels cannot be filtered by click (deferred to v1.1)
```

### Announcement Format
```
🚀 Release v0.1.0 is live!

**What's new:**
- Todo CRUD with persistent storage
- Add and remove labels on todos
- Hide completed todos toggle

**Full changelog:** https://github.com/org/repo/releases/tag/v0.1.0
**Docs:** https://org.github.io/repo/
```

## Worked Example: Good PR Description with CI Output

```
## Summary
Adds label feature to todo items.

## CI Results
- install: ✅
- lint: ✅ (0 errors, 0 warnings)
- type-check: ✅ (0 errors)
- unit tests: ✅ (42/42 passed, 92% coverage)
- build: ✅ (85 KB gzip)
- e2e: ✅ (3/3 passed)
- security audit: ✅ (0 high/critical)
- docs check: ✅

## Changes
- New components: LabelBadge, LabelList, LabelAdder
- Updated: Todo type, useTodos hook, TodoItem
- New tests: 12 unit, 2 integration, 1 E2E
- Docs: /docs/specs/label-feature.md, /docs/ux/labels-tags.md

Closes #10
```

## Common Failure Modes

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **Skipped steps** | CI config has `continue-on-error: true` on critical steps | Remove `continue-on-error` from lint, test, build, audit |
| **Wrong install command** | `npm install` instead of `npm ci` — different lockfile | Use `npm ci` for reproducible builds |
| **No lockfile** | CI fails with "missing lockfile" | Commit `package-lock.json`. Never gitignore it. |
| **Release without changelog** | "What's in this release?" | Update changelog BEFORE tagging |
| **Forgetting docs deploy** | Docs site shows old content | Add docs deploy to the release checklist |
| **Direct push to main** | Bypasses CI entirely | Branch protection rules: require CI to pass before merge |
| **Missing release tag** | Cannot identify which code is in production | Tag every release. Tags are immutable. |

## Verification Checklist

Before opening a release PR:
- [ ] All 8 required CI steps defined in `.github/workflows/ci.yml`
- [ ] No step has `continue-on-error: true` unless explicitly approved
- [ ] GitHub Pages deployment workflow exists
- [ ] Version bumped in `package.json`
- [ ] Changelog updated
- [ ] Tag created and pushed
- [ ] GitHub Release created
- [ ] Docs site verified
- [ ] Announcement posted
