---
name: code-review-and-quality
description: Structured code review framework. Use before merging any change to evaluate correctness, readability, architecture, security, and performance.
license: MIT
compatibility: opencode
metadata:
  audience: fe, be, qa
  workflow: review
---

## When to use this skill

Load this skill before merging any change, during pull request review, or when evaluating code quality. Used by QA during the verification phase and by BE/FE during self-review before PR.

## Overview

Review changes across five dimensions. Categorize every finding by severity. Never approve code with Critical issues. Always include positive feedback.

## The Five-Axis Review

### 1. Correctness
- Does the code do what the spec says?
- Are edge cases handled (null, empty, boundary, error)?
- Do the tests actually verify the behavior?
- Any race conditions or state inconsistencies?

### 2. Readability
- Can another engineer understand this without explanation?
- Are names descriptive and consistent?
- Is control flow straightforward (no deep nesting)?

### 3. Architecture
- Follows existing patterns or justified new pattern?
- Module boundaries maintained? Any circular deps?
- Abstraction level appropriate (not over-engineered)?

### 4. Security
- Input validated and sanitized at boundaries?
- Secrets kept out of code, logs, and version control?
- localStorage wrapped in try/catch?
- No dangerouslySetInnerHTML?

### 5. Performance
- N+1 query patterns?
- Unbounded loops or unconstrained data?
- Missing pagination?
- Unnecessary re-renders?

## Severity Labels

| Label | Meaning | Action |
|-------|---------|--------|
| Critical | Security, data loss, broken functionality | Must fix before merge |
| Important | Missing test, wrong abstraction, poor error handling | Should fix before merge |
| Suggestion | Naming, style, optional optimization | Consider for improvement |

## Output Template

```markdown
## Review Summary
**Verdict:** APPROVE | REQUEST CHANGES
**Overview:** [1-2 sentences]

### Critical Issues
### Important Issues
### Suggestions
### What's Done Well
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll fix it in the next PR" | Next PRs never happen. Fix it now or track it. |
| "This is too small to review" | Small changes cause big bugs. Size doesn't determine review necessity. |
| "The tests pass, so it's fine" | Passing tests don't guarantee good architecture or security. |

## Red Flags

- No tests for new behavior
- PR with more than ~100 lines changed (hard to review)
- Mixed concerns (refactor + feature in same PR)
- No spec reference in PR description

## Verification

- [ ] Five-axis review completed
- [ ] All Critical and Important issues addressed
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Spec referenced in PR
