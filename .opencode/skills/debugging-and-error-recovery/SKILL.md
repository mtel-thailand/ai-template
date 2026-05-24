---
name: debugging-and-error-recovery
description: Five-step triage for failures. Use when tests fail, builds break, or behavior is unexpected.
license: MIT
compatibility: opencode
metadata:
  audience: fe, be, qa
  workflow: debugging
---

## When to use this skill

Load this skill when tests fail, builds break, behavior is unexpected, or a bug report arrives. Do NOT start fixing until you've completed the triage steps.

## Overview

Five-step triage process: Reproduce → Localize → Reduce → Fix → Guard. The stop-the-line rule: if a test fails or a build breaks, stop adding new code and fix it first.

## The Five-Step Triage

### Step 1: Reproduce
Confirm the bug exists. Write a test that reproduces it (the Prove-It Pattern). The test should FAIL with the current code.

### Step 2: Localize
Isolate the root cause. Use console.log, debugger, browser DevTools, or binary search (comment out half the code at a time).

### Step 3: Reduce
Minimize the failing scenario. Strip away unrelated code until you have the minimal reproduction.

### Step 4: Fix
Implement the minimal fix. Target the root cause, not the symptom.

### Step 5: Guard
Your reproduction test now passes. Keep it — it prevents regression. Add additional edge case tests if needed.

## The Prove-It Pattern (Bug Fixes)
```
Bug report arrives → Write reproduction test → Test FAILS (bug confirmed)
→ Implement fix → Test PASSES (fix confirmed) → Run full suite (no regressions)
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I know what the bug is, I don't need to reproduce it" | If you can't reproduce it, you can't prove it's fixed. |
| "I'll just add a quick workaround" | Workarounds accumulate. Fix the root cause. |
| "This failure is unrelated to my change" | Always verify. CI doesn't lie about regressions. |

## Red Flags

- Fixing without first reproducing
- "Works on my machine" without investigating environment differences
- Adding console.log without removing them later
- Ignoring test failures to "keep moving"

## Verification

- [ ] Bug reproduced with a failing test
- [ ] Root cause identified
- [ ] Minimal fix implemented
- [ ] Reproduction test passes after fix
- [ ] Full test suite passes (no regressions)
- [ ] Debugging artifacts (console.log, debugger) removed
