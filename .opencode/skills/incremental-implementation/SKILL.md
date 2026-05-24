---
name: incremental-implementation
description: Delivers changes in thin vertical slices. Use when implementing any change that touches more than one file. Use when you're about to write a large amount of code at once.
license: MIT
compatibility: opencode
metadata:
  audience: fe, be
  workflow: implementation
---

## When to use this skill

Load this skill when implementing any multi-file change, building a new feature from a task breakdown, or refactoring existing code. Use any time you're tempted to write more than ~100 lines before testing. Do NOT use for single-file, single-function changes where scope is already minimal.

## Overview

Build in thin vertical slices — implement one piece, test it, verify it, then expand. Each increment should leave the system in a working, testable state. This is the execution discipline that makes large features manageable.

## The Increment Cycle

```
Implement → Test → Verify → Commit → Next slice
```

### Step 1: Implement
Write the smallest complete piece of functionality.

### Step 2: Test
Run the test suite. If no test exists for this behavior, write one first (TDD).

### Step 3: Verify
Confirm the slice works — tests pass, build succeeds.

### Step 4: Commit
Save progress with a descriptive commit message.

### Step 5: Next Slice
Move to the next increment. Carry forward, don't restart.

## Slicing Strategies

### Vertical Slices (Preferred)
Build one complete path through the stack:
```
Slice 1: Add a todo (storage + hook + UI) → Works end-to-end
Slice 2: Toggle completion
Slice 3: Delete a todo
```

### Risk-First Slicing
Tackle the riskiest piece first:
```
Slice 1: Prove localStorage persistence works
Slice 2: Build UI on top of proven storage
```

## Implementation Rules

**One thing at a time:** Each increment changes one logical thing.

**Keep it compilable:** After each increment, the project must build and tests must pass.

**Feature flags for incomplete work:**
```typescript
const ENABLE_LABELS = process.env.FEATURE_LABELS === 'true';
if (ENABLE_LABELS) { /* new label UI */ }
```

**Safe defaults:** New code defaults to safe, conservative behavior.

**Rollback-friendly:** Each increment independently revertable. Additive changes (new files) are easy to revert.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll test it all at the end" | Bugs compound. A bug in slice 1 makes slices 2-5 wrong. |
| "It's faster to do it all at once" | It feels faster until something breaks across 500 changed lines. |
| "Small commits are pointless" | Small commits are free. Large commits hide bugs. |

## Red Flags

- More than 100 lines written without running tests
- Multiple unrelated changes in a single increment
- "Let me just quickly add this too" scope expansion
- Build or tests broken between increments

## Verification

After completing all increments:
- [ ] Each increment was individually tested and committed
- [ ] The full test suite passes
- [ ] The build is clean
- [ ] The feature works end-to-end as specified
- [ ] No uncommitted changes remain
