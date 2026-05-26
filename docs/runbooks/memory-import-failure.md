# Runbook — Memory import failure

> **Audience:** SRE / DevOps. Triggered when `scripts/memory-import.mjs`
> exits non-zero, partially imports, or quarantines records during a
> JSONL load into the SQLite vault.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)

## When this runbook applies

`npm run memory:import` (or its dry-run) finishes in one of these
failure modes:

- **Exit 1** — schema validation failure on one or more records
  (Zod rejection: missing `name`, wrong `tier`, `body > 64 KB`,
  `importance` out of 1–5, malformed timestamps).
- **Exit 1** — unique-constraint violation on `entries_v2.name`
  (`SQLITE_CONSTRAINT_UNIQUE`) with no merge policy configured.
- **Exit 1** — foreign-key / trigger failure on the `entries_fts`
  external-content link (`SQLITE_CONSTRAINT_FOREIGNKEY`).
- **Exit 2** — embedder unavailable; rows inserted without vectors
  (degraded mode per [`memory-embedder-load-failure.md`](./memory-embedder-load-failure.md)).
- Process hard-exits mid-import (SIGKILL / OOM); WAL contains a partial
  transaction.

General procedure for JSONL round-trip is in
[`memory-export-import.md`](./memory-export-import.md); this runbook
covers the failure paths only.

## 1. Detection

### 1.1 Re-run with dry-run to classify

```bash
npm run memory:import -- --dry-run --file .opencode/memory/exports/<file>.jsonl 2>&1 | tee /tmp/import-dry.log
```

Dry-run validates every record without writing. The log identifies
each failing row by `name` and the rejection reason. Categorise into:

| Reason | Bucket |
|---|---|
| Zod field errors (`name`, `tier`, `body` size, `importance` range) | **schema** |
| `UNIQUE constraint failed: entries_v2.name` | **duplicate** |
| `FOREIGN KEY constraint failed` on FTS trigger | **fts-fk** |
| `embedder unavailable` | **embedder** |
| `JSON.parse` failure on a line | **malformed-jsonl** |

### 1.2 Check vault state

If the failing import was not a dry-run, the DB may be in a partial
state. Determine how many records landed:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const per = db.prepare('SELECT tier, COUNT(*) AS c FROM entries_v2 GROUP BY tier').all();
console.log(per);
db.close();
"
```

Compare against the expected counts from the JSONL source
(`wc -l <file>.jsonl`).

## 2. Recovery

### 2.1 schema bucket — fix or quarantine

The importer never silently rewrites payloads (R3). For each rejected
record, choose one:

- **Fix upstream:** Correct the source JSONL (typically by editing the
  agent that emitted the bad record, then re-exporting). Preferred when
  the JSONL is the canonical diff surface.
- **Quarantine:** Move the offending lines to
  `.opencode/memory/quarantine/import-<date>.jsonl` and re-run import
  on the cleaned file. File a follow-up issue tagging the agent owner.

```bash
mkdir -p .opencode/memory/quarantine
# Extract rejected line numbers from the dry-run log into LINES, then:
awk "NR==FNR{skip[\$1]=1;next} !(FNR in skip)" LINES .opencode/memory/exports/<file>.jsonl > /tmp/clean.jsonl
awk "NR==FNR{skip[\$1]=1;next} (FNR in skip)"  LINES .opencode/memory/exports/<file>.jsonl > .opencode/memory/quarantine/import-$(date +%Y-%m-%d).jsonl
npm run memory:import -- --file /tmp/clean.jsonl
```

### 2.2 duplicate bucket — conflict review

ADR-0003 §Migration plan defines the policy: **most-recent `updated`
wins; losers archived to `.opencode/memory/conflicts/<name>.<date>.md`**.
The importer uses `INSERT … ON CONFLICT(name) DO UPDATE` for the
canonical row and delete-then-insert (wrapped in a single transaction)
for `entries_vec`.

If the importer is **not** configured for upsert (e.g. an explicit
`--no-upsert` flag was passed), review each conflict manually:

```bash
ls .opencode/memory/conflicts/
# For each conflict, decide: keep DB row, replace from JSONL, or merge by hand.
# Then re-run import with the resolved JSONL.
```

Do not blanket-resolve conflicts — a duplicate name can indicate two
agents writing under the same key, which is its own bug.

### 2.3 fts-fk bucket — rebuild FTS

FTS trigger failures usually mean `entries_fts` is out of sync with
`entries_v2`. Rebuild from canonical content (no data loss):

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.exec(\"INSERT INTO entries_fts(entries_fts) VALUES('rebuild')\");
db.close();
console.log('FTS5 rebuilt');
"
npm run memory:import -- --file <file>.jsonl
```

If rebuild itself fails, treat as DB corruption and follow
[`memory-db-corruption.md`](./memory-db-corruption.md).

### 2.4 embedder bucket — fix embedder, then reindex

Rows inserted without vectors are queryable lexically but not
semantically. Restore the embedder per
[`memory-embedder-load-failure.md`](./memory-embedder-load-failure.md),
then:

```bash
npm run memory:reindex
```

No re-import is needed — reindex backfills the missing `entries_vec`
rows from `entries_v2.body`.

### 2.5 malformed-jsonl bucket

Every line must be valid JSON. Locate the offending line:

```bash
awk 'NR==<line>' .opencode/memory/exports/<file>.jsonl | node -e \
  "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{JSON.parse(d);console.log('OK')}catch(e){console.error(e.message)}})"
```

Fix or quarantine per §2.1.

### 2.6 SIGKILL / mid-import abort

1. Verify WAL is consistent:
   ```bash
   node -e "const db=new(require('better-sqlite3'))('.opencode/memory/memory.db');db.pragma('wal_checkpoint(TRUNCATE)');db.close()"
   ```
   If checkpoint hangs, follow [`memory-wal-checkpoint-stuck.md`](./memory-wal-checkpoint-stuck.md).
2. Diff vault counts against the JSONL source (§1.2).
3. Re-run the import. Because `put()` is idempotent on `name`
   (ADR-0003 §Migration plan), already-imported rows upsert without
   side-effects.

## 3. Rollback

If any of the above leaves the vault in a worse state than before the
import, revert to the pre-import snapshot. Full procedure in
[`memory-backup-restore.md`](./memory-backup-restore.md).

```bash
# Ensure the pre-import backup exists. If it does not, STOP — create
# one from quarantine if available, then re-evaluate.
cp .opencode/memory/backups/memory-<pre-import-date>.db .opencode/memory/memory.db
rm -f .opencode/memory/memory.db-wal .opencode/memory/memory.db-shm
node -e "const db=new(require('better-sqlite3'))('.opencode/memory/memory.db',{readonly:true});console.log(db.prepare('PRAGMA integrity_check').get());db.close()"
npm run memory:gc:validate
```

**Always snapshot the DB immediately before any non-dry-run import.**
The importer itself does not take an automatic backup; ADR-0003
§Migration plan rollback assumes the operator has one.

## 4. Post-recovery

- `npm run memory:gc:validate` — exit 0.
- `npm run memory:lint` against the regenerated export — exit 0 (SR6).
- Open a follow-up issue for each quarantined record; tag the agent
  that emitted it.

## References

- [ADR-0003 §Migration plan — idempotent upsert, conflict archive, rollback](../adr/0003-sqlite-vec-memory-backend.md)
- [`memory-export-import.md`](./memory-export-import.md) — baseline import/export procedure
- [`memory-backup-restore.md`](./memory-backup-restore.md) — pre-import snapshot rollback
- [`memory-db-corruption.md`](./memory-db-corruption.md) — if rebuild itself fails
- [`memory-embedder-load-failure.md`](./memory-embedder-load-failure.md) — embedder bucket
- [`memory-wal-checkpoint-stuck.md`](./memory-wal-checkpoint-stuck.md) — mid-import abort cleanup
- [`memory-lint.md`](./memory-lint.md) — SR6 secrets ban check
