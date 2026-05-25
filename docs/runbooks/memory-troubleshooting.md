# Memory Troubleshooting — Operator Runbook

> **Audience:** DevOps, SRE, or any operator diagnosing vault issues.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)
> **Status:** v1 — SQLite + sqlite-vec backend error diagnosis

## 1. Quick Reference

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| `SQLITE_BUSY` | Write contention | Retry; verify `busy_timeout=5000`; reduce concurrent writers |
| `SQLITE_CORRUPT` | Database corruption | Restore from backup; run `PRAGMA integrity_check` |
| `SQLITE_READONLY` | File permissions | `chmod` the `.db` file; verify user/group |
| `SQLITE_FULL` | Disk full | Free disk space; compact DB with VACUUM |
| `SQLITE_NOTFOUND` | Missing entry | Verify `name` exists; check tier filter |
| Embedder fails | Missing ONNX weights | Verify `embeddings.lock`; re-install model |
| Lint finds secrets | Accidental secret in export | Remove from source; re-export; see §4.4 |
| CI fails on `db-guard` | `.db` file staged | `git rm --cached`; update `.gitignore`; see §4.2 |

## 2. Common Errors

### 2.1 SQLITE_BUSY — Write contention

**Error:** `Error: SQLITE_BUSY: database is locked`

The database is contended between multiple processes or threads.

**Causes:**
- Multiple agent sessions running simultaneously.
- A long-running query (e.g., FTS5 match with greedy grammar).
- A `memory:gc` run overlapping with an agent write.

**Resolution:**

```bash
# 1. Check for concurrent processes
lsof .opencode/memory/memory.db

# 2. If no process is found but WAL is stale, checkpoint and reset
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
console.log('WAL checkpointed. Lock released.');
"
```

**Prevention:**
- `busy_timeout=5000` (5 seconds) is set by default — this should handle brief
  contention. If contention persists, consider an application-level retry with
  jitter (see `MemoryBackendBusyError` in `backend.ts`).
- Avoid running `memory:gc` while agents are active.

### 2.2 FTS5 query timeout

**Error:** `FtsTimeoutError: FTS5 query timed out after 500ms`

The FTS5 query exceeded the per-query timeout.

**Causes:**
- Complex advanced-mode query with many operators.
- Very large corpus (thousands of entries).

**Resolution:**
- Simplify the query.
- Increase `timeoutMs` in the `SearchOpts` (up to 2000 ms).

### 2.3 Embedder fails to load

**Error:** `EmbedderIntegrityError` or `Error: Failed to load embedding model "Xenova/all-MiniLM-L6-v2"`

**Causes:**
- ONNX weights not downloaded (first use).
- `embeddings.lock` SHA-256 mismatch (weights tampered or updated).
- `@huggingface/transformers` not installed.

**Resolution:**
```bash
# 1. Check HF hub connectivity
curl -I https://huggingface.co/Xenova/all-MiniLM-L6-v2

# 2. Verify the lock file
cat .opencode/memory/embeddings.lock

# 3. Re-install the transformers package
npm install @huggingface/transformers

# 4. If lock file is out of date, update it
# See SR3 runbook for lock file management
```

### 2.4 sqlite-vec extension fails

**Error:** `Error: Cannot find module 'sqlite-vec'` or load error

**Causes:**
- `sqlite-vec` npm package not installed.
- Platform binary mismatch (e.g., arm64 vs x64).
- `sqlite-vec.lock` SHA-256 mismatch (SR4).

**Resolution:**
```bash
# 1. Install sqlite-vec
npm install sqlite-vec

# 2. Verify the lock file matches your platform
node -e "
const { detectPlatform } = require('./src/memory/integrity-verifier');
console.log('Platform:', detectPlatform());
"
# Compare with entries in .opencode/memory/sqlite-vec.lock

# 3. If platform is missing from the lock file, add it
# sha256sum path/to/vec0.{ext} >> .opencode/memory/sqlite-vec.lock
```

## 3. Database Health Checks

### 3.1 Run integrity check

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const result = db.prepare('PRAGMA integrity_check').all();
console.log(result.map(r => r.integrity_check || r.ok || r).join('\\n'));
db.close();
"
```

Expected output for a healthy database: `ok`

### 3.2 Check for orphan entries (T-09)

The `vec0` virtual table lacks UPDATE support. Delete-then-insert may leave
orphan entries if the process crashes between operations.

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
// Find vec0 entries with no matching entries_v2 row
const orphans = db.prepare(\`
  SELECT v.name FROM entries_vec v
  LEFT JOIN entries_v2 e ON v.name = e.name
  WHERE e.name IS NULL
\`).all();
if (orphans.length > 0) {
  console.log('Orphan vec0 entries found:', orphans.map(o => o.name));
  // Clean up
  const del = db.prepare('DELETE FROM entries_vec WHERE name = ?');
  for (const o of orphans) del.run(o.name);
  console.log('Cleaned up', orphans.length, 'orphans');
} else {
  console.log('No orphan entries found.');
}
db.close();
"
```

### 3.3 Check FTS5 sync

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const entryCount = db.prepare('SELECT COUNT(*) as c FROM entries_v2').get().c;
const ftsCount = db.prepare('SELECT COUNT(*) as c FROM entries_fts').get().c;
console.log('entries_v2:', entryCount, 'entries_fts:', ftsCount);
if (entryCount !== ftsCount) {
  console.warn('WARNING: FTS5 is out of sync with entries_v2!');
  console.warn('Run memory:reindex to rebuild FTS index.');
}
db.close();
"
```

## 4. CI / Pipeline Issues

### 4.1 CI guard fails (SR1)

**Error:** `SR1 check FAILED — DB files found in git index`

**Resolution:**
```bash
# Remove the staged DB files from the index
git rm --cached .opencode/memory/memory.db

# If files exist in the working tree but shouldn't be committed
echo "*.db" >> .gitignore
echo "*.db-wal" >> .gitignore
echo "*.db-shm" >> .gitignore
echo "*.db-journal" >> .gitignore
```

### 4.2 memory:lint finds prohibited content

**Resolution:**
1. Identify the offending line(s) from CI output.
2. Locate the source entry in the vault.
3. Remove the secret/PII from the entry body.
4. Re-export the JSONL.
5. Re-run `npm run memory:lint` to confirm.

## 5. Related Documents

- [Memory DB Setup Runbook](./memory-db-setup.md)
- [Memory Backup/Restore Runbook](./memory-backup-restore.md)
- [Memory Lint Runbook](./memory-lint.md)
- [Memory Performance Runbook](./memory-performance.md)
- Threat model — `docs/security/memory-backend-threat-model.md`
