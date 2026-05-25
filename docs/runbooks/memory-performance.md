# Memory Performance — Operator Runbook

> **Audience:** DevOps, SRE, or any operator tuning vault performance.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)
> **Status:** v1 — SQLite + sqlite-vec performance tuning

## 1. Quick Reference

| Action | Command |
|--------|---------|
| Check DB size | `node scripts/db-stats.mjs` (if implemented) |
| VACUUM (reclaim space) | `node -e "new (require('better-sqlite3'))('.opencode/memory/memory.db').exec('VACUUM')"` |
| Rebuild FTS5 index | `npm run memory:reindex` |
| Run performance diagnostics | See §5 |

## 2. Database Size Management

### 2.1 Monitor database size

```bash
ls -lh .opencode/memory/memory.db*
```

Expected size:
- **Small vault** (< 100 entries): < 1 MB
- **Medium vault** (100–1000 entries): 1–10 MB
- **Large vault** (> 1000 entries): 10–100 MB

### 2.2 Reclaim space with VACUUM

After many deletes or updates, the database file may have unused pages.
VACUUM rebuilds the database file, reclaiming space.

```bash
# VACUUM requires exclusive access — no other processes may be connected.
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const before = Number(db.pragma('page_count', {simple: true})) * 4096;
db.exec('VACUUM');
const after = Number(db.pragma('page_count', {simple: true})) * 4096;
console.log('Size before:', (before / 1024).toFixed(1), 'KB');
console.log('Size after:',  (after / 1024).toFixed(1), 'KB');
console.log('Reclaimed:',   ((before - after) / 1024).toFixed(1), 'KB');
db.close();
"
```

### 2.3 Auto-vacuum (optional)

Enable incremental auto-vacuum for ongoing space management:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.pragma('auto_vacuum = INCREMENTAL');
db.exec('PRAGMA incremental_vacuum(100)');
db.close();
console.log('Auto-vacuum enabled');
"
```

## 3. Vector Search Performance

### 3.1 Understanding vec0 performance

The `vec0` virtual table uses brute-force (exact) k-NN search. For small
vaults (< 10,000 entries), this is fast enough. For larger datasets,
consider:

- Reducing the embedding dimension (384 dim is already compact for MiniLM).
- Partitioning by tier (search only `mid` or `long` instead of all tiers).
- Using `k` limits (smaller `k` = faster search).

### 3.2 Query performance diagnostics

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
// Enable query timing
db.exec('PRAGMA stats=1');

// Time a vector search
const start = Date.now();
const results = db.prepare(\`
  SELECT name, distance
  FROM entries_vec
  WHERE embedding MATCH ?
  AND k = 10
\`).all(new Float32Array(384));
console.log('Vector search:', results.length, 'results in', Date.now() - start, 'ms');

// Time a lexical search
const start2 = Date.now();
const fts = db.prepare(\`
  SELECT name, rank
  FROM entries_fts
  WHERE entries_fts MATCH ?
  LIMIT 10
\`).all('test');
console.log('FTS5 search:', fts.length, 'results in', Date.now() - start2, 'ms');

db.close();
"
```

## 4. FTS5 Performance

### 4.1 FTS5 index maintenance

The FTS5 index is maintained by triggers on `entries_v2`. If the index
becomes fragmented or out of sync:

```bash
# Rebuild FTS5 index
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
db.exec(\`
  INSERT INTO entries_fts(entries_fts) VALUES('rebuild')
\`);
console.log('FTS5 index rebuilt');
db.close();
"
```

### 4.2 Optimize FTS5 for large corpora

For vaults with > 1000 entries:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
// Merge b-tree segments for faster queries
db.exec(\`
  INSERT INTO entries_fts(entries_fts) VALUES('merge=4,8')
\`);
console.log('FTS5 segments merged');
db.close();
"
```

## 5. Performance Diagnostics

### 5.1 Query plan analysis

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
// Explain a typical hybrid search query
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT name FROM entries_v2 WHERE tier = ?').all('mid');
console.log('Query plan:');
plan.forEach(p => console.log('  ', p.detail || JSON.stringify(p)));
db.close();
"
```

### 5.2 Slow query logging

If search performance degrades, enable SQLite's slow query logging:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
// Log all queries slower than 100ms (requires custom build or wrapper)
db.exec('PRAGMA log_slow_queries = 100');
db.close();
"
```

## 6. General Guidelines

| Pattern | Impact | Recommendation |
|---------|--------|---------------|
| Many small entries (< 100 chars) | High vector storage overhead | Batch embeddings; merge related notes |
| Frequent updates to same entry | WAL growth; trigger overhead | Batch updates; design to minimize churn |
| Cross-tier queries | Multiple sub-queries | Filter by tier; avoid `SELECT *` across tiers |
| Large JSONL import | Slow due to per-record embedding | Import during low-activity periods |

## 7. Related Documents

- [Memory Troubleshooting Runbook](./memory-troubleshooting.md)
- [Memory DB Setup Runbook](./memory-db-setup.md)
- [Memory Backup/Restore Runbook](./memory-backup-restore.md)
- [Memory Lint Runbook](./memory-lint.md)
