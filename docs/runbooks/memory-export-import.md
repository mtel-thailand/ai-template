# Memory Export/Import — Operator Runbook

> **Audience:** DevOps, SRE, or any operator managing JSONL export/import.
> **Canonical spec:** [`/docs/specs/agent-memory.md`](../specs/agent-memory.md)
> **ADR:** [`/docs/adr/0003-sqlite-vec-memory-backend.md`](../adr/0003-sqlite-vec-memory-backend.md)
> **Status:** v1 — JSONL round-trip with embedding exclusion (T-10)

## 1. Quick Reference

| Action | Command |
|--------|---------|
| Export vault to JSONL | `npm run memory:export` (if implemented) |
| Import JSONL into vault | `npm run memory:import` (if implemented) |
| Validate export for secrets | `npm run memory:lint` |
| Recompute embeddings on import | Automatic (embedder re-runs on import) |

## 2. JSONL Export

### 2.1 Export format

The export produces newline-delimited JSON (JSONL) with one record per entry.
Per T-10 mitigation, the **`embedding`** and **`embed_model_*`** fields are
**excluded** from the export to prevent Vec2Text inversion attacks.

```jsonl
{"name":"arch-decision-001","tier":"mid","kind":"semantic","body":"...","description":"...","tags":["architecture"],"links":[],"importance":5,"created":"...","updated":"...","lastAccessed":"...","accessCount":1}
{"name":"team-workflow","tier":"long","kind":"semantic","body":"...","description":"...","tags":["workflow"],"links":["..."],"importance":4,"created":"...","updated":"...","lastAccessed":"...","accessCount":3}
```

**Fields excluded from export:**
- `embedding` (Float32Array → binary vector) — excluded per T-10
- `embed_model_id` — excluded per T-10
- `embed_model_ver` — excluded per T-10

### 2.2 Export location

Exports are written to `.opencode/memory/exports/` with filenames like:
- `memory-export-2026-05-25.jsonl`
- `memory-export-2026-05-25T120000Z.jsonl` (with timestamp precision)

### 2.3 Verify export integrity

```bash
# Count records in the latest export
wc -l .opencode/memory/exports/memory-export-*.jsonl

# Validate no embedding fields present (SR2)
node -e "
const fs = require('fs');
const lines = fs.readFileSync('.opencode/memory/exports/latest.jsonl', 'utf-8').trim().split('\n');
for (const line of lines) {
  const obj = JSON.parse(line);
  if ('embedding' in obj) {
    console.error('FAIL: embedding field found in export!');
    process.exit(1);
  }
}
console.log('OK: No embedding fields found in', lines.length, 'records');
"
```

### 2.4 Run secrets lint on export

```bash
npm run memory:lint -- --file .opencode/memory/exports/latest.jsonl
```

If the vault is empty or no exports exist yet, use `--exit0-when-empty`:

```bash
npm run memory:lint -- --exit0-when-empty
```

## 3. JSONL Import

### 3.1 Import process

The import process:

1. Reads each JSONL record.
2. Strips any `embedding` / `embed_model_*` fields if present (safety net).
3. Passes each record through the embedder to recompute its vector.
4. Inserts/updates the entry in the SQLite vault.
5. Logs any records that fail validation.

### 3.2 Import validation

Record validation requirements:
- `name` — required, must be unique (primary key).
- `tier` — required, must be one of `mid`, `long`, `frequent`.
- `body` — required, must not exceed 64 KB.
- `importance` — optional, defaults to 3; must be 1–5.

### 3.3 Dry-run import

```bash
# If implemented with --dry-run flag
npm run memory:import -- --dry-run --file path/to/export.jsonl
```

## 4. Re-embedding

When importing records that lack embeddings, the embedder recomputes them
using the configured model (`Xenova/all-MiniLM-L6-v2`, 384 dim). This is
automatic and requires no manual intervention.

To re-embed all existing entries (e.g., after model update):

```bash
npm run memory:reindex
```

## 5. Troubleshooting

### 5.1 Import fails with "embedding model not loaded"

Ensure the ONNX model is downloaded and the `embeddings.lock` file matches.

### 5.2 Import is slow

Bulk import of hundreds of records will be slow due to the per-record
embedding computation (each record runs through the ~80 MB ONNX model).
This is expected — batch imports are processed sequentially.

### 5.3 Export file is empty

If no entries exist in the vault, export produces an empty file. This is
valid — run `npm run memory:lint -- --exit0-when-empty` to avoid false
positives in CI.

## 6. Related Documents

- [ADR-0003: sqlite-vec memory backend](../adr/0003-sqlite-vec-memory-backend.md)
- [Memory Lint Runbook](./memory-lint.md)
- [Memory DB Setup Runbook](./memory-db-setup.md)
- [Memory Troubleshooting Runbook](./memory-troubleshooting.md)
- Threat model T-10 (embedding exclusion) — `docs/security/memory-backend-threat-model.md`
