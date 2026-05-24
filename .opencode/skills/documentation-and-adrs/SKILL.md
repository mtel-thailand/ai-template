---
name: documentation-and-adrs
description: Architecture Decision Record format, docs-first workflow, and conventions for project documentation in /docs.
license: MIT
compatibility: opencode
metadata:
  audience: sa, fe, be, po
  workflow: documentation
---

## When to use this skill

Load this skill when making an architectural decision, documenting a new feature, changing an API or data model, or planning a migration. Use before writing any code that changes project structure, dependencies, or data flow.

## Overview

Documentation in this project follows a docs-first workflow: write the decision or spec before implementing the code. The `/docs` folder is published as a GitHub Pages site. ADRs capture architectural decisions with their context and consequences.

## Docs-First Workflow

```
Decision needed → Write ADR → Review → Approve → Implement
```

The documentation is not an afterthought — it's part of the design gate. Changes to architecture, data flow, APIs, or dependencies must be documented before code is written.

## Architecture Decision Records (ADRs)

### ADR Format
```markdown
# ADR-[number]: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-X]

## Context
What's the problem we're solving? What constraints exist?
What options were considered?

## Decision
What did we decide and why? Include the trade-offs.

## Consequences
What becomes easier? What becomes harder?
What needs to change in the codebase?

## Alternatives Considered
- Option A: [pros/cons]
- Option B: [pros/cons]
```

### When to Write an ADR
- Adding or changing a dependency
- Changing the data model or storage layer
- Adding a new API endpoint or modifying an existing one
- Changing build tooling or deployment
- Introducing a new architectural pattern
- Any decision with long-term impact

### ADR Storage
ADRs live in `/docs/adr/` as numbered markdown files:
```
/docs/adr/
├── 001-use-local-storage.md
├── 002-react-hooks-for-state.md
└── 003-labels-inline-on-todo.md
```

## Other Documentation

### Feature Documentation (`/docs/features.md`)
Describes user-facing features. Updated when a feature changes or a new one ships.

### API Reference (`/docs/api.md`)
Data model, types, function signatures. Generated or manually kept in sync with code.

### Architecture (`/docs/architecture.md`)
Component tree, data flow, tech decisions. Updated when architecture changes.

### Changelog (`/docs/changelog.md`)
Notable changes per version. Updated on each release.

## Documentation Principles

- **Explain WHY, not just WHAT.** The code already shows what it does. Docs explain intent.
- **Keep docs close to code.** ADRs live in the repo. Inline comments for complex logic.
- **Update docs when code changes.** A PR that changes behavior should update docs.
- **Docs are code.** They get reviewed, versioned, and maintained like source code.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The code is self-documenting" | Code explains implementation. Docs explain intent and decisions. |
| "I'll add docs after the feature is done" | After means never. Write docs as part of the feature. |
| "We're moving too fast for ADRs" | Fast decisions without context create technical debt that compounds. |
| "Everyone already knows this" | Knowledge is not evenly distributed. New team members don't know. |

## Red Flags

- Architectural decisions made without an ADR
- Documentation that only explains *what* the code does
- `/docs` diverging from actual implementation
- PRs that change behavior without touching docs

## Verification

- [ ] ADR written for any architectural decision
- [ ] Relevant `/docs/` files updated for behavioral changes
- [ ] Documentation reviewed alongside code
- [ ] Inline comments explain non-obvious logic
