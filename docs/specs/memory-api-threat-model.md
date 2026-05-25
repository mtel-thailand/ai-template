# Threat Model & Reliability Spec: Memory API (Issue #9)

**Owner:** SRE (Security + Reliability + Performance)  
**Status:** Design Gate — Ready for Tech Lead + QA review  
**Date:** 2026-05-25  

---

## Overview

This document specifies threat vectors, security controls, and reliability requirements for the **memory-api** service — a localhost-only, file-based LLM memory system for agents. The vault stores sensitive architectural context, incident data, and agent decision logs. Compromise of the vault could leak architectural decisions, expose incident details, or corrupt agent memory, breaking multi-day projects.

This spec gates implementation. Tech Lead (architecture/framework), QA (test plan), and this SRE assessment must all sign off before code begins.

---

## SECURITY

### 1. Secret Regex Catalogue with Test Cases

The secret scanner must reject **any write** containing patterns matching the following. Each pattern includes a positive case (must reject) and negative case (must allow).

#### 1.1 GitHub Personal Access Tokens

```regex
github_pat_[A-Za-z0-9_]{82}
ghp_[A-Za-z0-9]{36}
gho_[A-Za-z0-9]{36}
ghs_[A-Za-z0-9]{36}
ghu_[A-Za-z0-9]{36}
ghr_[A-Za-z0-9]{36}
```

| Type | Pattern | Positive (reject) | Negative (allow) |
|------|---------|---|---|
| github_pat | `github_pat_[A-Za-z0-9_]{82}` | `token: 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` | `github_pat (82 chars)` |
| ghp | `ghp_[A-Za-z0-9]{36}` | `api_key: ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S` | `ghp_tutorial` |
| gho | `gho_[A-Za-z0-9]{36}` | `secret: gho_X9Y8Z7W6V5U4T3S2R1Q0P9O8N7M6L5K4J3I2` | `gho_docs` |
| ghs | `ghs_[A-Za-z0-9]{36}` | `token: ghs_16C7e42F292c6912E7710c838347Ae178B4a` | `ghs_` (incomplete) |
| ghu | `ghu_[A-Za-z0-9]{36}` | `pat: ghu_7dR3h2kL8mN9pQ0rS1tU2vW3xY4zAbCdEfGhI` | `ghu` |
| ghr | `ghr_[A-Za-z0-9]{36}` | `refresh: ghr_K9L8M7N6O5P4Q3R2S1T0U9V8W7X6Y5Z4AbCdE` | `ghr_token_example` |

#### 1.2 AWS Access Keys

```regex
AKIA[0-9A-Z]{16}
ASIA[0-9A-Z]{16}
aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}
```

| Type | Pattern | Positive (reject) | Negative (allow) |
|------|---------|---|---|
| IAM Access Key | `AKIA[0-9A-Z]{16}` | `access_key: AKIAIOSFODNN7EXAMPLE` | `AKIA` (incomplete) |
| Temporary Session | `ASIA[0-9A-Z]{16}` | `session_key: ASIAIOSFODNN7EXAMPLE` | `asia_region` |
| Secret Access Key | `aws_secret_access_key\s*[:=]` | `aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/K7MDENG+bPxRfiCYEXAMPLEKEY` | `aws_secret_access_key (no value)` |

#### 1.3 PEM Private Keys

```regex
-----BEGIN (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----
-----END (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----
```

| Type | Pattern | Positive (reject) | Negative (allow) |
|------|---------|---|---|
| RSA Private | `-----BEGIN RSA PRIVATE KEY-----` | Body contains marker | `-----BEGIN PUBLIC KEY-----` |
| EC Private | `-----BEGIN EC PRIVATE KEY-----` | Body contains marker | `-----BEGIN CERTIFICATE-----` |
| OpenSSH Private | `-----BEGIN OPENSSH PRIVATE KEY-----` | Body contains marker | `-----BEGIN PRIVATE KEY-----` |
| Generic | `-----BEGIN.*PRIVATE KEY-----` | Body contains marker | `PRIVATE KEY (documentation)` |

#### 1.4 Generic Credential Patterns

```regex
(?i)(password|passwd|pwd)\s*[:=]\s*[^\s]+
(?i)(api[-_]?key)\s*[:=]\s*[^\s]+
(?i)(secret|token)\s*[:=]\s*[^\s]+
(?i)(authorization|bearer)\s*[:=]\s*Bearer\s+[^\s]+
```

| Type | Pattern | Positive (reject) | Negative (allow) |
|------|---------|---|---|
| Password | `(?i)password\s*[:=]` | `password: SuperSecret123` | `password (field name only)` |
| API Key | `(?i)api[_-]?key\s*[:=]` | `api_key: sk-12345678abcdefgh` | `api_key_rotation` |
| Secret | `(?i)secret\s*[:=]` | `secret: my-secret-value` | `secret (docs)` |
| Token | `(?i)token\s*[:=]` | `token: eyJhbGciOiJIUzI1...` | `token bucket` |
| Bearer | `(?i)authorization.*Bearer` | `Authorization: Bearer eyJhbGc...` | `Bearer token (docs)` |

#### 1.5 Database Connection Strings with Credentials

```regex
(postgres|postgresql|mysql|mongodb|redis)://[^:@]+:[^@]+@[^\s]+
```

| Type | Positive (reject) | Negative (allow) |
|---|---|---|
| PostgreSQL | `postgres://admin:SecurePass123@prod-db.example.com:5432/mydb` | `postgres://host` (no creds) |
| MySQL | `mysql://root:MyPassword@localhost:3306/testdb` | `mysql://localhost/db` |
| MongoDB | `mongodb://admin:p@ssw0rd@mongo.example.com:27017/admin` | `mongodb://localhost/db` |
| Redis | `redis://default:RedisSecret@cache.example.com:6379` | `redis://localhost:6379` |

#### 1.6 Passport / National ID Heuristics (Conservative)

```regex
\b\d{9}\b
```

**⚠️ False-Positive Risk**: Use as **flag pattern** only, not auto-reject.

| Type | Positive (flag) | Negative (allow) |
|---|---|---|
| ID Number | `passport_id: 123456789` | `zip_code: 123456789` |

#### 1.7 Bank Account / IBAN Patterns

```regex
(IBAN|iban)\s*[:=]\s*[A-Z]{2}[0-9]{2}[A-Za-z0-9]{1,30}
(account|acct)\s*[:=]\s*\d{8,17}
```

| Type | Positive (reject) | Negative (allow) |
|---|---|---|
| IBAN | `iban: DE89370400440532013000` | `iban_format` |
| Account | `account: 12345678901234567` | `account_id: user_123` |

---

### 2. Path Traversal Attack Cases & Mitigations

**Expected Response**: 400 Bad Request:
```json
{
  "error": "unsafe_path",
  "message": "Path traversal detected",
  "details": {"provided_path": "../../etc/passwd", "reason": "contains .. segments"}
}
```

| Attack Case | Input | Reason Rejected |
|---|---|---|
| Parent traversal | `../../etc/passwd` | Contains `..` |
| Vault escape | `vault/../.env` | Contains `..` |
| Absolute path | `/etc/passwd` | Starts with `/` |
| URL-encoded | `..%2F..%2Fetc%2Fpasswd` | Decode then check for `..` |
| Double-encoded | `..%252F..%252Fetc%252Fpasswd` | Decode twice then check |
| Null byte | `vault/safe.md\x00../../../etc/passwd` | Truncate at null byte |
| Symlink escape | `vault/link -> ../../.git` | Check symlink target within vault |
| Mixed separators | `vault\..\..\etc\passwd` | Normalize separators then check |

**Implementation**: Resolve to absolute path, assert it starts with vault root.

---

### 3. Write Protection Cases (Blacklist)

**Expected Response**: 400 Bad Request with reason.

| Protected Path | Reason |
|---|---|
| `.git/*` | VCS corruption, code history leak |
| `.env`, `.env.local`, `.env.production` | Environment variables, secrets |
| `node_modules/*` | Dependency poisoning |
| `.opencode/*` | Agent config, security-critical |
| `*.pem`, `*.key`, `*.pfx` | Private key artifacts |

---

### 4. Sensitivity Classification & Redaction

**Field**: `sensitivity: public | internal | confidential | secret` in frontmatter.

**Behavior**:
- `public`: Include in all responses
- `internal`: Include; redact in cross-project queries
- `confidential`: Redact from list/search by default; require `?include_confidential=true`
- `secret`: Redact from all queries (no auth in MVP, so all queries are treated as unauthenticated)

**Test Cases**:
- Write `sensitivity: secret` → succeeds, logged
- Query without flag → `secret` entries omitted from results
- `GET /memory/{path}` with `secret` sensitivity → returns `{path, sensitivity: secret, [content_redacted]}`

---

### 5. Vault Read-Only Mount Scenario

**Expected Response**: 507 Insufficient Storage or 403 Forbidden:
```json
{
  "error": "write_failed",
  "message": "Vault is read-only",
  "details": {"reason": "Permission denied"}
}
```

**Test Case**: Mount vault read-only, attempt write, verify 403/507 + no file created.

---

### 6. Audit Logging for Destructive Operations

Every `archive` or `forget` operation appends to `vault/review/memory-cleanup-log.md`.

**Log Format** (Markdown table):

```markdown
| Timestamp | Operation | File Path | Status | Reason | Requestor |
|-----------|-----------|-----------|--------|--------|-----------|
| 2026-05-25T14:32:10Z | archive | vault/short-term/sprint-context-2026-04.md | success | expired | agent-ai |
| 2026-05-25T14:33:45Z | forget | vault/long-term/incident-2026-03-15.md | success | manual cleanup | - |
```

**Fields**: timestamp (ISO 8601), operation, path, status, reason, requestor.

**Test Case**: Call `POST /memory/forget`, verify entry added to log with correct timestamp, path.

---

### 7. Denial-of-Service (DoS) Surface

| Attack Vector | Limit | Status |
|---|---|---|
| Request body size | 1 MB | **MVP: Required** |
| Search query length | 500 chars | **MVP: Required** |
| List pagination | 100 items/page, default 20 | **MVP: Required** |
| Concurrent writes to same file | Single writer via atomic rename | **MVP: Required** |
| Rate limiting | None (localhost only) | **Deferred to v1.1** |

---

## RELIABILITY

### 1. Failure Modes & Error Handling

| Failure Mode | Trigger | Expected Response | Data Corruption? |
|---|---|---|---|
| Disk full | `write` when `ENOSPC` | 507 Insufficient Storage | ✅ No (atomic rename) |
| Permission denied | `write` without permissions | 403 Forbidden | ✅ No |
| Malformed frontmatter | Parse error | 400 Bad Request | ✅ No (rejected before write) |
| Concurrent writes | Two clients write same file | Second gets 409 Conflict | ✅ No (atomic rename) |
| File not found | `read` non-existent | 404 Not Found | N/A (read-only) |

**Pattern**: Write-then-rename for atomicity.

---

### 2. Idempotency

| Operation | Behavior |
|---|---|
| `POST /memory/write` to new path | 201 Created |
| `POST /memory/write` to existing path (no `overwrite: true`) | 409 Conflict |
| `POST /memory/write` with `overwrite: true` | 200 OK (replaces) |
| `POST /memory/append` to existing path | 200 OK (appends) |
| `POST /memory/append` to non-existent path | 404 Not Found |

---

### 3. Atomicity

Write-then-rename pattern:
1. Write to temp file `${path}.tmp-${timestamp}`
2. On success, `fs.rename()` (atomic on most filesystems)
3. On failure, delete temp file

**Test Cases**:
- Kill process during write → verify `.tmp-` cleanup
- Disk full during write → verify no `.tmp-` remains

---

### 4. Observability

#### 4.1 Health Check Endpoint

**Endpoint**: `GET /healthz`

**Response** (200 OK):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "vault_path": "/vault",
  "vault_accessible": true,
  "features": {
    "secret_scanning": true,
    "redis_enabled": false,
    "vector_search_enabled": false
  },
  "timestamp": "2026-05-25T14:32:10Z"
}
```

#### 4.2 Structured Request Logging

Every request logs:
```json
{
  "timestamp": "2026-05-25T14:32:10.123Z",
  "method": "POST",
  "path": "/memory/write",
  "status_code": 201,
  "duration_ms": 45,
  "error": null
}
```

**Redaction**: Do NOT log request/response bodies. No PII, secrets, or user data in logs.

#### 4.3 Error Logging

```json
{
  "timestamp": "...",
  "level": "error",
  "path": "/memory/write",
  "error": "secret_detected",
  "details": {"patterns_found": 2}
}
```

---

### 5. Performance Budget

**Target**: p95 ≤ 100ms for read/list/search on 1000-file vault.

| Operation | Target p95 | Target p99 |
|---|---|---|
| `GET /memory/{path}` | ≤ 50ms | ≤ 100ms |
| `GET /memory?scope=long-term` | ≤ 80ms | ≤ 150ms |
| `POST /memory/search` | ≤ 100ms | ≤ 200ms |
| `POST /memory/write` | ≤ 200ms | ≤ 400ms |
| `POST /memory/append` | ≤ 150ms | ≤ 300ms |

**Profiling Approach**: Load test with k6; measure CPU, memory, I/O; identify bottleneck.

---

## OUT OF MVP SCOPE

| Feature | Why Deferred |
|---|---|
| Authentication | Localhost-only; no secret PATs at risk |
| Rate Limiting | Single developer + agents; no DDoS threat |
| TLS Termination | Localhost (HTTP); HTTPS added in production |
| Multi-tenant Isolation | Single vault per repo template |
| Real-time File-Watch Invalidation | File-based; agents re-read on query |
| Semantic Search | Requires embeddings (OpenAI/Ollama) |
| Conflict Resolution | No concurrent edits expected |

---

## Sign-Off Checklist

- [ ] Tech Lead reviews architecture (framework, module layout)
- [ ] QA reviews test plan (contract, secret scanner, path traversal)
- [ ] SRE (this document) confirms threat model
- [ ] All three sign off before implementation begins
