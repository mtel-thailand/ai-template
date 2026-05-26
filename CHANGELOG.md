# Changelog

All notable changes to this template are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

## Errata

> Corrections to prior entries. Per the docs-consistency policy in
> [ADR-0008](docs/adr/0008-canonical-roster-source-of-truth.md), historical
> entries are not rewritten in place; corrections are recorded here with
> the date and the canonical source.

- **2026-05-26 — `[0.2.0]` entries for ADR-0004 and ADR-0005 are not on
  disk.** The `Added` list under `[0.2.0]` references "ADR-0004: AI agent
  bash permission — principle of least privilege extension" and
  "ADR-0005: Remove per-role MCP server split — single shared server
  design". Investigation (`git log --all -- 'docs/adr/0004*' 'docs/adr/0005*'`)
  found no on-disk file and no commit history for either ADR — neither
  was ever authored. The decisions they describe are absorbed elsewhere:
  per-role bash policy is documented in [ADR-0001](docs/adr/0001-grant-git-access.md)
  and the canonical-source-of-truth question is now answered by
  [ADR-0008](docs/adr/0008-canonical-roster-source-of-truth.md);
  the single-shared MCP design is encoded in
  [ADR-0007](docs/adr/0007-single-shared-github-pat.md). No retroactive
  ADR-0004 / ADR-0005 will be authored under those numbers — they remain
  reserved-but-unused so cross-references in old comments stay
  unambiguous. Source: Issue #61.

## [Unreleased]
### Added
- feat(agents): add `git-and-npm-hygiene` skill loaded by @devops, @ai, @be, @fe (#39)
- docs(adr): ADR-0008 — canonical source of truth for squad roster and per-role bash policy (#61)
- chore(scripts): `scripts/docs-consistency.mjs` — lint script that fails CI on drift between `opencode.json` / `pm.md` and the derived rosters in README / CONTRIBUTING / `docs/architecture.md` (#61)

### Changed
- docs(consistency): README, CONTRIBUTING, SECURITY, `docs/architecture.md` reconciled against the canonical roster in `.opencode/agents/pm.md` and the per-role bash policy in `.opencode/opencode.json` (#61)

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
