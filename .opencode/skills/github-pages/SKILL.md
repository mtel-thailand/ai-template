---
name: github-pages
description: GitHub Pages deployment for the /docs documentation site
license: MIT
compatibility: opencode
metadata:
  audience: devops
  workflow: ci-cd
---

## When to use this skill

Load this skill when configuring or troubleshooting the GitHub Pages
site — enabling Pages, setting the source branch/folder, verifying
deployment, or debugging a failed Pages build. Used by DevOps.
Content authors (PO, SA, UX) write docs in /docs but do not need
this skill.

## Purpose

The project documentation lives as markdown in `/docs` and is published as a GitHub Pages site. Content authors (PO, SA, UX) write the markdown; DevOps owns the site.

## Configuration

- Source: `main` branch, `/docs` folder
- The Pages API is not exposed over MCP — configure via:
  - GitHub UI: Settings → Pages → Source → "Deploy from a branch" → main → /docs
  - Or `curl` with `$GITHUB_PAT` to the Pages REST API
  - Or a GitHub Actions workflow using `actions/configure-pages`

## Build

- GitHub Pages automatically builds from the `/docs` folder when it contains an `index.md`
- No Jekyll build step needed (GitHub Pages natively renders markdown)
- Site URL: `https://<your-org>.github.io/<your-repo>/`

## Maintenance

- Docs are published automatically on every push to `main` when Pages is configured
- If a custom domain or HTTPS enforcement is needed, configure via Settings or API
- Monitor the Pages deployment in the repo's Environments tab

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "My docs didn't deploy — the build must have failed" | Check the Actions tab AND the Environments tab — Pages has its own deployment view separate from Actions. |
| "I can configure Pages from the MCP tools" | The Pages API is not exposed over MCP — use `curl` with `$GITHUB_PAT` or the GitHub UI to configure settings. |
| "Any markdown file in `/docs` will render automatically" | The root must have an `index.md` for the site to render. Files without a linking page won't be discovered. |
| "I need to add a Jekyll config to make Pages work" | GitHub Pages natively renders markdown without Jekyll — no `_config.yml` needed unless using custom themes. |

## Red Flags

- Editing Pages configuration via MCP tools (they don't expose the Pages API — changes silently fail)
- Expecting a sub-page to render without a link from a parent page or `index.md`
- Forgetting to push to `main` to trigger a Pages rebuild — Pages deploys from the configured branch only
- Custom domains configured in the repo's DNS but not in the Pages settings

## Verification

- [ ] `/docs/index.md` exists — the site has a landing page
- [ ] All links between docs pages use relative paths (`../other-page.md`)
- [ ] Pages source is configured to `main` branch, `/docs` folder in Settings
- [ ] The site renders correctly at `https://<your-org>.github.io/<your-repo>/`
