# Changelog

## 1.0.0 (2026-05-23)

### Changed
- **Template cleanup**: stripped all application source code (`src/`,
  `public/`, root configs) and application-specific documentation.
  Repository is now a **pure AI workflow template** — only `.opencode/`,
  workflow configs, and template docs remain.
- `docs/index.md`, `docs/architecture.md`, `docs/api.md` rewritten as
  template-focused landing pages.
- `docs/changelog.md` reset — prior entries were for the deleted todo app.

### Removed
- All `src/` files (React components, hooks, types, utils, tests)
- Root config (`package.json`, `tsconfig.json`, `vite.config.ts`, etc.)
- Application documentation (`features.md`, UX/design/test-plan docs)
- `scripts/create-issue-11.sh` (app-specific automation)

### Added
- Template documentation describing agent system, workflow contract,
  skill packs, and CI/CD template structure

## 0.x (2026-05-22) — Todo App (removed)

Prior versions contained a client-side todo application built with
React 19, TypeScript 6, Vite 8, and Tailwind CSS 4. That code has been
removed as of 1.0.0 to make the repo a reusable AI workflow template.
