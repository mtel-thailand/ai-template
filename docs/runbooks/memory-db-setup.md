# Memory Database Setup — Operator Runbook

> **Audience:** DevOps, SRE, or any operator initializing the SQLite vault.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)
> **Status:** v1 — SQLite + sqlite-vec backend

## 1. Quick Reference

| Action | Command |
|--------|---------|
| Initialize vault | `npm run memory:db:init` (if implemented) |
| Verify DB exists | `ls -la .opencode/memory/memory.db` |
| Check PRAGMA settings | `node -e "new (require('better-sqlite3'))('.opencode/memory/memory.db').pragma('journal_mode')"` |
| Run GC cycle | `npm run memory:gc` |

## 2. Database Initialization

### 2.1 First-time setup

The SQLite vault is created automatically on first use of the memory backend.
No manual database creation is needed.

The initialization process:

1. Opens (or creates) `.opencode/memory/memory.db`.
2. Sets mandatory PRAGMAs (see §2.2).
3. Creates the `entries_v2` table if it does not exist.
4. Creates the `entries_vec` virtual table (sqlite-vec) if it does not exist.
5. Creates the `entries_fts` virtual table (FTS5) if it does not exist.
6. Creates triggers for sync between `entries_v2` and `entries_fts`.

### 2.2 Mandatory PRAGMA settings

```sql
PRAGMA journal_mode = WAL;          -- Write-Ahead Logging for concurrent reads
PRAGMA synchronous = NORMAL;        -- Balance safety/performance (FULL = safer but slower)
PRAGMA busy_timeout = 5000;         -- Wait up to 5 seconds on lock contention
PRAGMA foreign_keys = ON;           -- Enforce referential integrity
```

These PRAGMAs are set on every connection open. Do not override them without
updating the threat model.

### 2.3 Verify initialization

```bash
# Check that the database file exists
ls -lh .opencode/memory/memory.db

# Verify tables exist
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
db.close();
"

# Expected output: entries_v2, entries_vec, entries_fts
```

## 3. Database File Locations

| File | Purpose | Git |
|------|---------|-----|
| `.opencode/memory/memory.db` | Main database | Ignored (`.gitignore`) |
| `.opencode/memory/memory.db-wal` | WAL journal | Ignored |
| `.opencode/memory/memory.db-shm` | WAL shared memory | Ignored |
| `.opencode/memory/memory.db-journal` | Rollback journal (when not in WAL mode) | Ignored |

## 4. Common Operations

### 4.1 Reset the database (factory default)

⚠️ **This destroys all data. Use only during development.**

```bash
rm -f .opencode/memory/memory.db*
# The backend recreates the database on next use.
```

### 4.2 Compact the database

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.pragma('journal_mode = WAL');
console.log('Pages before:', db.pragma('page_count', {simple: true}));
db.exec('VACUUM');
console.log('Pages after:', db.pragma('page_count', {simple: true}));
db.close();
"
```

### 4.3 Inspect database stats

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const count = db.prepare('SELECT COUNT(*) as c FROM entries_v2').get();
const size = db.prepare(\"SELECT page_count * page_size as bytes FROM pragma_page_count, pragma_page_size\").get();
console.log('Entries:', count.c);
console.log('DB size:', (size.bytes / 1024).toFixed(1), 'KB');
db.close();
"
```

## 5. Troubleshooting

### 5.1 "sqlite-vec extension not found"

If the `entries_vec` virtual table creation fails, ensure `sqlite-vec` npm
package is installed:

```bash
npm install sqlite-vec
```

Verify the extension loads:

```bash
node -e "
const db = new (require('better-sqlite3'))(':memory:');
const sqliteVec = require('sqlite-vec');
sqliteVec.load(db);
console.log('sqlite-vec loaded successfully');
db.close();
"
```

### 5.2 "FTS5 not available"

FTS5 is included in the standard `better-sqlite3` build. If missing:

```bash
npm rebuild better-sqlite3 --build-from-source
```

If the system SQLite lacks FTS5, install the full-text-search-enabled build.

### 5.3 WAL file grows large

WAL file growth is normal under write-heavy workloads. Compact with:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
"
```

## 6. Related Documents

- [ADR-0003: sqlite-vec memory backend](../adr/0003-sqlite-vec-memory-backend.md)
- [Memory Export/Import Runbook](./memory-export-import.md)
- [Memory Backup/Restore Runbook](./memory-backup-restore.md)
- [Memory Troubleshooting Runbook](./memory-troubleshooting.md)
- Threat model — `docs/security/memory-backend-threat-model.md`
