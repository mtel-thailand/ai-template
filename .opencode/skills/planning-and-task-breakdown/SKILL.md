---
name: planning-and-task-breakdown
description: Breaks work into ordered tasks with acceptance criteria. Use when you have a spec and need implementable units. Use when a task feels too large to start or when parallel work is possible.
license: MIT
compatibility: opencode
metadata:
  audience: sa, fe, be, pm
  workflow: planning
---

## When to use this skill

Load this skill when you have a spec and need to break it into implementable units. Also use when a task feels too large or vague to start, work needs to be parallelized, or the implementation order isn't obvious.

## Overview

Decompose work into small, verifiable tasks with explicit acceptance criteria. Good task breakdown is the difference between an agent that completes work reliably and one that produces a tangled mess. Every task should be small enough to implement, test, and verify in a single focused session.

## The Planning Process

### Step 1: Enter Plan Mode
Before writing any code, read the spec and relevant codebase sections. Identify existing patterns, map dependencies, note risks. Do NOT write code during planning.

### Step 2: Map the Dependency Graph
```
Data model → Storage layer → Hook/Service → Component → UI
```
Implementation order follows the dependency graph bottom-up.

### Step 3: Slice Vertically
Build one complete feature path at a time:
- **Bad (horizontal):** Task 1: Build entire DB schema. Task 2: Build all APIs. Task 3: Build all UI.
- **Good (vertical):** Task 1: User can add a todo (storage + hook + UI). Task 2: User can toggle completion. Task 3: User can delete a todo.

### Step 4: Write Tasks
Each task needs: Description, Acceptance Criteria (3 bullets max), Verification step, Dependencies, Files touched.

### Task Sizing

| Size | Files | Scope |
|------|-------|-------|
| XS | 1 | Single function or config change |
| S | 1-2 | One component or hook |
| M | 3-5 | One feature slice |
| L | 5-8 | Multi-component feature — consider breaking down |
| XL | 8+ | Too large — must break down further |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll figure it out as I go" | That's how you end up with rework. 10 minutes of planning saves hours. |
| "The tasks are obvious" | Write them down. Explicit tasks surface hidden dependencies. |
| "Planning is overhead" | Planning IS the task. Implementation without a plan is just typing. |

## Red Flags

- Starting implementation without a written task list
- Tasks that say "implement the feature" without acceptance criteria
- No verification steps in the plan
- All tasks are XL-sized

## Verification

Before starting implementation, confirm:
- [ ] Every task has acceptance criteria
- [ ] Every task has a verification step
- [ ] Task dependencies are identified and ordered correctly
- [ ] No task touches more than ~5 files
- [ ] Checkpoints exist between major phases
