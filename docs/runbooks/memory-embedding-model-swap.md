# Runbook — Memory embedding-model swap

> **Audience:** Tech Lead / SRE. Triggered when migrating the embedder
> from the default `Xenova/all-MiniLM-L6-v2` to another model (e.g.
> `BAAI/bge-small-en-v1.5`), or when rotating to a newer revision of
> the same model.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)

## When this runbook applies

This is a **deliberate** migration, not an incident response. Trigger
when any of:

- Recall@5 on the agreed eval set drops below the ADR-0003 §NFR
  threshold (`0.85`) and a candidate model demonstrably restores it.
- The default model is deprecated, EOL'd, or has a security advisory
  against its hosted weights.
- A documented upgrade path is ready to land (ADR-0003 calls out
  `BAAI/bge-small-en-v1.5` as the named upgrade model — same 384 dim,
  same schema).
- The quantization is changing (fp32 ↔ fp16 ↔ q8 ↔ q4) and you want
  to reindex for measurement consistency, even if the model id is the
  same.

If the embedder is **failing to load**, do not use this runbook — see
[`memory-embedder-load-failure.md`](./memory-embedder-load-failure.md).

## 1. Detection / pre-flight

### 1.1 Confirm current embedder state

```bash
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const rows = db.prepare('SELECT embed_model_id, embed_model_ver, COUNT(*) AS c FROM entries_v2 GROUP BY embed_model_id, embed_model_ver').all();
console.log(rows);
db.close();
"
```

The ADR-0003 schema tags every row with `embed_model_id` and
`embed_model_ver`. A clean vault returns a single group. Multiple
groups indicate a previous partial migration — finish that first
before starting a new swap.

### 1.2 Dimension and schema compatibility

The SQLite vector column is `float[384]` (DDL in ADR-0003 §SQL schema).
A candidate model with a different output dimension requires a schema
migration that is **out of scope for this runbook** — file an ADR
amendment first.

Both the default (`all-MiniLM-L6-v2`) and the documented upgrade
(`bge-small-en-v1.5`) are 384-dim, so the in-place swap path holds for
the published combinations.

### 1.3 Verify candidate weights

Per SR3 the embedder fail-closes on first use against the SHA-256
manifest in `.opencode/memory/embeddings.lock`. Before swapping:

1. Compute SHA-256 of each ONNX file the new model ships.
2. Stage the updated `embeddings.lock` on a feature branch (this is a
   privileged change — reviewer must verify the SHAs against an
   independent source, not the same artefact).
3. Do **not** disable lock verification to "unblock" the swap.

## 2. Recovery (= migration procedure)

### 2.1 Snapshot first

```bash
mkdir -p .opencode/memory/backups
sqlite3 .opencode/memory/memory.db ".backup .opencode/memory/backups/memory-pre-swap-$(date +%Y-%m-%d).db"
npm run memory:export   # regenerate JSONL with current model_id tags
```

The backup is the rollback artefact (§3). The export captures the
current semantic state without embeddings (SR2-compliant by design).

### 2.2 Update configuration

Edit `opencode.json` → `memory.embedder`:

```jsonc
"embedder": {
  "kind": "transformers-js",
  "model": "Xenova/bge-small-en-v1.5",   // new id
  "dim": 384,                              // unchanged
  "quantization": "fp32",
  "lockfile": ".opencode/memory/embeddings.lock"
}
```

Update `embeddings.lock` in the same commit. Both must land together;
otherwise SR3 fail-closed will block startup. Open the PR; do not
merge until the reindex has been rehearsed in a scratch checkout.

### 2.3 Reindex

Reindex regenerates every embedding under the new model and rewrites
the `embed_model_id` / `embed_model_ver` columns:

```bash
npm run memory:reindex
```

For a 1 k vault expect < 30 s; for a 10 k vault expect < 5 min (per
ADR-0003 §NFR appendix — latency table, `reindex()` row).

### 2.4 Verify

```bash
npm run memory:gc:validate
node -e "
const db = new (require('better-sqlite3'))('.opencode/memory/memory.db', { readonly: true });
const groups = db.prepare('SELECT embed_model_id, embed_model_ver, COUNT(*) AS c FROM entries_v2 GROUP BY embed_model_id, embed_model_ver').all();
console.log(groups);
if (groups.length !== 1) { console.error('FAIL: mixed-model rows present'); process.exit(1); }
db.close();
"
```

Must report exactly one `(embed_model_id, embed_model_ver)` group with
a row count equal to the pre-swap `SELECT COUNT(*)`. A reduced count
indicates rows were skipped during reindex — inspect logs and re-run.

### 2.5 Regenerate JSONL export

```bash
npm run memory:export
npm run memory:lint
```

The JSONL excludes `embedding` and `embed_model_*` columns (SR2), so
the diff against the pre-swap export should be empty for body /
metadata changes. A non-empty diff here is a bug, not a swap artefact.

## 3. Rollback

If retrieval quality degrades or the new model misbehaves, revert in
this order:

1. **Revert config + lockfile.** Restore the previous
   `memory.embedder.model` and the previous `embeddings.lock` in a
   single commit. Without lockfile revert, SR3 will fail-closed.
2. **Restore the pre-swap DB snapshot** from `.opencode/memory/backups/`:
   ```bash
   cp .opencode/memory/backups/memory-pre-swap-<date>.db .opencode/memory/memory.db
   rm -f .opencode/memory/memory.db-wal .opencode/memory/memory.db-shm
   ```
   Full restore procedure in [`memory-backup-restore.md`](./memory-backup-restore.md).
3. **If the snapshot is unavailable**, re-import from the pre-swap
   JSONL export and reindex under the original model:
   ```bash
   rm -f .opencode/memory/memory.db*
   # init fresh DB per memory-db-setup.md
   npm run memory:import -- --file .opencode/memory/exports/pre-swap-<date>.jsonl
   ```
   This recomputes embeddings under the (reverted) old model.

Do not attempt to "mix" — a vault must not contain rows from two
embedders simultaneously, because vector distances are
model-dependent and not comparable (ADR-0003 §SQL schema rationale).

## 4. Post-swap

- Run the agreed recall@5 eval against the new vault. Record the
  number alongside the swap PR.
- Update ADR-0003 §Stack table ("Default embedding model" row) if the
  default has been replaced organisation-wide. The runbook entry
  itself does not need to change unless the procedure has.
- File a follow-up to delete pre-swap backups after the agreed
  retention window.

## References

- [ADR-0003 §Stack — default + documented upgrade model](../adr/0003-sqlite-vec-memory-backend.md)
- [ADR-0003 §Backend interface — `Embedder` extracted as a sibling](../adr/0003-sqlite-vec-memory-backend.md)
- [ADR-0003 §SQL schema — `embed_model_id` / `embed_model_ver` columns](../adr/0003-sqlite-vec-memory-backend.md)
- [ADR-0003 §Security requirements SR3 — embedding model pinning](../adr/0003-sqlite-vec-memory-backend.md)
- [`memory-embedder-load-failure.md`](./memory-embedder-load-failure.md) — if the new embedder fails to load
- [`memory-backup-restore.md`](./memory-backup-restore.md) — rollback procedure
- [`memory-export-import.md`](./memory-export-import.md) — JSONL round-trip
- [`memory-db-setup.md`](./memory-db-setup.md) — fresh DB init
