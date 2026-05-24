---
name: security
description: Security scanning, dependency auditing, and vulnerability assessment
license: MIT
compatibility: opencode
metadata:
  audience: sre
  workflow: security
---

## When to use this skill

Load this skill when performing security review — auditing
dependencies for CVEs, reviewing code for OWASP Top 10 risks, checking
for secret leakage, or running vulnerability scanners. Used by SRE
during design gate (setting requirements) and verification phase
(running scans).

## Overview

Security for this project follows a defense-in-depth strategy organized
around a **Three-Tier Boundary System** that catches vulnerabilities at
progressively deeper layers. Each tier is a gate: if an attacker bypasses
one, the next tier still protects the application.

---

## Process

### Three-Tier Boundary System

| Tier | Layer | Focus | Project example |
|------|-------|-------|-----------------|
| **T1** | Input Validation | Sanitize every untrusted input before use | Strip XSS from todo title; validate JSON shape from localStorage |
| **T2** | Output Encoding | Encode data when it crosses a context boundary | React's default JSX escaping; JSON.stringify for storage |
| **T3** | Runtime Protection | Catch failures that slip through T1/T2 | try/catch around localStorage; Content Security Policy headers |

**T1 — Input Validation**
- Strip/escape HTML tags from user-supplied todo titles
- Validate that parsed localStorage data matches the expected `Todo[]` schema (reject malformed entries)
- Reject titles exceeding 500 characters
- Sanitize label values: strip whitespace, remove `<` and `>` characters, limit to 50 chars

**T2 — Output Encoding**
- React's JSX automatically encodes string content — never use `dangerouslySetInnerHTML`
- When serializing todos to localStorage, `JSON.stringify` produces safe text
- If displaying user content in `title` attributes or `aria-label`, pass through plain text only

**T3 — Runtime Protection**
- Wrap all `localStorage.getItem` and `setItem` calls in try/catch (quota exceeded, corrupt data)
- Use a Content Security Policy meta tag or HTTP header to prevent inline script execution
- Graceful degradation: if storage read fails, start with empty todo list

### OWASP Top 10 — Project-Specific Guidance

#### A1: Broken Access Control
Not directly applicable to a client-only app. If backend is added later,
ensure each user can only read/write their own todos. Validate ownership
on every request — don't rely on the client sending a correct `userId`.

#### A3: Injection (XSS)
```typescript
// UNSAFE — XSS via localStorage
const raw = localStorage.getItem('ai-todo-todos');
const todos = JSON.parse(raw || '[]'); // trust nothing

// SAFE
function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem('ai-todo-todos');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTodo); // runtime schema check
  } catch {
    return [];
  }
}
```

```typescript
// UNSAFE — XSS via innerHTML
element.innerHTML = userSuppliedTitle;

// SAFE — React does this by default
return <span>{userSuppliedTitle}</span>;
```

#### A2: Cryptographic Failures
- localStorage data is **not encrypted** by default. Treat anything in
  localStorage as readable by any JavaScript running on the same origin.
- Never store access tokens, session IDs, or PII in localStorage.
- If sensitive data must be stored, use the Web Crypto API (`crypto.subtle.encrypt`)
  with a key derived from a user passphrase.

#### A4: Vulnerable & Outdated Components
See [npm audit triage tree](#npm-audit-triage-tree) below.

#### A10: Server-Side Request Forgery (SSRF)
Not applicable to a client-only app. If backend proxies external
resources, validate and whitelist target URLs — never pass user input
directly to `fetch()` or `http.get()`.

### npm Audit Triage Tree

```
CVE found via `npm audit`
│
├─ Severity check
│  ├─ CRITICAL / HIGH → must fix before merge
│  └─ LOW / MODERATE → evaluate impact
│
├─ Patch available?
│  ├─ YES → run `npm audit fix` (or manually update the transitive dep)
│  │   └─ Run `npm audit` again to confirm 0 critical/high
│  └─ NO → evaluate options:
│      ├─ Workaround: use resolution overrides in package.json
│      │   "overrides": { "dep@x.y.z": "fixed-version" }
│      ├─ Fork/patch: if the fix doesn't exist, consider a monkey-patch
│      └─ Risk accept: document in ADR only if:
│         │  • No exploit path in this project (client-only, no network)
│         │  • Fix pending from upstream
│         │  • Track with a follow-up issue + due date
│         └─ Label: `security-debt`
```

### Secret Detection Workflow

Scan for secrets before every commit (ideally via a pre-commit hook):

```bash
# Scan staged files for common secret patterns
git diff --cached --name-only | xargs grep -rn \
  -e '(?i)(api[_-]?key|secret|token|password|passwd|credential)' \
  -e '(?i)-----BEGIN (RSA |EC )?PRIVATE KEY' \
  -e 'gh[pousr]_[A-Za-z0-9]{24,}' `# GitHub tokens` \
  2>/dev/null || echo "No secrets found in staged changes"
```

If a secret is found in git history:
```bash
# 1. Identify commits containing the secret
git log -S <secret-value> --source --all

# 2. Rotate the credential immediately (revoke + generate new one)

# 3. Remove from history using git-filter-repo
# pip install git-filter-repo
git filter-repo --path-glob '*.env' --invert-paths
# OR for a specific string replacement:
git filter-repo --replace-text <(echo "apiKey=REPLACED")

# 4. Force-push and notify the team
# 5. Audit CI logs and any third-party integrations that may have captured it
```

### Bundle Analysis for Dependency Risk

Every dependency is a supply-chain risk. Review before adding:

```bash
# 1. Check bundle size contribution
npx cost-of-modules          # size per package
npx bundle-wizard           # visual tree map

# 2. Check unused imports
npx ts-prune                # find dead exports
npx depcheck                # find unused dependencies

# 3. Check supply chain health
npm doctor                  # verify npm registry, permissions
npx socket                 # check package health (Socket.dev)
npm audit --json | npx loadlicenses  # review licenses
```

Decision criteria for adding a dependency:
- ✅ **Approved**: Actively maintained, known authors, small bundle, security-reviewed
- ⚠️ **Scrutinize**: Transitive deps with many sub-deps, unmaintained, single contributor
- ❌ **Rejected**: Includes `eval()` or dynamic code execution, known malware history, GPL license (if incompatible)

---

## Common Rationalizations

| Rationalization | Why it's dangerous | What to do instead |
|----------------|-------------------|-------------------|
| "It's just a client-only app — there's no attack surface" | XSS via localStorage poisoning can steal session data, infect other tabs via `storage` events | Apply T1–T3 even in client-only apps |
| "React escapes by default, so XSS isn't possible" | `dangerouslySetInnerHTML`, `href` injection, and SSR bypass React's protections | Audit all uses of `dangerouslySetInnerHTML` and dynamic `href` |
| "We'll fix vulnerabilities in the next sprint" | Attackers scan for known CVEs within hours of disclosure | Block merges with critical/high CVEs; track security debt with an issue |
| "npm audit shows low severity — we can ignore it" | Low severity in one dep can chain with others for a real exploit | Triage each low with the tree above before accepting |
| "Secrets in .env files are fine because .env is in .gitignore" | One `git add --force` or template commit exposes it permanently | Use a pre-commit hook with gitleaks or similar |
| "We don't need a CSP because we don't inline scripts" | Third-party widgets, analytics, and ads can inject scripts | Add a CSP header even for simple apps — it's cheap insurance |

## Red Flags

- ⛔ `dangerouslySetInnerHTML` appears anywhere in JSX
- ⛔ `localStorage`/`sessionStorage` reads or writes outside try/catch
- ⛔ API keys, tokens, or secrets hard-coded in source files
- ⛔ User-supplied content used in `eval()`, `Function()`, `setTimeout(string)`, or `innerHTML`
- ⛔ `npm audit` reports any CRITICAL severity vulnerabilities
- ⛔ A new dependency added without running `npx cost-of-modules` or license check
- ⛔ `.env` files committed to git (check `git log --diff-filter=A -- .env`)
- ⛔ `Content-Security-Policy` header absent or set to `unsafe-inline` / `unsafe-eval`

## Verification Checklist

- [ ] `npm audit` reports 0 critical/high vulnerabilities
- [ ] No `dangerouslySetInnerHTML` in React code (verified via `grep -r`)
- [ ] All `localStorage` reads/writes wrapped in try/catch with fallback
- [ ] User-supplied values sanitized at input boundary (T1)
- [ ] React output encoding confirmed (no `innerHTML`, no `document.write`)
- [ ] Secrets scan on staged files: zero matches for key/secret/token patterns
- [ ] Content Security Policy header present and restrictive
- [ ] All dependencies checked for known CVEs with triage documented
- [ ] New dependencies reviewed for bundle size, license, and supply chain risk
- [ ] `git log --all` scanned for any committed secrets (if repo has history)
- [ ] No `eval()` or dynamic code execution paths in source
- [ ] If backend exists: authentication/authorization model assessed
- [ ] Sensitive data handling reviewed (PII, tokens — stored? logged? transmitted?)
- [ ] Data flow reviewed for injection vectors (XSS, SQLi, command injection)
- [ ] Quota-exceeded scenario tested (fill localStorage to 5 MB, observe graceful degradation)

## Tools

- `npm audit` — dependency vulnerability scanning
- Code scanning via GitHub CodeQL (configured in repo Security tab)
- Manual code review for OWASP Top 10 risks
- `gitleaks` / `trufflehog` — secret scanning (pre-commit hook)
- `npx cost-of-modules` — bundle size analysis
- `npx socket` — supply chain health check
- `npx depcheck` — unused dependency detection

## Severity definitions

- **Critical** — exploitable remotely, low complexity, high impact
- **High** — exploitable with some precondition
- **Medium** — limited exploitability or impact
- **Low** — defense-in-depth or theoretical
