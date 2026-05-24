---
name: spec-driven-development
description: Creates specs before coding. Use when starting a new feature or significant change with no specification yet. Use when requirements are unclear, ambiguous, or only exist as a vague idea.
license: MIT
compatibility: opencode
metadata:
  audience: pm, po, sa, fe, be, qa
  workflow: design
---

## When to use this skill

Load this skill when starting a new feature, project, or significant change and no specification exists yet. Also use when requirements are unclear, ambiguous, or only exist as a vague idea. Do NOT use for single-line fixes, typo corrections, or changes where requirements are unambiguous.

## Overview

Write a structured specification before writing any code. The spec is the shared source of truth between the squad and the user — it defines what we're building, why, and how we'll know it's done. Code without a spec is guessing.

This squad is SPEC-DRIVEN by design. The PM enforces a gated workflow: no implementation begins until PO, SA, QA, and SRE have each explicitly agreed on the solution.

## The Gated Workflow

```
SPECIFY ──→ DESIGN ──→ PLAN ──→ IMPLEMENT
   │           │         │          │
   ▼           ▼         ▼          ▼
 SA/PO       SA/UX     SA/BE/FE   BE/FE
```

### Phase 1: Specify

Start with a high-level vision. The PO writes the ticket description and acceptance criteria. Surface assumptions immediately:

```
ASSUMPTIONS I'M MAKING:
1. This is a client-side SPA (React)
2. Persistence uses localStorage
3. No backend required
4. Targeting modern browsers only
→ Correct me now or I'll proceed with these.
```

### Phase 2: Design

SA designs the solution — architecture, components, data flow, task split across BE/FE. UX designs user flows if UI is involved. QA produces the test plan.

### Phase 3: Plan

Break the approved design into implementable tasks with acceptance criteria and dependency ordering.

### Phase 4: Implement

Execute tasks one at a time using incremental-implementation and test-driven-development skills.

## Strong vs Weak Acceptance Criteria

| Weak | Strong |
|------|--------|
| "The form works" | "Submitting the form with valid data saves to localStorage and shows a success message" |
| "Handle errors" | "Submitting with empty title shows inline validation error 'Title is required'" |
| "Fast loading" | "List renders within 200ms for 100 items" |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is simple, I don't need a spec" | Simple tasks need short specs, not no specs. A 3-line spec is fine. |
| "I'll write the spec after I code it" | That's documentation, not specification. The spec's value is forcing clarity *before* code. |
| "The spec will slow us down" | A 15-minute spec prevents hours of rework. |
| "Requirements will change anyway" | The spec is a living document. Update it when decisions change. |
| "The user knows what they want" | Even clear requests have implicit assumptions. The spec surfaces them. |

## Red Flags

- Starting implementation without any written requirements
- Making architectural decisions without documenting them
- Success criteria that aren't specific or testable
- Skipping the spec because "it's obvious what to build"

## Verification

Before proceeding to implementation, confirm:
- [ ] Acceptance criteria are specific and testable
- [ ] Boundaries (Always/Ask First/Never) are defined
- [ ] PO, SA, QA, and SRE have explicitly agreed on the solution
- [ ] UX design exists for any user-facing changes
- [ ] The spec is documented in the GitHub Issue
