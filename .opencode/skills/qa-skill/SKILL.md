---
name: qa-skill
description: How to write a test plan, define coverage targets, and produce a QA delivery report that gates PRs to main.
license: MIT
compatibility: opencode
metadata:
  audience: qa
  workflow: verification
---

## When to use this skill

Load this skill during the Design phase to write the test plan against the PO's acceptance criteria, and during the Verify phase to execute tests and produce the QA sign-off report. Essential for QA on every ticket. Do NOT load for infrastructure-only changes (no user-facing impact).

## Overview

The test plan is the QA counterpart to the PO's acceptance criteria. Where the AC says what the feature should do, the test plan says how we will prove it does it. Every AC must be mapped to at least one test case. The QA delivery report is the gate that must pass before a PR can merge to `main`.

## Test Plan Required Sections

### 1. Scope
What is being tested? What is NOT being tested? Reference the Issue number.

### 2. Testing Pyramid Targets
Define the ratio of tests per layer:

| Layer | Target | Tool |
|-------|--------|------|
| Unit | ≥ 70% of all tests | Vitest |
| Integration | 15–25% of all tests | Vitest + Testing Library |
| E2E | 5–15% of all tests | Playwright |
| Manual exploratory | As needed | N/A |

### 3. Test Environment
- Browser(s) and version(s)
- Device(s) — desktop, tablet, mobile
- Screen resolutions to verify
- Network conditions (online, offline, throttled 3G)
- Feature flags state

### 4. Data Setup
What test data must exist before tests run? (fixtures, mocks, localStorage state, API responses)

### 5. Entry Criteria
What must be true before testing starts? (code complete, unit tests pass, build succeeds, deployed to test env)

### 6. Exit Criteria
What must be true for testing to be complete? (all Must-pass tests green, no P0/P1 bugs open, accessibility scan clean, performance budget met)

### 7. Test Cases
Each test case follows this structure:

| Field | Description |
|-------|-------------|
| ID | TC-[area]-[number] (e.g. TC-LABEL-001) |
| Description | One sentence: what is being tested |
| Prerequisites | State/conditions that must exist before running |
| Steps | Numbered list of exact user/API actions |
| Expected Result | Observable outcome, exactly one per test case |
| Actual Result | Filled during execution |
| Pass/Fail | Filled during execution |
| Linked AC | Which acceptance criterion this tests |
| Severity | Must / Should / Nice |

### 8. Defect Reporting
Every failed test must be filed as a GitHub Issue with:
- Title: `[BUG] <area>: <short description>`
- Steps to reproduce (copied from test case)
- Actual vs expected
- Environment details
- Screenshot / video / console log
- Severity label (P0=blocker, P1=high, P2=medium, P3=low)

## Coverage Standards

### "Must" Features (required for every PR)
- **Unit tests**: 100% of utility functions, hooks, and pure logic must have unit tests covering: success path, error path, boundary values, edge cases
- **Integration tests**: Every component with user interaction must have at least one integration test covering each state (default, loading, empty, error, success)
- **E2E**: At least one happy-path E2E test must cover the complete feature flow

### "Should" Features (recommended but not blocking)
- **Unit tests**: ≥ 80% line coverage
- **Integration tests**: Every component variant and prop combination
- **E2E**: Error paths, edge cases, and regression scenarios

### Accessibility Testing Standard
Before QA signs off:
- [ ] Run `axe-core` on every view/route
- [ ] No critical or serious violations
- [ ] All violations must be documented and triaged (not silently ignored)
- [ ] Manual keyboard audit: tab through every interactive element — all must receive focus in logical order
- [ ] Screen reader audit: navigate the feature with VoiceOver/NVDA — all dynamic content must be announced

Violations that cannot be fixed in the current ticket must be filed as a separate Issue with `accessibility` label and linked from the current ticket.

### Performance Testing Standard
Before QA signs off:
| Metric | Minimum | Target |
|--------|---------|--------|
| Lighthouse Performance | ≥ 90 | ≥ 95 |
| Lighthouse Accessibility | ≥ 95 | ≥ 98 |
| Lighthouse Best Practices | ≥ 90 | ≥ 95 |
| SEO | ≥ 90 | ≥ 95 |
| Largest Contentful Paint (LCP) | ≤ 2.5s | ≤ 1.8s |
| First Input Delay (FID) | ≤ 100ms | ≤ 50ms |
| Cumulative Layout Shift (CLS) | ≤ 0.1 | ≤ 0.05 |
| Bundle size (JS initial) | ≤ 200 KB | ≤ 100 KB |

## QA Delivery Report

Before a PR can merge to `main`, QA must produce a delivery report posted as a comment on the PR. The report MUST contain:

```
### QA Sign-off Report

**Ticket:** #NNN
**Tester:** [QA agent name]
**Date:** YYYY-MM-DD

**Results Summary:**
- Total test cases: N
- Passed: N
- Failed: N
- Skipped: N

**Coverage:**
- Unit: N tests — X% line coverage
- Integration: N tests
- E2E: N tests

**Accessibility:**
- Axe violations: N (critical/serious: N, moderate: N, minor: N)
  - All violations triaged: Yes/No
- Keyboard audit: Pass/Fail
- Screen reader audit: Pass/Fail

**Performance:**
- Lighthouse Performance: X
- Lighthouse Accessibility: X
- LCP: X.Xs
- CLS: X.XXX

**Known Issues (non-blocking):**
- #NNN — filed for next iteration

**Verdict:** ✅ PASS / ❌ FAIL (blocking issues)
```

## Worked Example: Good Test Case

```
ID: TC-LABEL-005
Description: Adding a duplicate label to a todo is silently ignored
Prerequisites: Todo exists with label "urgent"
Steps:
1. Click "+ add" on the todo
2. Type "urgent" in the label input
3. Press Enter
Expected Result: The todo still has exactly one label ("urgent"). No duplicate appears. No error shown.
Linked AC: "Duplicate label (already on this todo): silently ignored"
Severity: Must
```

## Worked Example: Bad Test Case

```
ID: TC-1
Description: Test labels
Prerequisites: None
Steps: Click around and see what happens
Expected Result: It should work
```

### Why This is Bad
- ID gives no indication of area (TC-1 could be anything)
- Description is not specific — "Test labels" covers dozens of scenarios
- No prerequisites means the test starts from an unknown state
- "Click around" is not reproducible
- "It should work" is not verifiable — what does "work" mean?

## Common Failure Modes

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **No test case mapping to AC** | QA signs off but AC not verified | Every AC must have at least one test case with Linked AC field |
| **Vague expected results** | "Should work", "Should be correct" | Write exact observable outcome |
| **Missing environment** | Bug found in CI but not reproducible locally | Document exact browser, OS, and device config |
| **Skipping accessibility** | Axe violations found post-merge | Run axe-core before every sign-off |
| **Performance not measured** | Feature ships, users complain about slowness | Run Lighthouse and budget check before sign-off |
| **No negative testing** | Only happy path tested | Add error, boundary, empty, and edge-case test cases |
| **Report without verdict** | "Here are the results" but unclear if it passes | End every report with ✅ PASS or ❌ FAIL |

## Verification Checklist

Before signing off:
- [ ] Test plan maps every AC to at least one test case
- [ ] Unit tests cover success, error, boundary, and edge cases
- [ ] Integration tests cover all component states
- [ ] At least one E2E happy path exists
- [ ] Axe-core scan shows no critical/serious violations
- [ ] Keyboard audit passes
- [ ] Lighthouse Performance ≥ 90
- [ ] All failed tests have GitHub Issues filed
- [ ] Delivery report is posted on the PR
- [ ] Verdict is clearly PASS or FAIL
