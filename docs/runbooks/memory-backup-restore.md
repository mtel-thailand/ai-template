# Memory Backup & Restore — Operator Runbook

> **Audience:** DevOps, SRE, or any operator managing vault backups.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)
> **Status:** v1 — SQLite vault backup procedures

## 1. Quick Reference

| Action | Command |
|--------|---------|
| Create backup | `npm run memory:backup` (if implemented) or manual `cp` |
| Restore from backup | `npm run memory:restore` (if implemented) or manual `cp` |
| Verify backup integrity | `node scripts/verify-backup.mjs` (if implemented) |
| Backup location | `.opencode/memory/backups/` |

## 2. Backup

### 2.1 Manual backup (recommended)

SQLite provides a safe online backup via the `.backup` command or the
`backup` API. This is safe to run while the vault is in use.

```bash
# Using sqlite3 CLI
sqlite3 .opencode/memory/memory.db ".backup .opencode/memory/backups/memory-$(date +%Y-%m-%d).db"
```

Or using Node.js:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.backup('.opencode/memory/backups/memory-2026-05-25.db');
db.close();
console.log('Backup complete');
"
```

### 2.2 Cold backup (consistent snapshot)

If the vault is not in use (no agents running), a simple file copy is safe:

```bash
mkdir -p .opencode/memory/backups
cp .opencode/memory/memory.db .opencode/memory/backups/memory-$(date +%Y-%m-%d).db
```

**⚠️ Do NOT use cp on a live database in WAL mode.** The WAL and SHM files
may contain uncheckpointed transactions. Always use the SQLite backup API
or sqlite3 CLI `.backup` for online backups.

### 2.3 Automated backup schedule

| Cadence | Action | Who |
|---------|--------|-----|
| Daily | Create backup via cron/systemd timer | SRE / DevOps |
| Weekly | Copy backup to off-machine storage | SRE / DevOps |

### 2.4 Clean up old backups

```bash
# Keep last 7 daily backups
ls -t .opencode/memory/backups/memory-*.db | tail -n +8 | xargs rm -f
```

## 3. Restore

### 3.1 Restore from backup

```bash
# Stop any process using the vault
# Then:
cp .opencode/memory/backups/memory-2026-05-25.db .opencode/memory/memory.db
# Verify the restored database
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const count = db.prepare('SELECT COUNT(*) as c FROM entries_v2').get();
console.log('Restored database has', count.c, 'entries');
db.close();
"
```

### 3.2 Restore from JSONL export

If the `.db` file is corrupted but a JSONL export exists, re-import:

```bash
# 1. Delete the corrupted database
rm -f .opencode/memory/memory.db*

# 2. Import from the latest JSONL export
npm run memory:import -- --file .opencode/memory/exports/latest.jsonl
```

### 3.3 Disaster recovery (no backup, no export)

If both `.db` and JSONL are lost, data is irrecoverable. The only remaining
data may be in the file vault at `.opencode/memory/mid/`, `.opencode/memory/long/`,
and `.opencode/memory/frequent/` (these tiers use the SQLite backend, not the
file vault; `short/` and `forgettable/` are file-only and unaffected).

## 4. Verify Backup Integrity

```bash
# Quick integrity check
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/backups/memory-2026-05-25.db');
const ok = db.prepare('PRAGMA integrity_check').pluck().get();
console.log('Integrity check:', ok);
db.close();
"
```

## 5. Troubleshooting

### 5.1 "database disk image is malformed"

The database file is corrupted.

**Solution:**
1. Restore from the most recent backup.
2. If no backup exists, try `PRAGMA integrity_check` to assess damage.
3. Export salvageable data via JSONL export before the corruption spreads.

### 5.2 Restore fails with "database is in use"

The vault is being accessed by another process.

**Solution:**
1. Ensure no agents or scripts are running.
2. Check for stale WAL files: `ls -la .opencode/memory/memory.db*`
3. If the process is frozen, terminate it before restoring.

## 6. Related Documents

- [Memory DB Setup Runbook](./memory-db-setup.md)
- [Memory Export/Import Runbook](./memory-export-import.md)
- [Memory Troubleshooting Runbook](./memory-troubleshooting.md)
- [Memory Performance Runbook](./memory-performance.md)
