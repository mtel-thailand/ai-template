# Runbook — Memory vault size threshold

> **Audience:** SRE / DevOps. Triggered when the SQLite vault exceeds
> the ADR-0003 §NFR footprint bands.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)

## When this runbook applies

ADR-0003 §NFR appendix → Footprint defines per-tier-load bands. The
green / yellow / red bands depend on entry count:

| Entry count | Green DB size | Yellow | Red |
|---|---|---|---|
| 200 (default baseline) | < 5 MB | 5–20 MB | > 20 MB |
| 1 000 | < 10 MB | 10–50 MB | > 50 MB |
| 10 000 (stress ceiling) | < 50 MB | 50–200 MB | > 200 MB |
| Hard ceiling — any count | n/a | n/a | **> 500 MB → block writes, VACUUM, escalate** |

Trigger this runbook when:

- Daily size monitor reports the DB file (or `du -sh` of the vault
  directory) has crossed into the yellow or red band for the current
  entry-count load.
- Per-tier counts cross the next-band boundary (e.g. `mid` tier goes
  from < 1 000 to > 1 000 entries).
- Any hit of the 500 MB hard ceiling — treat as an incident.

## 1. Detection

### 1.1 Measure size and count

```bash
# File-system size including WAL/SHM sidecars
du -sh .opencode/memory/memory.db*

# Logical row count per tier
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const per = db.prepare('SELECT tier, COUNT(*) AS c FROM entries_v2 GROUP BY tier').all();
const total = db.prepare('SELECT COUNT(*) AS c FROM entries_v2').get().c;
console.log('per-tier:', per, 'total:', total);
db.close();
"
```

Map the total against the table above to confirm the band.

### 1.2 Identify the dominant tier

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
// Bytes per tier, computed from canonical body length
const rows = db.prepare(\"SELECT tier, SUM(LENGTH(body)) AS bytes, COUNT(*) AS c FROM entries_v2 GROUP BY tier ORDER BY bytes DESC\").all();
console.log(rows);
db.close();
"
```

The dominant tier drives the eviction strategy in §2.

### 1.3 Check for evictable content

```bash
# mid tier: TTL-expired entries (>30d since lastAccessed, per spec)
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const cutoff = new Date(Date.now() - 30*24*3600*1000).toISOString();
const stale = db.prepare(\"SELECT COUNT(*) AS c FROM entries_v2 WHERE tier = 'mid' AND last_accessed < ?\").get(cutoff).c;
console.log('mid tier TTL-expired:', stale);
db.close();
"
```

If `stale` is large, GC alone will recover the band. If small, the
growth is in `long/` or `frequent/` and you are looking at archive,
not eviction.

## 2. Recovery

Apply in order. Each step is non-destructive; verify with §1.1 before
proceeding to the next.

### 2.1 Step 1 — run GC to prune `mid/` TTL-expired entries

```bash
npm run memory:gc
```

ADR-0003 GC semantics: `mid` entries past their 30-day sliding TTL are
deleted via `backend.delete()`, which cascades to `entries_vec` and
`entries_fts` via triggers. Re-measure (§1.1). For most vaults this
alone returns to green.

### 2.2 Step 2 — VACUUM to reclaim freed pages

Deletes free pages but do not shrink the file. Run VACUUM after a
large GC to reclaim disk:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.pragma('wal_checkpoint(TRUNCATE)');
db.exec('VACUUM');
db.close();
"
```

Full VACUUM / auto-vacuum details in
[`memory-performance.md`](./memory-performance.md) §2. VACUUM requires
exclusive access — stop agents first.

### 2.3 Step 3 — archive `long/` entries to cold storage

If `long/` is the dominant tier and the entries are genuinely cold
(low `accessCount`, old `lastAccessed`), archive them out-of-vault:

```bash
# 1. Export the candidate cold rows to a separate JSONL
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const rows = db.prepare(\"SELECT * FROM entries_v2 WHERE tier='long' AND access_count = 0 AND last_accessed < date('now','-180 days')\").all();
require('fs').writeFileSync('.opencode/memory/exports/cold-' + new Date().toISOString().slice(0,10) + '.jsonl',
  rows.map(r => { delete r.id; delete r.embedding; delete r.embed_model_id; delete r.embed_model_ver; return JSON.stringify(r); }).join('\n') + '\n');
db.close();
"
# 2. Move the cold export to your cold-storage location (out of scope here).
# 3. Delete the cold rows from the live vault, then re-run §2.1 + §2.2.
```

The `cold-*.jsonl` follows the same SR2 schema (no embeddings). Run
`npm run memory:lint -- --file .opencode/memory/exports/cold-<date>.jsonl`
before archiving.

### 2.4 Hard-ceiling response (> 500 MB)

If the vault has crossed 500 MB:

1. **Block writes.** Set `memory.backends.<tier>.readOnly = true` in
   `opencode.json` for all SQLite-backed tiers, or stop agent
   processes. Do not allow further growth while diagnosing.
2. **Snapshot.** `sqlite3 memory.db ".backup backups/memory-ceiling-<date>.db"`.
3. **Diagnose.** Run §1.1–1.3 and identify the dominant tier and
   whether growth is body bloat (large entries) or count bloat
   (many entries). Body bloat that violates the 64 KB cap is a bug
   in the writing agent — file a `severity-high` issue.
4. **VACUUM + archive.** §2.2 + §2.3 above, then re-measure.
5. **Escalate.** Open an incident issue tagging Tech Lead and SRE.
   Include before/after sizes, dominant tier, and the JSONL export
   referenced for archival.

## 3. Rollback

**Size pruning is one-way.** GC eviction and `long/` archival cannot
be reversed from the live vault — the deleted rows are gone.

Mitigation: **always snapshot before §2.1**.

```bash
mkdir -p .opencode/memory/backups
sqlite3 .opencode/memory/memory.db ".backup .opencode/memory/backups/memory-pre-prune-$(date +%Y-%m-%d).db"
```

If a prune turns out to have been incorrect (e.g. archived rows were
still needed), restore the pre-prune snapshot per
[`memory-backup-restore.md`](./memory-backup-restore.md) §3, then
re-import the archived JSONL via
[`memory-export-import.md`](./memory-export-import.md) §3.

Do not attempt selective row restore by hand — the embeddings would
be stale and FTS/vec indices would diverge from canonical content.

## 4. Post-recovery

- Re-measure (§1.1) and confirm the band has returned to green or
  yellow.
- Update the size monitor's baseline if the new normal has shifted.
- File a follow-up if archival became necessary at < 1 k entries —
  that points at an upstream growth bug, not a vault-size issue.

## References

- [ADR-0003 §NFR appendix — Footprint table (green/yellow/red bands, 500 MB ceiling)](../adr/0003-sqlite-vec-memory-backend.md)
- [ADR-0003 §`memory:gc` semantics](../adr/0003-sqlite-vec-memory-backend.md)
- [`memory-performance.md`](./memory-performance.md) — VACUUM, auto-vacuum, index maintenance
- [`memory-backup-restore.md`](./memory-backup-restore.md) — pre-prune snapshot + restore
- [`memory-export-import.md`](./memory-export-import.md) — cold-archive JSONL flow
- [`memory-lint.md`](./memory-lint.md) — SR6 check on archival exports
