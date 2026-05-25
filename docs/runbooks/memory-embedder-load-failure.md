# Runbook — Memory embedder load failure

## When this runbook applies

The `memory:gc`, `memory:import`, or runtime memory subsystem reports
that the embedder failed to load or that `Embedder.embed()` threw on
one or more entries.

Symptoms:
- `memory:gc` warns: `Embedder unavailable; orphan-repair degrades to lexical-only…`
- `memory:gc` warns: `embed failed for <name>: … — flagged for reindex`
- Runtime: search results return `matchedBy: 'lexical'` only.

## What the system does automatically

Per ADR-0003 §Reliability, the system **never crashes** on embedder
failure. The degraded modes are:

| Caller | Behaviour |
|---|---|
| `MemoryBackend.search()` | Falls back to `search({mode: 'lexical'})`; FTS5 only. |
| `memory:import` | Skips embedding generation; rows are inserted without an `entries_vec` row. Logs a warning per row. |
| `memory:gc` orphan-repair | Logs a warning per orphan; leaves the row without a vector; **does not delete the entry**; continues to vacuum and completion. |
| Runtime `put` | Falls back to lexical-only retrieval for the row. |

Orphan rows left after a degraded GC run are picked up by the next GC
once the embedder is restored.

## Causes (most common first)

1. **`@xenova/transformers` not installed.** This package is only required
   for actual embedding generation. The `.mjs` scripts (`memory-gc`,
   `memory-import`, `memory-export`) load it lazily; embedding paths
   degrade if it is absent.

   Fix:
   ```bash
   npm install @xenova/transformers
   ```

2. **Model not in local cache and no network.** First run downloads
   `Xenova/all-MiniLM-L6-v2` from Hugging Face (~25 MB INT8, ~80 MB FP32).

   Fix: ensure network connectivity, or pre-stage the model on the host
   before running `memory:gc` / `memory:import`.

3. **`embeddings.lock` SHA-256 mismatch.** Per ADR-0003 SR3 the embedder
   fail-closes on first use if the model ONNX file SHA does not match
   `embeddings.lock`.

   Fix: verify model file authenticity, then update `embeddings.lock`
   via a reviewed PR (this is a privileged change).

4. **Out-of-memory during model load.** ONNX Runtime CPU needs
   ~250–300 MB headroom for FP32, ~150 MB for q8.

   Fix: free memory or switch quantization in `opencode.json` →
   `memory.embedder.quantization` to `"q8"` or `"q4"`.

## Verifying recovery

After fixing the root cause:

```bash
npm run memory:gc:dry
```

A dry-run reports any remaining orphans without writing. If the embedder
is healthy, the report shows `Orphans repaired: N` (where N matches the
number found). If you still see `Embedder unavailable`, the fix has not
taken effect — check `node -e "import('@xenova/transformers')"`.

## Escalation

If this runbook does not restore the embedder, file an SRE issue with:
- Exact warning text from the failing `memory:gc` run.
- `node -v`, OS, free RAM.
- SHA-256 of `~/.cache/huggingface/hub/.../all-MiniLM-L6-v2/*.onnx` vs.
  `embeddings.lock` expected SHA.

## Related

- ADR-0003 §Reliability "Embedder load failure"
- ADR-0003 §Security requirements SR3 (embedding model pinning)
- `/docs/runbooks/memory-troubleshooting.md`
- `/docs/runbooks/agent-memory.md`
