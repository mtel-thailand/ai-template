# Runbook — Memory DB corruption

> **Audience:** SRE / DevOps. Triggered when the SQLite vault at
> `.opencode/memory/memory.db` fails an integrity check or returns
> malformed-page errors.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)

## When this runbook applies

One or more of:

- `PRAGMA integrity_check` returns anything other than `ok`.
- `better-sqlite3` throws `SqliteError: database disk image is malformed`
  (SQLITE_CORRUPT) on read or write.
- `memory:gc:validate` aborts with a non-zero exit and the failure
  trace points at `entries_v2`, `entries_vec`, or `entries_fts`.
- `search()` returns zero hits for queries that previously worked, and
  `get(name)` for known names returns null.
- WAL replay loops on agent start (process exits 1 immediately after
  opening the DB).

ADR-0003 §Reliability target: **detect via `PRAGMA integrity_check`;
RTO < 5 min from JSONL export**.

## 1. Detection

### 1.1 Run an integrity check

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const rows = db.prepare('PRAGMA integrity_check').all();
for (const r of rows) console.log(r.integrity_check);
db.close();
"
```

A healthy DB prints exactly one row: `ok`. Anything else (e.g. `wrong
# of entries in index`, `row N missing from index entries_fts`,
`database disk image is malformed`) is corruption.

### 1.2 Confirm scope

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
console.log('entries_v2 rows:', db.prepare('SELECT COUNT(*) AS c FROM entries_v2').get().c);
try { console.log('entries_vec rows:', db.prepare('SELECT COUNT(*) AS c FROM entries_vec').get().c); }
catch (e) { console.log('entries_vec UNREADABLE:', e.message); }
try { console.log('entries_fts rows:', db.prepare(\"SELECT COUNT(*) AS c FROM entries_fts\").get().c); }
catch (e) { console.log('entries_fts UNREADABLE:', e.message); }
db.close();
"
```

A divergence between `entries_v2` and either virtual table tells you
which index is corrupt. If the canonical table is intact, recovery is
cheaper (reindex). If `entries_v2` itself is unreadable, you are in
full-restore territory.

### 1.3 Preserve evidence before any destructive step

```bash
mkdir -p .opencode/memory/quarantine
cp .opencode/memory/memory.db*  .opencode/memory/quarantine/
```

Keep `quarantine/` until recovery is verified — do not delete it for
at least one full GC cycle.

## 2. Recovery

### 2.1 Path A — only `entries_vec` or `entries_fts` is corrupt

The canonical row store is `entries_v2`. The two virtual tables are
derived and can be rebuilt without data loss.

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
// Rebuild FTS5 from canonical content
db.exec(\"INSERT INTO entries_fts(entries_fts) VALUES('rebuild')\");
console.log('FTS5 rebuilt');
db.close();
"
# Re-embed all rows; this repopulates entries_vec
npm run memory:reindex
```

Re-run §1.1 to confirm `ok`. If still failing, fall through to Path B.

### 2.2 Path B — `entries_v2` is corrupt: rebuild from JSONL

The JSONL export is the canonical diff surface (committed to git per
ADR-0003 §Configuration schema) and is the cheapest restore source. Per
SR2, the export excludes embeddings; the embedder recomputes them at
import.

Full procedure is in [`memory-export-import.md`](./memory-export-import.md).
Condensed:

```bash
# 1. Tear down the corrupted DB (after §1.3 quarantine)
rm -f .opencode/memory/memory.db .opencode/memory/memory.db-wal .opencode/memory/memory.db-shm

# 2. Initialise a fresh DB (PRAGMAs + schema)
#    See memory-db-setup.md for the canonical init script.

# 3. Import the most recent JSONL export
npm run memory:import -- --file .opencode/memory/exports/latest.jsonl

# 4. Verify
node -e "const db=new(require('better-sqlite3'))('.opencode/memory/memory.db',{readonly:true});console.log(db.prepare('PRAGMA integrity_check').get());db.close();"
npm run memory:gc:validate
```

The import recomputes embeddings; expect 200-entry restore to complete
in < 10 s per ADR-0003 §Migration plan.

### 2.3 Path C — JSONL export is also unusable

Fall through to rollback (§3). Do not attempt partial extraction with
`sqlite3 .dump` against a corrupt file — the output is untrustworthy.

## 3. Rollback

Restore from the most recent backup. Full procedure in
[`memory-backup-restore.md`](./memory-backup-restore.md) §3. Condensed:

```bash
# Stop any process holding the DB open
cp .opencode/memory/backups/memory-<YYYY-MM-DD>.db .opencode/memory/memory.db
rm -f .opencode/memory/memory.db-wal .opencode/memory/memory.db-shm
node -e "const db=new(require('better-sqlite3'))('.opencode/memory/memory.db',{readonly:true});console.log(db.prepare('PRAGMA integrity_check').get());db.close();"
```

If the most recent backup is also corrupt, walk back one daily backup
at a time until integrity_check returns `ok`. Note the data loss
window in the post-mortem.

## 4. Post-recovery

- Run `npm run memory:gc:validate`. Must exit 0.
- Run `npm run memory:lint` against the freshly regenerated JSONL
  export. Must exit 0 (SR6).
- Open an incident issue with `severity-high` label and the corruption
  symptoms from §1. Include `.opencode/memory/quarantine/` SHA-256s.
- Only after a clean GC cycle and a post-mortem entry, remove
  `.opencode/memory/quarantine/`.

## References

- [ADR-0003 §Reliability — DB corruption (RTO < 5 min from JSONL export)](../adr/0003-sqlite-vec-memory-backend.md)
- [Threat model T-08 (write contention) / T-09 (vec0 orphans)](../security/memory-backend-threat-model.md)
- [`memory-export-import.md`](./memory-export-import.md) — JSONL round-trip procedure
- [`memory-backup-restore.md`](./memory-backup-restore.md) — backup-based rollback
- [`memory-db-setup.md`](./memory-db-setup.md) — fresh DB init + PRAGMAs
- [`memory-troubleshooting.md`](./memory-troubleshooting.md) — broader symptom triage
- SQLite integrity_check docs: https://www.sqlite.org/pragma.html#pragma_integrity_check
