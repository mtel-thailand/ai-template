---
name: shipping-and-launch
description: Pre-launch checklist, feature flag lifecycle, staged rollouts, rollback procedures, and monitoring for production releases.
license: MIT
compatibility: opencode
metadata:
  audience: fe, be, devops, qa
  workflow: shipping
---

## When to use this skill

Load this skill when preparing a release, shipping a new feature to production, planning a staged rollout, or responding to a production incident. Also use when setting up feature flags or monitoring for a new feature.

## Overview

Shipping is a process, not an event. Every release follows the same cycle: pre-launch checklist, staged rollout, monitoring, and rollback preparedness. This skill covers the process from merge to production verification.

## The Shipping Cycle

```
Pre-Launch Check → Staged Rollout → Monitor → Full Release → Post-Launch Review
```

## Pre-Launch Checklist

Before any release, verify:

### Feature Readiness
- [ ] All acceptance criteria met
- [ ] Edge cases handled (empty, error, loading states)
- [ ] Feature flagged (if incomplete or risky)
- [ ] Documentation updated (`/docs/` files)
- [ ] Changelog entry added

### Testing
- [ ] Unit tests pass
- [ ] Integration/E2E tests pass
- [ ] Manual smoke test on production-like environment
- [ ] Accessibility check (keyboard nav, screen reader, contrast)
- [ ] Performance regression check (Lighthouse/Web Vitals)

### Operations
- [ ] Feature flag configuration reviewed
- [ ] Rollback plan documented
- [ ] Monitoring dashboards updated
- [ ] Alerts configured for error rate spikes
- [ ] Release announced to team

## Feature Flag Lifecycle

```
Create Flag → Gate Feature → Test → Ship (disabled) → Enable → Monitor → Remove Flag
```

### Flag Categories
- **Release toggle:** Ship incomplete code safely (short-lived, removed after GA)
- **Experiment toggle:** A/B test a variant (medium-lived, removed after decision)
- **Kill switch:** Emergency disable for problematic features (long-lived, rarely used)

### Flag Cleanup
Remove feature flags immediately after the feature is fully released and stable. Dead flags accumulate and create dead code paths.

## Staged Rollout

Instead of enabling a feature for all users at once, stage the rollout:

| Stage | Scope | Duration | Verification |
|-------|-------|----------|-------------|
| 1 | Internal team | 1 hour | Smoke test, error rate |
| 2 | 1% of users | 1 day | Error rate, performance |
| 3 | 10% of users | 1 day | All metrics stable |
| 4 | 50% of users | 1 day | Confirm no regressions |
| 5 | 100% | Forever | Full release |

**Halt conditions:** If error rate increases by >1%, p95 latency increases by >10%, or any Critical bug is reported, pause the rollout and assess.

## Rollback Procedures

### Fast Rollback (Feature Flag)
Flip the feature flag off. This is the preferred rollback method — instant and no deploy needed.

### Full Rollback (Git Revert)
1. Identify the commit(s) to revert
2. `git revert <commit-sha>` on main
3. Push the revert
4. Verify the fix in production

### Rollback Checklist
- [ ] Feature flag kill switch is available (preferred)
- [ ] Git revert path identified before release
- [ ] Rollback tested in non-production environment
- [ ] Team knows who has authority to initiate rollback

## Monitoring

### What to Monitor After Release
- **Error rate:** 5xx responses, client-side errors, unhandled exceptions
- **Performance:** LCP, CLS, INP, API response times
- **Usage:** Feature adoption, user engagement metrics
- **Business metrics:** Conversions, signups, key user actions

### Alert Thresholds
- **Pager (immediate):** Error rate > 5%, complete feature outage
- **Ticket (same day):** Performance regression > 10%, error rate > 1%
- **Dashboard (watch):** Gradual degradation, adoption below target

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "We'll feature-flag it later" | Adding a flag later requires a refactor. Ship with flags from the start. |
| "The rollout is just a flip of a switch" | Even simple flips need monitoring. Always stage. |
| "It passed tests, so it's ready for all users" | Tests can't replicate every production scenario. Staged rollout catches what tests miss. |

## Red Flags

- Shipping without a feature flag for incomplete features
- No rollback plan before going live
- Releasing on a Friday afternoon
- No monitoring after release
- Skipping staged rollout for "low-risk" changes

## Verification

- [ ] Pre-launch checklist completed
- [ ] Feature flag in place (if applicable)
- [ ] Staged rollout planned
- [ ] Monitoring and alerts configured
- [ ] Rollback procedure documented
- [ ] Post-launch metrics reviewed
