# ADR-0003: SQLite + sqlite-vec as Default Memory Backend

## Status

**Proposed** — awaiting sign-off from @po, @security, @sre.

## Date

2026-05-25

## Issue

#25 — `design: SQLite + sqlite-vec as default memory backend (spec + ADR)`

## Context

The agent memory subsystem (`/docs/specs/agent-memory.md`, ratified in Issue
#15) is currently file-based: markdown + YAML frontmatter under
`.opencode/memory/`, with `ripgrep` + `[[wikilinks]]` as the retrieval
mechanism. This works for small, recent vaults but does not scale for:

- Semantic recall across many entries (lexical-only today).
- Cross-session retrieval ranked by relevance.
- Efficient queries against `mid/`, `long/`, and `frequent/` as the vault
  grows past a few hundred entries.

The spec already names the upgrade trigger (`/docs/specs/agent-memory.md` §5):
**corpus > 500 notes OR p95 recall@5 < 0.85**. This ADR ratifies the
backend that satisfies that upgrade path **as the default**, while
preserving the file vault for the two tiers where ranked retrieval is not
useful (`short/`, `forgettable/`).

### Decision drivers

1. **Zero external runtime services.** A developer-template repo must not
   require Postgres, a managed vector DB, or a hosted embedding API to
   function.
2. **Diffability and reviewer obligation (R3).** Memory writes to
   `mid/long/frequent/` must remain reviewable by humans in PRs. Binary
   `.db` files defeat this; a text-format export must compensate.
3. **Per-tier swappable backends.** Downstream forks with real customer
   data (spec §13 Fork Callout) must be able to opt into Postgres +
   pgvector or Qdrant without re-architecting.
4. **R1 (untrusted input) and §9 secrets ban must not weaken.**
5. **No backend lock-in for embeddings.** Embedding generation is a
   separate concern from storage; future model swaps must not require a
   schema change.

### Citations

This ADR is grounded in the Research Brief at
`/docs/research/sqlite-vec-memory.md` (committed 2026-05-25, commit
`f672651`). The Brief's "Recommended stack" table is adopted in full;
deviations are called out explicitly below.

---

## Decision

### Stack

| Layer | Choice | Source |
|---|---|---|
| Storage extension | `sqlite-vec` v0.1.9 (pinned, Apache-2.0/MIT) | Brief §1 |
| SQLite driver (Node) | `better-sqlite3` (sync, supports `load_extension`) | Brief §8 |
| Vector type | `float[384]` | Brief §2 |
| Lexical index | FTS5 external-content (`porter unicode61 remove_diacritics 2`) | Brief §3 |
| Hybrid ranking | **Reciprocal Rank Fusion (RRF)**, `k=60` default, configurable via `memory.search.rrfK` (Cormack et al. 2009, SIGIR '09) | Brief §3 / Amendment 2026-05-25 |
| Default embedding model | `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0, 384 dim, ~25 MB INT8 / ~80 MB FP32) | Brief §2 |
| Documented upgrade model | `BAAI/bge-small-en-v1.5` (MIT, 384 dim, same schema) | Brief §2 |
| Embedding runtime | `@huggingface/transformers` (transformers.js, ONNX Runtime CPU) | Brief §2 |
| Tier mapping | file: `short`, `forgettable` · SQLite: `mid`, `long`, `frequent` | PO AC7 / Brief §8 |
| Concurrency | WAL + `busy_timeout=5000` + **`synchronous=NORMAL`** | Brief §6 / SRE §4 |
| DB location | `.opencode/memory/memory.db` — **gitignored** | PM ruling #4 / Brief §5 |
| Diff/review surface | JSONL export under `.opencode/memory/exports/`, **committed** | PM ruling #4 / Brief §5 |
| Encryption | None in v1; OS disk encryption + §9 secrets ban + §11 R3 | Brief §7 |

### Configuration schema (canonical — spec §15 references this block)

The `memory` section of `opencode.json`:

```jsonc
{
  "memory": {
    "version": 1,
    "backends": {
      "short":       { "type": "file" },
      "forgettable": { "type": "file" },
      "mid":         { "type": "sqlite-vec", "path": ".opencode/memory/memory.db" },
      "long":        { "type": "sqlite-vec", "path": ".opencode/memory/memory.db" },
      "frequent":    { "type": "sqlite-vec", "path": ".opencode/memory/memory.db" }
    },
    "embedder": {
      "kind": "transformers-js",
      "model": "Xenova/all-MiniLM-L6-v2",
      "dim": 384,
      "quantization": "fp32",
      "lockfile": ".opencode/memory/embeddings.lock"
    },
    "sqlite": {
      "extensionPath": "bin/sqlite-vec",
      "extensionLockfile": ".opencode/memory/sqlite-vec.lock",
      "pragmas": {
        "journal_mode": "WAL",
        "synchronous":  "NORMAL",
        "busy_timeout": 5000,
        "foreign_keys": "ON",
        "temp_store":   "MEMORY"
      }
    },
    "search": {
      "rrfK": 60,
      "ftsTimeoutMs": 500,
      "annTrigger": {
        "corpusSize":   5000,
        "searchP99Ms":  500,
        "recallAt5":    0.85
      }
    },
    "exports": {
      "path": ".opencode/memory/exports",
      "excludeFields": ["embedding"]
    }
  }
}
```

Field annotations: see spec §15 for the per-field type/default/range table.

### Backend interface — six methods (rationale below)

```ts
type Tier = 'short' | 'mid' | 'long' | 'frequent' | 'forgettable';
type Kind = 'working' | 'episodic' | 'semantic' | 'procedural';

interface MemoryEntry {
  name: string;
  tier: Tier;
  kind: Kind;
  description: string;
  body: string;
  tags: string[];
  links: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  created: string;
  updated: string;
  lastAccessed: string;
  accessCount: number;
}

interface SearchHit {
  entry: MemoryEntry;
  score: number;
  matchedBy: 'vector' | 'lexical' | 'hybrid';
  vectorDistance?: number;
  lexicalScore?: number;
}

interface SearchOpts {
  query: string;
  embedding?: Float32Array;
  k: number;
  tier?: Tier[];
  mode?: 'vector' | 'lexical' | 'hybrid';
  timeoutMs?: number;
}

interface ReindexOpts {
  tier?: Tier[];
  embedder?: Embedder;
}

interface MemoryBackend {
  put(entry: MemoryEntry, embedding: Float32Array): Promise<void>;
  get(name: string): Promise<MemoryEntry | null>;
  delete(name: string): Promise<boolean>;
  list(filter: { tier?: Tier[]; kind?: Kind[] }): Promise<MemoryEntry[]>;
  search(opts: SearchOpts): Promise<SearchHit[]>;
  reindex(opts?: ReindexOpts): Promise<void>;
}

interface Embedder {
  readonly modelId: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}
```

### Backend interface rationale

PO AC10 named six methods including separate `searchSemantic` and `searchLexical`. PM ruling #1 relaxed this. I consolidate the two search methods into a single `search(mode)` for three reasons: (1) hybrid is the default and one method = one SQL round-trip; (2) lexical-only fallback when the embedder fails is `search({mode:'lexical'})`, simpler than `try/catch` rerouting; (3) PgVector and Qdrant can each implement `search(mode)` in a single query natively, so the interface remains pluggable.

The Embedder interface is extracted as a sibling (closes Open Q6 and Security's open question affirmatively). PgVector / Qdrant backends reuse the transformers.js embedding path verbatim — they only implement storage. Supply-chain boundary B3 in the threat model narrows accordingly.

---

## SQL schema (DDL — implementation copy-paste ready)

```sql
CREATE TABLE entries (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  tier            TEXT NOT NULL CHECK (tier IN
                    ('short','mid','long','frequent','forgettable')),
  kind            TEXT NOT NULL CHECK (kind IN
                    ('working','episodic','semantic','procedural')),
  body            TEXT NOT NULL,
  description     TEXT NOT NULL,
  tags            TEXT NOT NULL,
  links           TEXT NOT NULL,
  importance      INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  created         TEXT NOT NULL,
  updated         TEXT NOT NULL,
  last_accessed   TEXT NOT NULL,
  access_count    INTEGER NOT NULL DEFAULT 0,
  embed_model_id  TEXT NOT NULL,
  embed_model_ver TEXT NOT NULL
);
CREATE INDEX entries_tier_idx ON entries (tier, last_accessed);

CREATE VIRTUAL TABLE entries_vec USING vec0 (
  id INTEGER PRIMARY KEY,
  embedding float[384]
);

CREATE VIRTUAL TABLE entries_fts USING fts5 (
  name, description, body, tags,
  content='entries', content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, name, description, body, tags)
    VALUES (new.id, new.name, new.description, new.body, new.tags);
END;
CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
    VALUES ('delete', old.id, old.name, old.description, old.body, old.tags);
END;
CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
    VALUES ('delete', old.id, old.name, old.description, old.body, old.tags);
  INSERT INTO entries_fts(rowid, name, description, body, tags)
    VALUES (new.id, new.name, new.description, new.body, new.tags);
END;
```

`embed_model_id` and `embed_model_ver` resolve Open Q2 (embedding swap policy): distances are model-dependent; tagging each row lets retrieval filter or trigger reindex on swap.

---

## `memory:gc` semantics under SQLite

GC remains backend-agnostic — it operates through `MemoryBackend` methods, never raw SQL (closes Open Q5).

| Phase | Today (file vault) | Under SQLite |
|---|---|---|
| Validate | Frontmatter parse + Zod over every `.md` | Backend yields entries via `list({})`; same Zod schema. File-vault tiers unchanged. JSONL exports linted by `memory:lint`. |
| Budget | Count `.md` files per tier | `SELECT tier, COUNT(*) FROM entries GROUP BY tier` |
| Evict | `unlink` files past TTL | `backend.delete(name)`; cascades to `entries_vec` and `entries_fts` via DDL triggers |
| Write | Atomic-rename | Implicit via WAL commit; then `memory:export` regenerates JSONL |
| Vacuum (new) | n/a | If fragmentation > 25%, `PRAGMA wal_checkpoint(TRUNCATE)` then `VACUUM` |

**CI follow-up:** the current `validate-memory` job will need rewriting for the JSONL + file-vault model. Follow-up ticket to be filed by PM after this ADR lands.

---

## NFR appendix

> Source: @sre Issue #25 comment 4532253928, embedded per PM ruling #3.

### Latency

| Operation | p50 | p99 | Alert |
|---|---|---|---|
| Cold start (warm model cache) | < 800 ms | < 1.5 s | p99 > 3 s |
| Cold start (first run, model download) | < 30 s | < 60 s | > 2 min |
| Embedding gen (single, ≤ 256 tok, CPU) | < 15 ms | < 50 ms | p99 > 100 ms |
| `put()` end-to-end | < 25 ms | < 75 ms | p99 > 150 ms |
| `get(name)` | < 2 ms | < 10 ms | p99 > 25 ms |
| `search(k=10)` hybrid @ 200 | < 30 ms | < 80 ms | p99 > 200 ms |
| `search(k=10)` hybrid @ 1k | < 50 ms | < 150 ms | p99 > 400 ms |
| `search(k=10)` hybrid @ 10k | < 150 ms | < 500 ms (`TBD-empirical`) | p99 > 1 s |
| `reindex()` @ 200 | < 5 s | — | > 15 s |
| `reindex()` @ 1k | < 30 s | — | > 90 s |
| `reindex()` @ 10k | < 5 min | — | > 15 min (`TBD-empirical`) |

### Throughput

| Metric | Budget |
|---|---|
| Sustained writes/sec (embedding-bound) | ≥ 30/s |
| Sustained writes/sec (pre-computed) | ≥ 200/s |
| Sustained reads/sec (`get`) | ≥ 1 000/s |
| Sustained search/sec | ≥ 20/s |

### Footprint

DB file size (per Brief §5 math):

| Tier load | Expected | Green | Yellow | Red |
|---|---|---|---|---|
| 200 entries (default) | < 1 MB | < 5 MB | 5–20 MB | > 20 MB |
| 1 k | ~3–5 MB | < 10 MB | 10–50 MB | > 50 MB |
| 10 k (stress) | ~30–35 MB | < 50 MB | 50–200 MB | > 200 MB |
| Hard ceiling | — | — | — | **> 500 MB → block writes, VACUUM, escalate** |

Per-agent RAM: ≤ 300 MB FP32 / ≤ 250 MB INT8.

### Reliability

| Failure mode | Target |
|---|---|
| Process crash | **0 committed-txn loss** (WAL replay) |
| OS / power loss | **Up to ~1 s of last-committed writes may be lost.** This ADR ratifies `synchronous=NORMAL` and accepts the power-loss tradeoff (closes SRE condition (a)). The ~30% throughput cost of `synchronous=FULL` is not warranted at the current risk profile. Forks with production data must re-evaluate under §13 Fork Callout. |
| DB corruption | Detect via `PRAGMA integrity_check`; RTO < 5 min from JSONL export |
| Concurrent-write `SQLITE_BUSY` | < 1% of attempts; ≤ 3 transparent retries within `busy_timeout=5000ms` |
| Embedder load failure | Degrade to `search({mode:'lexical'})`; alert; do not crash |

### Operational

| Job | Vault size | Target | Alert |
|---|---|---|---|
| `memory:gc` | 200 / 1k / 10k | < 2 s / < 5 s / < 30 s | > 10 s / > 30 s / > 2 min |
| `memory:export` | 1k / 10k | < 5 s / < 30 s | > 20 s / > 2 min |

### ANN evaluation trigger (closes Open Q1 and SRE condition (b))

Flat KNN in v1. Move to evaluating `sqlite-vec` 0.1.10-line ANN features when **any** holds:
1. Corpus exceeds **5 000 rows**, OR
2. `search` p99 over 7-day rolling window exceeds **500 ms** for ≥ 3 consecutive days, OR
3. Empirical recall@5 drops below **0.85**.

ANN evaluation triggers a re-spec ticket; does not auto-adopt.

### Required runbooks (before impl ships)

Under `/docs/runbooks/`: `memory-db-corruption.md`, `memory-import-failure.md`, `memory-embedding-model-swap.md`, `memory-vault-size-threshold.md`, `memory-embedder-load-failure.md`, `memory-wal-checkpoint-stuck.md`.

---

## Security requirements (gates the implementation ticket)

From `/docs/security/memory-backend-threat-model.md`. Load-bearing for Security sign-off; impl ticket inherits them.

1. **Gitignore + CI guard for binary DB.** `.gitignore` covers `*.db`, `*.db-wal`, `*.db-shm`, `*.db-journal`. CI fails the build if any `*.db*` file is staged.
2. **JSONL export excludes `embedding` field.** Vector inversion is plausible on small-encoder embedding spaces. `embed_model_id` and `embed_model_ver` also excluded. CI test verifies.
3. **Embedding model pinning + first-use verification.** `embeddings.lock` holds SHA-256 of ONNX files; fail-closed on mismatch.
4. **`sqlite-vec` binary pinning.** `sqlite-vec.lock` holds SHA-256 per platform; `load_extension` wrapper fail-closed on mismatch.
5. **FTS5 query safety.** Phrase-quote user input by default; `advanced: true` opt-in with grammar allowlist; per-query timeout ≤ 500 ms (`search.ftsTimeoutMs`).
6. **`memory:lint` over JSONL export in CI.** Runs secrets-ban regex set (§9 + §10); fails on match.

All vector and FTS queries **MUST** use parameter binding.

---

## Migration plan

One-shot import; no dual-read window. Justified by current vault size (≤ 200 entries).

1. Impl ticket adds `scripts/memory-import.mjs`.
2. `npm run memory:import -- --dry-run` validates and reports counts.
3. `npm run memory:import` reads `.opencode/memory/{mid,long,frequent}/*.md`, embeds, writes via `backend.put()`. Idempotent on `name` (`INSERT … ON CONFLICT(name) DO UPDATE`); vec0 rows are delete-then-insert.
4. Conflict resolution: most-recent `updated` wins; losers archived to `.opencode/memory/conflicts/<name>.<date>.md`.
5. Rollback: `rm .opencode/memory/memory.db`. Importer never deletes file-vault content.

Throughput ~80–150 short notes/sec; 200-entry import < 10 s.

---

## Consequences

### Positive
- Semantic retrieval becomes default for indexed tiers; no network leg.
- Single-file portability (`cp memory.db`); JSONL export for cross-machine seed.
- Per-tier backend swap is a config edit.
- Embedder decoupled from backend — future PgVector / Qdrant adapters reuse transformers.js verbatim.
- No backwards-compat break (R1, R3, §9, §10 unchanged).

### Negative
- New native dependency (`sqlite-vec` loadable extension); SHA-256 verification raises packaging complexity for forks.
- `sqlite-vec` is pre-v1; pin v0.1.9 and hold quarterly upgrade kata.
- 250–300 MB RAM per agent process for embedder + ONNX Runtime.
- `synchronous=NORMAL` accepts ~1 s power-loss window.
- CI gains complexity (`validate-memory` rewrite — follow-up ticket).

### Mitigations
- Version pinning + SHA-256 manifests for model and extension (Security reqs 3, 4).
- Quarterly upgrade-kata; bumps require ADR amendment.
- Fail-closed on every external artifact; lexical-only `search` is documented degraded mode.
- §13 Fork Callout routes production-data forks to re-run threat model and reconsider SQLCipher.

---

## Alternatives considered

| Option | Why rejected |
|---|---|
| `sqlite-vss` | Author-deprecated; redirects to `sqlite-vec`. |
| `usearch` | Standalone, not a SQLite extension; loses "one file" property. Revisit if ANN becomes mandatory. |
| Pure SQL + BLOB + linear cosine | Viable ≤ 500 entries; degrades non-linearly past that. Retained as conceptual fallback only. |
| OpenAI / Voyage / Cohere embeddings | Network leg + billing surface + exfiltration path; violates zero-runtime-services driver. Available as `embedder.kind: "remote"` opt-in (deferred). |
| SQLCipher | GPL-conditioned CE; paywalled optimised builds; incompatible with `better-sqlite3` bundled binary. Wrong control for the actual risks. §13 routes production-data forks to re-evaluate. |
| Postgres + pgvector as default | Requires running DB; violates zero-runtime-services. Opt-in via `backends.<tier>.type = "pgvector"` (deferred). |
| Qdrant / Chroma as default | Same as pgvector; opt-in via backend interface. |

---

## Open questions resolved

1. **ANN gate (Brief Q1)** — documented threshold above.
2. **Embedding swap policy (Brief Q2)** — `embed_model_id` + `embed_model_ver` columns; reindex on swap.
3. **Chunking (Brief Q3)** — truncation in v1; chunking deferred.
4. **Long-tier markdown mirror (Brief Q4)** — **rejected**. JSONL export already satisfies R3; mirror would double I/O for no review value.
5. **`memory:gc` semantics (Brief Q5)** — interface-mediated via `MemoryBackend.list()` and `delete()`.
6. **Embedder as sibling interface (Brief Q6 / Security open Q)** — **yes, extracted.** Narrows supply-chain boundary B3.

---

## Decision Record

### 2026-05-25 — Amend hybrid search to ratify RRF

- **Change:** §Hybrid ranking (Stack table) and `memory.search` config block updated to specify **Reciprocal Rank Fusion (RRF)** as the fusion algorithm, replacing the weighted-sum sketch (`1/(1+vec_dist) · 0.7 + bm25(fts) · 0.3`) inherited from Brief §3.
- **Citation:** Cormack, G. V., Clarke, C. L. A., & Büttcher, S. (2009). "Reciprocal rank fusion outperforms Condorcet and individual rank learning methods." *Proceedings of the 32nd International ACM SIGIR Conference on Research and Development in Information Retrieval* (SIGIR '09), pp. 758–759. ACM. DOI: 10.1145/1571941.1572114.
- **Configurable parameter:** `memory.search.rrfK` (default `60`). Per Cormack et al. §3, the algorithm is robust across a wide `k` range; `60` is the canonical default reported in the original paper.
- **Validation path:** Empirical recall@5 measurement is deferred to **#29** (memory bench harness). The ANN evaluation trigger in §NFR appendix continues to gate on `recall@5 < 0.85`; #29 owns the measurement methodology and instrumentation.
- **Rationale:** ADR-impl drift reconciliation. PR #37 shipped RRF as the hybrid-search fusion strategy in `SqliteVecBackend.search()`. The ADR previously described a weighted-sum sketch that was never the intended ranking algorithm at implementation time. This amendment ratifies the shipped behaviour without changing code; PM ruling on Issue #49 selected Option 1 (docs/spec only). RRF is also the simpler interface for the pluggable-backend goal: PgVector and Qdrant adapters can apply RRF post-hoc over native vector/lexical results without sharing a scoring scale.
- **Scope guardrails:** Other ADR sections, the threat model, and code are out of scope per Issue #49. Recall measurement methodology is owned by #29.
- **References:** Issue #49, PR #37 @tech-lead Phase 2 review (ADR-vs-RRF reconciliation item).

---

## References

- Research Brief: `/docs/research/sqlite-vec-memory.md` (commit `f672651`)
- Threat model: `/docs/security/memory-backend-threat-model.md`
- SRE NFR: Issue #25 comment 4532253928
- PO refined AC: Issue #25 comment 4532164305
- PM rulings: Issue #25 comment 4532206525
- Existing memory spec: `/docs/specs/agent-memory.md`
- ADR-0002: `/docs/adr/0002-memory-gc-script.md`
- ADR-0001: `/docs/adr/0001-grant-git-access.md`
- `sqlite-vec` repo: https://github.com/asg017/sqlite-vec
- `sqlite-vec` docs: https://alexgarcia.xyz/sqlite-vec/
- MiniLM-L6-v2: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- transformers.js: https://huggingface.co/docs/transformers.js
- SQLite WAL: https://www.sqlite.org/wal.html
- SQLite FTS5: https://www.sqlite.org/fts5.html
- Cormack, Clarke & Büttcher (2009), "Reciprocal rank fusion outperforms Condorcet and individual rank learning methods," SIGIR '09: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf

---

## Sign-off

- [ ] @po — scope and AC satisfied
- [ ] @tech-lead — architecture and trade-offs (author)
- [ ] @security — 6 security requirements are load-bearing
- [ ] @sre — NFR appendix embedded; `synchronous=NORMAL` and ANN trigger ratified
