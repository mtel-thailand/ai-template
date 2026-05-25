# Changelog

All notable changes to this template are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

## [Unreleased]
### Added
- feat(agents): add `git-and-npm-hygiene` skill loaded by @devops, @ai, @be, @fe (#39)

## [0.2.0] — 2026-05-24
### Added
- ADR-0001: Grant git write access to squad (restricted, no remote push)
- ADR-0002: Memory GC script (Node.js ESM, gray-matter + zod)
- ADR-0003: Repository identity pinning — canonical owner/repo via .env
- ADR-0004: AI agent bash permission — principle of least privilege extension
- ADR-0005: Remove per-role MCP server split — single shared server design
- `memory-gc.mjs` — five-phase memory GC script (validate, budget, evict, write)
- `start.sh` — auto-loads GITHUB_PAT from .env then launches opencode
- `.envrc` — direnv auto-export for GITHUB_PAT
- `.opencode/.gitignore` — protects opencode subtree from npm artifacts
- `docs/specs/agent-memory.md` — full memory-subsystem specification
- `docs/research/agent-memory-architectures.md` — research archive
- `docs/specs/git-and-npm-hygiene.md` — specification for new skill

### Changed
- ADR-0000 moved from docs/adr/ to docs/adr/0000-adr-record-architecture-decisions.md
- All system prompts (12 agents) aligned to activate-on-contract convention
- All grunt-tier agents reference Opus as reviewer gate
- CI split: ci.yml (quality gate) and docs-check.yml (docs + memory validation)
- Consolidated git and npm hygiene skill spec (replaces scattered guidelines)

### Fixed
- AI agent prompt: `_github.sh` removed from system prompt persistence claim; AI writes agent files not config.json
- BE prompt: lint commands updated (format:fix → check, test:cov → test:coverage)
- FE prompt: removed `npm run test:e2e` (no e2e script exists)
- Tech Lead prompt: path reference corrected (docs/adr/ → docs/adr/)

## [0.1.0] — 2026-05-23
### Added
- Initial template release
- 12 agent role definitions with frontmatter
- 32 skill packs
- opencode.json with MCP server mappings
- Universal workflow contract
- Three-tier design gate
- CI/CD workflow templates
- GitHub Pages documentation site
- ADR-0000 template (initial)
