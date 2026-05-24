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
- SOUL.md agent character document
- TROUBLESHOOTING.md for common friction points
- COMMANDS-QUICK-REF.md one-page reference
- CI workflow validates template structure instead of broken npm scripts
- .markdownlint.json for markdown consistency

### Fixed
- CI was referencing npm scripts that don't exist — replaced with template validation

### Changed
- docs/ marked as placeholder content requiring replacement
- opencode.json instructions now include SOUL.md

### Removed
- Legacy subagents: code-reviewer, security-auditor, test-engineer (responsibilities absorbed by QA and SRE)

## [0.1.0] — 2026-05-22
### Added
- AGENTS.md with universal workflow contract
- 11 agent roles: PM, PO, SA, UX, BE, FE, QA, SRE, DevOps, AI, Researcher
- Role-scoped GitHub MCP servers
- .opencode/ folder with agent definitions and skills
- .github/workflows/ci.yml and docs-check.yml
- .envrc + .env pattern for GITHUB_PAT
- Gitflow branching, Conventional Commits, TDD mandate
