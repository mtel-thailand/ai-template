---
name: sa-skill
description: How to write an Architecture Decision Record (ADR) with standard format, stack selection framework, and quality bar.
license: MIT
compatibility: opencode
metadata:
  audience: sa
  workflow: design
---

## When to use this skill

Load this skill when making an architectural decision — adding a dependency, changing the data model, choosing a framework, designing the system decomposition, or any decision with long-term impact. Required reading for the Solutions Architect during the Design phase of every feature.

## Overview

Architecture Decision Records (ADRs) are the permanent record of why the system is built the way it is. They prevent "we don't know why we chose X" six months later. Every structural decision — and most dependency choices — must be documented in an ADR before implementation begins.

## Standard ADR Format

```markdown
# ADR-[number]: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-N]

## Context
What problem are we solving? What constraints exist? What forces are at play?
Include relevant facts: team size, deployment target, expected scale, timeline.

## Decision
What did we decide? Why? What trade-offs were accepted?
State affirmatively: "We will use X because Y."

## Consequences
What becomes easier? What becomes harder?
What must change in the codebase, documentation, or CI?

## Alternatives Considered
For each option:
- **Option A** (chosen): pros / cons
- **Option B**: pros / cons
- **Option C**: pros / cons

Explicitly state why each rejected option was not chosen.
```

### Numbering
ADRs are sequentially numbered: `ADR-001-use-vitest.md`, `ADR-002-storage-envelope.md`, etc.

### Storage
All ADRs live in `/docs/adr/`.

## Stack Selection Decision Framework

Before any stack recommendation, the SA MUST answer these questions:

### Required Questions

```
1. DEPLOYMENT TARGET
   - Web browser only? (SPA)
   - Mobile + web? (PWA or native)
   - Server-required? (API + database)
   - Edge / serverless?

2. PERSISTENCE / STATE
   - Is there a backend database?
   - Or is localStorage / IndexedDB sufficient?
   - Is offline support required?
   - Is real-time sync needed?

3. TEAM CONSTRAINTS
   - How many developers?
   - What is their primary language / framework experience?
   - Is this a startup (speed) or enterprise (maintainability)?

4. SCALE EXPECTATIONS
   - Expected concurrent users at launch?
   - Expected data volume per user?
   - 6-month growth projection?
   - Performance targets (LCP, TTI, bundle size)?

5. AUTHENTICATION
   - Is auth required? What level?
   - OAuth? Magic link? Username/password?
   - Third-party provider (Auth0, Clerk, Supabase Auth)?

6. BUDGET / INFRASTRUCTURE
   - Monthly hosting budget?
   - Preferred cloud provider?
   - CI/CD requirements?
   - Is this self-hosted or managed?

7. DATA MODEL COMPLEXITY
   - Simple CRUD? (< 5 entities)
   - Complex relationships? (Many-to-many, nested)
   - File uploads?
   - Search requirements?
```

### Decision Tree

```
Is a backend required?
├── No → Is offline support needed?
│   ├── No → SPA (React/Vue/Svelte) + localStorage
│   └── Yes → SPA + IndexedDB + sync layer
└── Yes → API-first or fullstack?
    ├── API-first → NestJS / FastAPI / Express + DB
    └── Fullstack → Next.js / Nuxt / Remix + DB
```

## When to Write a New ADR vs Amend an Existing One

| Situation | Action |
|-----------|--------|
| First-time decision on a topic | Write new ADR |
| Reversing a previous decision | Write new ADR; mark old as "Superseded by ADR-N" |
| Extending a decision (same direction, more detail) | Amend existing ADR (update Consequences, add date) |
| Minor clarification | Amend existing ADR |
| Changing a dependency version range (minor) | No ADR needed — document in PR |
| Changing a dependency to a different library | Write new ADR |

## Worked Example: Good ADR

### ADR-001: Use Vitest over Jest for Unit Testing

**Status:** Accepted

**Context:** We need a unit testing framework for a new TypeScript project. Jest has been the community standard, but Vitest offers native TypeScript support, ESM compatibility, and faster execution by reusing Vite's transform pipeline. Our build tool is already Vite.

**Decision:** Use Vitest as the unit testing framework. Jest will not be used.

**Consequences:**
- Easier: TypeScript and ESM work out of the box — no ts-jest or babel config needed.
- Easier: Watch mode is instant (Vite HMR).
- Harder: Some Jest-specific plugins (jest-sonar-reporter) may not be compatible.
- Neutral: Vitest API is nearly identical to Jest — minimal learning curve.
- Requires: Add `vitest` dependency, configure in `vite.config.ts`, update CI scripts.

**Alternatives Considered:**
- **Vitest** (chosen): ESM-native, TypeScript-native, same API as Jest, reuses Vite config, watch mode is instant.
- **Jest**: Mature ecosystem, more plugins, but requires ts-jest for TypeScript, slower startup, ESM support is still experimental.
- **Node built-in test runner**: No setup required, but lacks built-in mocking, coverage, and watch mode; ecosystem is immature.

### Why This is Good
- Context states the specific problem (TypeScript project, already on Vite).
- Decision is a single clear sentence.
- Consequences are specific and actionable (not "easier to test").
- Alternatives are compared with honest trade-offs.
- No recommendation for Jest despite its popularity — the decision fits THIS project.

## Worked Example: Bad ADR

### ADR-001: UI Framework

**Status:** Accepted

**Context:** We need a UI framework.

**Decision:** Use React.

**Consequences:** Easier to develop.

**Alternatives Considered:** None.

### Why This is Bad
- Context gives zero specific constraints. What kind of app? What team? What deployment target?
- No rationale — "use React" could be copy-pasted into any project.
- Consequences are meaningless ("easier to develop" — than what?).
- No alternatives means no evidence the decision was evaluated.
- This ADR provides zero value to anyone reading it later.

## Common Failure Modes

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **No context** | "We need a database. Use PostgreSQL." | Write the constraints first: scale, data model, team familiarity, hosting budget |
| **Missing alternatives** | Only one option presented | Document at least 2–3 alternatives with trade-offs |
| **Vague consequences** | "Easier to maintain" | Be specific: "Removes 200 lines of boilerplate. Adds 1 new dependency." |
| **Status never updated** | ADR says "Proposed" for months | Update status to Accepted, Deprecated, or Superseded when decisions change |
| **No date / author** | No timestamp or owner | Include the decision date; the git log tracks the author |
| **Over-engineered** | ADR for changing a button color | ADRs are for architecture, not implementation detail |
| **Groupthink** | "Everyone uses X so we will too" | Evaluate against THIS project's constraints, not industry popularity |

## Verification Checklist

Before the design gate passes:
- [ ] Every structural decision has an ADR
- [ ] Context includes project-specific constraints (not generic statements)
- [ ] Decision is a single clear sentence starting with "We will..."
- [ ] Consequences are concrete (what gets easier, harder, what must change)
- [ ] At least 2 alternatives were considered with explicit trade-offs
- [ ] Stack selection answered all Required Questions from the framework above
- [ ] Status is set to "Accepted" (or "Proposed" if pending review)
