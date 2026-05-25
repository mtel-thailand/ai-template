# Memory Lint — Operator Runbook

> **Audience:** DevOps, SRE, or any operator running secrets-ban linting.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **Status:** v1 — SR6 secrets-ban lint script

## 1. Quick Reference

| Command | What it does | Exit codes |
|---------|-------------|------------|
| `npm run memory:lint` | Scan all JSONL exports for prohibited content | 0 pass, 1 fail |
| `npm run memory:lint -- --file <path>` | Scan a single JSONL file | 0 pass, 1 fail |
| `npm run memory:lint -- --exit0-when-empty` | Exit 0 when no exports exist (for CI) | 0 pass, 1 fail |

## 2. What It Scans

The lint script checks JSONL export files for prohibited content patterns
defined in the secrets-ban regex set:

| Pattern category | Examples flagged |
|-----------------|------------------|
| API keys / tokens | OpenAI `sk-...`, GitHub `ghp_...`, Slack `xoxb-...`, AWS `AKIA...` |
| Private key headers | `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----` |
| Email addresses | `user@example.com` |
| Government IDs | US SSN pattern (`123-45-6789`) |

## 3. Running the Lint

### 3.1 Scan all exports

```bash
npm run memory:lint
```

This scans all `.jsonl` files under `.opencode/memory/exports/`.

### 3.2 Scan a specific file

```bash
npm run memory:lint -- --file .opencode/memory/exports/memory-export-2026-05-25.jsonl
```

### 3.3 CI mode (empty vault)

```bash
npm run memory:lint -- --exit0-when-empty
```

Use this in CI when the vault may be empty (fresh clone, no exports yet).

## 4. Understanding Results

### 4.1 Clean output

```
✅ memory:lint — no prohibited content found.
```

Exit code: **0**

### 4.2 Violation found

```
✖ .opencode/memory/exports/memory-export-2026-05-25.jsonl:
   line 42: suspected prohibited content: "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx..."

❌ memory:lint — 1 prohibited content match(es) found.
```

Exit code: **1**

### 4.3 Empty vault (with --exit0-when-empty)

```
✅ memory:lint — no JSONL files to scan (empty vault).
```

Exit code: **0**

### 4.4 No exports (without --exit0-when-empty)

```
ℹ️  memory:lint — no JSONL files found under /path/to/.opencode/memory/exports
```

Exit code: **0**

## 5. Resolving Violations

### 5.1 False positives

If the lint flags a non-secret (e.g., a code example containing a test key),
review the finding in context:

```bash
# View the offending line
sed -n '42p' .opencode/memory/exports/memory-export-2026-05-25.jsonl
```

If it is a false positive:

1. **Do not modify the lint script** without Security approval.
2. Redact the entry content at the source (the agent note in the vault).
3. Re-export and re-run lint.

### 5.2 True positives (actual secret found)

1. **Immediately** rotate the leaked secret.
2. Locate the source note in the vault.
3. Edit the note to remove the secret.
4. Re-export the JSONL.
5. Re-run `npm run memory:lint` to confirm.
6. If the secret is in git history, treat as a security incident.

## 6. CI Integration

The lint script is wired into CI via a separate workflow (to be configured
in Issue #28). It runs on every PR that modifies `.opencode/memory/`.

```yaml
# Expected CI integration (added in #28):
memory-lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm install --no-audit --no-fund
    - run: node scripts/memory-lint.mjs --exit0-when-empty
```

## 7. Maintenance

### 7.1 Updating the regex set

TODO(#33): The shared secrets-regex module is owned by ticket #33. Once #33
lands, update the import in `scripts/memory-lint.mjs` to use the shared module
instead of the inlined regex set.

## 8. Related Documents

- [ADR-0003: sqlite-vec memory backend §SR6](../adr/0003-sqlite-vec-memory-backend.md)
- [Memory Export/Import Runbook](./memory-export-import.md)
- [Memory Troubleshooting Runbook](./memory-troubleshooting.md)
- [Memory DB Setup Runbook](./memory-db-setup.md)
- Threat model T-03 (secret/PII leakage) — `docs/security/memory-backend-threat-model.md`
