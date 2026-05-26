# Runbook — Memory WAL checkpoint stuck

> **Audience:** SRE / DevOps. Triggered when the SQLite WAL file grows
> unbounded, `PRAGMA wal_checkpoint` reports a busy state, or read /
> write latency rises in lockstep with WAL growth.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)

## When this runbook applies

ADR-0003 §Configuration schema pins `journal_mode = WAL`,
`synchronous = NORMAL`, and `busy_timeout = 5000`. Under healthy load,
SQLite auto-checkpoints (default page threshold ~1000 pages) and the
`-wal` file stays small (single-digit MB).

This runbook triggers when:

- `memory.db-wal` exceeds ~10 MB and continues to grow over multiple
  measurements.
- `PRAGMA wal_checkpoint(PASSIVE)` returns a non-zero first column
  (busy) repeatedly across runs.
- p99 search / put latency drifts above the ADR-0003 NFR alerts
  (e.g. p99 `put` > 150 ms, p99 `search` > 200 ms at 200 entries) and
  the rise correlates with WAL size.
- Agent processes log `SQLITE_BUSY` retries above the 1 % budget set
  in threat model T-08.

Not this runbook:

- One-off `SQLITE_BUSY` errors with normal WAL size → transient
  contention; let the `busy_timeout=5000` retry handle it.
- DB file corruption symptoms → [`memory-db-corruption.md`](./memory-db-corruption.md).
- Embedder-side stalls → [`memory-embedder-load-failure.md`](./memory-embedder-load-failure.md).

## 1. Detection

### 1.1 Measure WAL size

```bash
ls -lh .opencode/memory/memory.db .opencode/memory/memory.db-wal .opencode/memory/memory.db-shm 2>/dev/null
```

A `-wal` larger than the main DB is a strong signal. A `-wal` larger
than ~10 MB is suspicious; larger than ~50 MB needs intervention now.

### 1.2 Probe checkpoint state

The three-column return of `wal_checkpoint(PASSIVE)` is
`(busy, log_frames, checkpointed_frames)`. `busy=0` and
`checkpointed == log_frames` means a clean checkpoint. `busy=1`
or `checkpointed < log_frames` means readers / writers are blocking
the checkpoint:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const r = db.pragma('wal_checkpoint(PASSIVE)');
console.log('passive:', r);
db.close();
"
```

### 1.3 Identify holders

No SQLite-internal way to list open file handles. Use OS tooling:

```bash
# macOS / Linux
lsof .opencode/memory/memory.db .opencode/memory/memory.db-wal 2>/dev/null
# Windows (PowerShell, with handle.exe from Sysinternals)
# handle.exe memory.db
```

Note PIDs and the commands that opened them. A long-running read
transaction (e.g. an agent that opened a connection and never closed
it, or a `BEGIN` that was never `COMMIT`ted) prevents the WAL from
being reclaimed.

### 1.4 Latency correlation

If you have the search-latency monitor wired (NFR appendix p50/p99
targets), check whether the p99 rise lines up with the WAL growth
curve. If both are climbing together, this runbook is the right one.
If latency is climbing without WAL growth, see
[`memory-performance.md`](./memory-performance.md).

## 2. Recovery

Apply in order. Re-measure (§1.1, §1.2) after each step.

### 2.1 Step 1 — close long-lived readers / writers

For each PID identified in §1.3, stop or restart the holder:

- Agent process holding an idle transaction → send SIGTERM, let it
  exit cleanly. Investigate the leak in a follow-up issue.
- Forgotten `sqlite3` CLI session → close it.
- Background script that called `BEGIN` and never committed → kill,
  then file the bug.

With holders cleared, retry `wal_checkpoint(PASSIVE)`. If it now
reports `busy=0`, the system is healthy — monitor for an hour to
confirm.

### 2.2 Step 2 — manual TRUNCATE checkpoint

If no obvious holder, force a TRUNCATE checkpoint. This blocks until
all frames are written back and **truncates the `-wal` file to zero**:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const r = db.pragma('wal_checkpoint(TRUNCATE)');
console.log('truncate:', r);
db.close();
"
```

Safe to run while other processes are connected, but may stall for
seconds if writers are active. If TRUNCATE returns busy too, escalate
to §2.3.

### 2.3 Step 3 — quiesce and restart

Last non-destructive option:

1. Stop **all** agents and any tooling holding the DB open.
2. Verify no holders: `lsof memory.db memory.db-wal` returns empty.
3. Run the TRUNCATE checkpoint from §2.2 — it should succeed now.
4. Restart agents. WAL should stay small under normal load; if it
   climbs again immediately, see §4.

### 2.4 Step 4 — emergency stale-WAL recovery (only if file is orphaned)

If `lsof` shows **no holders** but TRUNCATE still reports busy, the
`-wal` / `-shm` files may be stale from a crashed writer that did not
clean up. SQLite normally recovers automatically on the next open;
force the issue by opening, checkpointing, then closing:

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db');
const t = db.pragma('wal_checkpoint(TRUNCATE)');
console.log('post-recovery truncate:', t);
db.close();
"
```

Do **not** delete `-wal` or `-shm` files by hand on a live system —
doing so against a non-checkpointed WAL discards committed
transactions. Only consider deletion after a clean shutdown of every
writer (i.e. you have run §2.3 and the holders list is genuinely
empty) and you have a fresh backup per
[`memory-backup-restore.md`](./memory-backup-restore.md).

## 3. Rollback

If a recent change caused the stall, revert it:

- **PRAGMA tweak in `opencode.json`** (e.g. you flipped
  `synchronous` away from `NORMAL`, raised `busy_timeout` aggressively,
  or experimented with `journal_size_limit`) → revert the commit, then
  re-run §2.2.
- **Schema or trigger change** that holds longer-running write
  transactions → revert and re-evaluate. Triggers run inside the
  enclosing transaction, so heavy work in a trigger extends WAL
  retention.
- **New writer agent rolled out** that doesn't commit promptly →
  disable the agent, file a bug for the leak, restart per §2.3.

Configuration rollback alone does not shrink an already-grown WAL —
follow up with §2.2.

If the DB itself was corrupted by an aborted recovery attempt (e.g. a
manual `-wal` delete on a live system), restore from backup per
[`memory-backup-restore.md`](./memory-backup-restore.md) §3 and treat
the incident as both a checkpoint stall and a corruption event
(→ [`memory-db-corruption.md`](./memory-db-corruption.md) for
verification).

## 4. Post-recovery

- WAL stays below ~10 MB for 24 hours under normal load.
- p99 latency returns to the ADR-0003 NFR band.
- For any PID found in §1.3, file a follow-up to root-cause why it
  held an open transaction. Threat model T-08 budgets `SQLITE_BUSY` at
  < 1 % of attempts — if the stall pushed past that, log the breach.
- Consider lowering `PRAGMA wal_autocheckpoint` (default 1000 pages)
  if the workload regularly produces large transactions. Any change
  here is a config edit — ADR amendment not required unless it
  changes the recorded PRAGMA set.

## References

- [ADR-0003 §Configuration schema — `sqlite.pragmas` (WAL, NORMAL, busy_timeout=5000)](../adr/0003-sqlite-vec-memory-backend.md)
- [ADR-0003 §NFR appendix — latency targets and `SQLITE_BUSY` budget](../adr/0003-sqlite-vec-memory-backend.md)
- [Threat model T-08 — cross-process write contention](../security/memory-backend-threat-model.md)
- [`memory-performance.md`](./memory-performance.md) — VACUUM, latency diagnostics
- [`memory-backup-restore.md`](./memory-backup-restore.md) — backup before invasive recovery
- [`memory-db-corruption.md`](./memory-db-corruption.md) — if recovery itself corrupts the DB
- SQLite WAL docs: https://www.sqlite.org/wal.html
- SQLite `wal_checkpoint` PRAGMA: https://www.sqlite.org/pragma.html#pragma_wal_checkpoint
