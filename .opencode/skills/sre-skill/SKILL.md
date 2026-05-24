---
name: sre-skill
description: Security and reliability checklist for every PR. OWASP Top 10 for SPAs, dependency audit requirements, performance budgets, and runbook standards.
license: MIT
compatibility: opencode
metadata:
  audience: sre
  workflow: verification
---

## When to use this skill

Load this skill during the Design phase to define security and reliability requirements, and during the Verify phase to audit every PR before it merges to `main`. Required reading for SRE on every ticket that touches production code, dependencies, or deployment config.

## Overview

SRE is the last line of defence before code reaches production. Every PR must pass the security and reliability checklist defined here. No exceptions for "small" or "urgent" changes — security vulnerabilities do not respect urgency.

## OWASP Top 10 — SPA Checklist

For every feature that renders user input or loads external data, verify:

### A1: Broken Access Control
- [ ] No sensitive data exposed in client-side source or localStorage without encryption
- [ ] API routes (if any) enforce authentication and authorization server-side
- [ ] Client-side role checks are NOT considered security boundaries

### A2: Cryptographic Failures
- [ ] No hardcoded secrets, API keys, or tokens in client-side code
- [ ] All secrets loaded via environment variables, not committed to git
- [ ] localStorage data is not used for authentication decisions

### A3: Injection (XSS)
- [ ] All user input rendered via framework-safe methods (React JSX, not `dangerouslySetInnerHTML`)
- [ ] Any use of `innerHTML`, `dangerouslySetInnerHTML`, `v-html` must be explicitly approved and include sanitisation (DOMPurify)
- [ ] URL parameters rendered into the DOM must be encoded
- [ ] `<`, `>`, `&` stripped from label/tag input per defense-in-depth

### A4: Insecure Design
- [ ] Rate limiting considered for any form submission or API call
- [ ] No sensitive operations trigger on GET requests

### A5: Security Misconfiguration
- [ ] CSP headers (Content-Security-Policy) are set and tested
- [ ] `X-Content-Type-Options: nosniff` header is present
- [ ] No debug endpoints, console.log statements, or dev-only routes in production build

### A6: Vulnerable and Outdated Components
- [ ] `npm audit --audit-level=high` passes with zero high or critical vulnerabilities
- [ ] No dependency with a known CVE in the current version range
- [ ] All devDependencies are scoped to dev only — no build-time tools in production bundle

### A7: Identification and Authentication Failures
- [ ] Session tokens (if any) are HttpOnly, Secure, SameSite
- [ ] No session data exposed in client-side error messages

### A8: Software and Data Integrity Failures
- [ ] Subresource Integrity (SRI) hashes on external CDN scripts
- [ ] `npm audit` verifies package integrity (lockfile)

### A9: Security Logging and Monitoring Failures
- [ ] Unhandled exceptions are logged with stack trace and user context
- [ ] Security-relevant events (auth failures, validation bypass attempts) are logged

### A10: Server-Side Request Forgery (SSRF)
- [ ] Any URL fetched client-side is validated against an allowlist

## Required CI Checks

These checks MUST pass before a PR can merge:

```
1. npm audit --audit-level=high     → MUST pass (exit code 0)
2. npm run lint                      → MUST pass
3. npm run type-check (tsc)          → MUST pass  
4. npm run test                      → MUST pass (all tests green)
5. npm run build                     → MUST pass (production build succeeds)
6. Bundle size check                  → MUST be within budget
```

### Dependency Audit Policy
- **High/Critical CVEs**: Blocking. PR cannot merge. Update the dependency or add a documented exception.
- **Moderate CVEs**: Non-blocking but must be filed as a separate Issue with a remediation timeline.
- **False positives**: Must be documented in a `.sre-audit-exceptions.md` file at the repo root with CVE ID, reason, and review date.
- **`npm audit` may not exit 0** if audit-level=high finds nothing. That's acceptable — the check is "no high or critical".

### Dependency Addition Policy
Before adding a new NPM dependency:
1. Check GitHub Advisory Database for known CVEs (`gh_sre_check_dependency_vulnerabilities`)
2. Check bundle size impact (use `npm pack --dry-run` or bundle-analysis tool)
3. Check license compatibility (prefer MIT, Apache-2.0, BSD)
4. Check maintenance status (last publish date, open issues, recent commits)
5. Document the decision in an ADR if it's a significant dependency

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

**Dependencies:**
- npm audit — 0 high/critical, 2 moderate (Issues filed: #42, #43)
- No new dependencies added

**Security:**
- No user input rendered without encoding
- CSP headers present: default-src 'self'; script-src 'self' 'unsafe-inline' (for dev only)
- No secrets in source code
- XSS vectors reviewed: label input strips `<`, `>`, `&`, max 30 chars

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
| **Skipping audit** | "It's just a small change" | No change is too small for an audit. At minimum run npm audit. |
| **Ignoring moderate CVEs** | "It's not critical, we'll fix it later" | File an Issue with remediation timeline. Track it. |
| **No runbook** | Incident happens and nobody knows how to respond | Write the runbook before the feature ships |
| **Performance regressions** | Feature ships, Lighthouse drops 20 points | Set up CI performance budget check |
| **Over-reliance on automation** | "CI passes, we're safe" | CI does not catch logic bugs or auth bypasses. Manual review supplements CI. |
| **CSP bypass** | Inline scripts allowed without nonce | Use strict CSP with nonces or hashes, not 'unsafe-inline' |
| **No rollback plan** | Bug discovered in production, nobody knows how to revert | Every PR must have a rollback procedure documented in its runbook |

## Verification Checklist

Before signing off:
- [ ] npm audit --audit-level=high passes
- [ ] No high/critical CVEs in production dependencies
- [ ] All user input is sanitised or framework-escaped
- [ ] No secrets in source code or commit history
- [ ] CSP headers are configured and tested
- [ ] Performance budget is met
- [ ] Runbook exists and covers incident triggers, diagnosis, and rollback
- [ ] Runbook owner and escalation path are specified
- [ ] Any moderate CVEs have corresponding Issues filed
