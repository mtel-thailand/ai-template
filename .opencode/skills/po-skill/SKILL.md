---
name: po-skill
description: How to write a GitHub Issue that passes Definition of Ready. Covers title format, required sections, acceptance criteria standard, and common failure modes.
license: MIT
compatibility: opencode
metadata:
  audience: po
  workflow: design
---

## When to use this skill

Load this skill when writing a new GitHub Issue — feature, bug, chore, or improvement — that needs acceptance criteria. Essential for the Product Owner during the Define phase. Not needed for questions, discussions, or trivial changes.

## Overview

A well-written Issue is the foundation of the spec-driven workflow. The PO owns the Issue description and acceptance criteria. If the Issue does not pass Definition of Ready (DoR), the design gate cannot open and implementation cannot start. This skill defines what "good" looks like in measurable, auditable terms.

## Issue Title Format

Use conventional-commit-style prefixes so the title alone tells you what kind of change it is:

```
<type>: <imperative description of the change>
```

| Type | When | Example |
|------|------|---------|
| `feat` | New feature | `feat: add due-date sorting to Daily Plan view` |
| `fix` | Bug fix | `fix: localStorage migration fails on corrupt JSON` |
| `chore` | Infrastructure / config | `chore: harden template skills and role definitions` |
| `refactor` | Code restructure | `refactor: extract useTodos hook from App component` |
| `docs` | Documentation only | `docs: add ADR for stack decision framework` |
| `test` | Test-only changes | `test: add E2E for label add and remove flow` |
| `perf` | Performance improvement | `perf: memoize TodoList render to avoid 200ms re-render` |

**Good:** `feat: add due-date sorting to Daily Plan view`  
**Bad:** `Implement sort feature` (no type prefix, no context about what is being sorted)

## Required Issue Sections

Every Issue MUST contain these sections in order:

### Description
1–3 paragraphs answering: What problem are we solving? Who is affected? What is the current behaviour and what should the new behaviour be? Include any relevant screenshots, error messages, or links.

### Scope
A bullet list of what IS in scope for this ticket. This sets boundaries and prevents scope creep.

### Out of Scope
A bullet list of what is EXPLICITLY not included. If you don't write this, someone will assume it's included.

### Acceptance Criteria
A checklist of independently verifiable conditions (see standard below).

### Dependencies
- Blocked by: #NNN (if any)
- Blocks: #NNN (if any)

## Acceptance Criteria Standard

### The Rule
**Every AC must be verifiable by a QA agent WITHOUT asking a clarifying question.**

### Format
Use the "Given / When / Then" (GWT) pattern for functional criteria:

```
- [ ] Given <precondition(s)>, when <user action>, then <observable result>
```

For non-functional criteria (performance, security), use measurable thresholds:

```
- [ ] <component> <metric> <operator> <value> under <condition>
```

### Examples

**Good (passing):**
```
- [ ] Given a list with 10 todos where 3 are completed, when the user taps "Hide completed", then the list shows exactly 7 active items and a banner reads "3 completed hidden"
- [ ] Submitting the form with an empty title shows inline validation error "Title is required" below the title input
- [ ] When the user presses Escape while the label input is focused, the input closes and any typed text is discarded
- [ ] The addLabel function trims whitespace, strips `<`, `>`, `&` characters, and silently ignores labels over 30 characters
- [ ] Lighthouse Performance score is ≥ 90 on a desktop 3G throttled connection
```

**Failing (bad):**
- ❌ "Smart Daily Plan works" — not verifiable. What does "works" mean? What inputs? What outputs?
- ❌ "Handle errors gracefully" — not specific. Which errors? What does graceful look like?
- ❌ "Fast loading" — not measurable. Fast for whom? Under what conditions?
- ❌ "The form works" — what form? What does working mean? What are the success and failure states?
- ❌ "Users should be able to add labels" — passive voice, not testable. What interaction? What's the expected result?

### Checklist Quality Rules

1. **One condition per checkbox.** Never: "Form validates and submits and shows success". Split into three.
2. **Observable behaviour only.** Never reference internal implementation details like function names or component state variables.
3. **Boundary cases get their own AC.** Empty state, error state, maximum input, minimum input, duplicate action — each gets a separate line.
4. **Edge cases are explicit.** "What happens when localStorage is full?" is an AC, not a question.

## Common Failure Modes

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **Vague criteria** | "The feature works" | Rewrite as GWT with preconditions, action, and observable result |
| **Implementation leak** | "The useTodos hook should return isLoading" | Describe behaviour: "When data is loading, the list shows a spinner" |
| **Missing edge cases** | QA finds bugs on first test run | Add ACs for empty, error, maximum, minimum, and duplicate states |
| **Scope ambiguity** | Developer asks "should I also handle X?" | Fill the "Out of Scope" section before the design gate |
| **Untestable criteria** | "The UI should feel responsive" | Replace with: "All interactions respond within 100ms as measured by the Performance tab" |
| **Compound checkbox** | "Form validates, submits, and shows success" | Split into three separate checkboxes |
| **Passive voice** | "Labels should be deletable" | Rewrite: "When the user clicks the × button on a label pill, the label is removed from the todo and the change is persisted" |
| **Missing preconditions** | "The filter works" | Add: "Given 5 active and 3 completed todos" |

## Verification Checklist

Before the design gate opens, confirm:
- [ ] Title uses conventional-commit prefix
- [ ] All required sections are present (Description, Scope, Out of Scope, AC, Dependencies)
- [ ] Each AC is a single, independently verifiable condition
- [ ] No AC uses vague terms (works, should, feels, gracefully, properly)
- [ ] GWT format used for functional criteria
- [ ] Edge cases have explicit ACs (empty, error, max, min, duplicate)
- [ ] "Out of Scope" is explicit enough to prevent scope creep
- [ ] Dependencies are linked (or "None" stated)
