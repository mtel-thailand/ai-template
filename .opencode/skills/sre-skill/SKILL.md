---
name: sre-skill
description: Reliability and performance checklist for every PR. Covers SLOs/SLIs, performance budgets, runbook standards, and incident response procedures.
license: MIT
compatibility: opencode
metadata:
  audience: sre
  workflow: verification
---

## When to use this skill

Load this skill during the Design phase to define reliability and performance requirements, and during the Verify phase to audit every PR before it merges to `main`. Required reading for SRE on every ticket that touches production paths, performance-sensitive code, or deployment config.

## Overview

SRE is the last line of defence before code reaches production. Every PR must pass the reliability and performance checklist defined here. Security concerns are handled by the Security Engineer and their dedicated skill.

## Performance Budget

| Metric | Budget | Measurement |
|--------|--------|-------------|
| Initial JS bundle (gzip) | ≤ 100 KB | `vite-bundle-visualizer` or `webpack-bundle-analyzer` |
| Initial CSS bundle (gzip) | ≤ 20 KB | Same |
| Total page weight | ≤ 300 KB | DevTools Network tab |
| Largest Contentful Paint (LCP) | ≤ 2.5s | Lighthouse |
| Cumulative Layout Shift (CLS) | ≤ 0.1 | Lighthouse |
| First Input Delay (FID) | ≤ 100ms | Lighthouse / CrUX |
| Time to Interactive (TTI) | ≤ 3.5s | Lighthouse |

## Runbook Standard

Every feature that affects production behaviour must have a runbook. The runbook must contain:

### Required Sections

1. **Overview**: What system/feature this runbook covers
2. **Incident Triggers**: List of symptoms that indicate a problem (error rates, latency spikes, user reports)
3. **Diagnosis Steps**: Numbered sequence to identify the root cause
4. **Rollback Procedure**: Exact steps to revert the change (git revert, feature flag toggle, database rollback)
5. **Owner**: The team or person responsible for this runbook
6. **Escalation Path**: Who to contact if the runbook steps do not resolve the incident
7. **Last Reviewed**: Date the runbook was validated

### Runbook Storage
All runbooks live in `/docs/runbooks/` with names matching the feature or component they cover.

### Example Runbook Entry
```markdown
## Feature: Todo List (localStorage)

### Incident Triggers
- User reports todos disappearing after refresh
- Console error: "Failed to read localStorage"
- Console error: "Unexpected token in JSON at position..."

### Diagnosis Steps
1. Open DevTools → Application → Local Storage → `ai-todo-todos`
2. Check if the value is valid JSON (use JSON.parse in console)
3. If parse fails: corrupt data — proceed to rollback
4. If parse succeeds: check `version` field — if missing, old format
5. If format is old: log as "non-critical" — migration will run on next page load

### Rollback Procedure
1. `git revert HEAD` on main for the offending commit
2. Clear localStorage: `localStorage.removeItem('ai-todo-todos')` (user loses data — last resort)
3. Deploy the revert
4. Notify users of the data loss in the release notes

### Owner
DevOps (@devops)

### Escalation
PM → SA → Original feature author

### Last Reviewed
2026-05-24
```

## Worked Example: Good SRE Audit Comment on PR

```
## SRE Audit — Pass ✅

**Performance:**
- Bundle size: 85 KB gzip (budget: 100 KB) ✅
- Lighthouse Performance: 94 ✅
- LCP: 1.8s (budget: 2.5s) ✅
- CLS: 0.02 (budget: 0.1) ✅

**Runbook:**
- /docs/runbooks/label-feature.md created with incident triggers and rollback

**Verdict:** ✅ All checks pass — safe to merge
```

## Common Failure Modes

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **No runbook** | Incident happens and nobody knows how to respond | Write the runbook before the feature ships |
| **Performance regressions** | Feature ships, Lighthouse drops 20 points | Set up CI performance budget check |
| **No rollback plan** | Bug discovered in production, nobody knows how to revert | Every PR must have a rollback procedure documented in its runbook |
| **Missing SLOs** | No measurable reliability target | Define p50/p95/p99 latency and error-rate SLOs before shipping |
| **Skipping soak tests** | "Unit tests pass, we're fine" | Run baseline, peak, and soak (≥1h) load tests for any latency-sensitive change |

## Verification Checklist

Before signing off:
- [ ] Performance budget is met (JS bundle, CSS bundle, LCP, CLS, TTI)
- [ ] SLOs/SLIs are defined and achievable (latency p50/p95/p99, error rate)
- [ ] Load test report attached: p50/p95/p99 latency, error rate, breaking point vs. targets
- [ ] Runbook exists and covers incident triggers, diagnosis, and rollback
- [ ] Runbook owner and escalation path are specified
- [ ] Incident response plan documented for any new failure mode
