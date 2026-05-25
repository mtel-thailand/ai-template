---
title: SQLite + sqlite-vec as Default Memory Backend
date: 2026-05-25
author: "@researcher"
issue: 25
status: draft
---

> **Status:** Draft — gates ADR-0003. Tech Lead, Security, SRE, and PO must
> acknowledge the Recommendation in their sign-off comments per the
> design-gate binding rule.

## Executive Summary

1. **Backend:** Adopt `sqlite-vec` (`v0.1.9`, Apache-2.0/MIT, pure C, zero
   dependencies) for the `mid/`, `long/`, and `frequent/` tiers. File vault
   stays for `short/` and `forgettable/`. **Confidence: Medium-High** —
   sqlite-vec is pre-v1 and the author warns of breaking changes, but the
   project is Mozilla Builders–sponsored, actively maintained (last release
   `v0.1.10-alpha.4`, 18 May 2026), and has displaced its predecessor
   `sqlite-vss` (now archived).
2. **Embedding default:** `sentence-transformers/all-MiniLM-L6-v2`
   (Apache-2.0, 384 dim, 22.7M params, ~80 MB FP32 / ~25 MB INT8) run via
   `transformers.js` (Hugging Face official, MIT, ONNX Runtime CPU backend).
   It is the smallest, most-deployed model in its accuracy class and ships
   official ONNX weights. **Confidence: High.**
3. **Schema:** `entries` row table + `vec0(embedding float[384])` virtual
   table + FTS5 contentless-delete table over the same rowid space, with a
   `WHERE distance < t` filter combined with `bm25(fts) DESC` for hybrid
   ranking. **Confidence: Medium-High.**
4. **Storage policy:** the SQLite file lives at
   `.opencode/memory/memory.db`, **gitignored**, per-project. A portable
   JSONL export round-trips with the file vault for git-visible review and
   for cross-machine seed. **Confidence: High.**
5. **Security posture:** SQLCipher is **not adopted now**. It is heavy
   (vendor-pay for the optimised build, CE is GPL-conditioned), and the
   existing secrets ban + R3 reviewer obligation already prevents the
   class of data that would require encryption-at-rest. Re-evaluate on
   the §13 "Fork Callout" path. **Confidence: Medium.**

---

## 1. `sqlite-vec` — Maturity, License, Distribution, Semantics

**Verdict:** Adopt. Pin to `v0.1.9` (latest stable) until `v1.0`. Track the
`v0.1.10` ANN line but **do not depend on ANN features** in the initial
implementation.

| Property | Value |
|---|---|
| Latest stable | `v0.1.9` (2026-03-31) |
| Latest alpha | `v0.1.10-alpha.4` (2026-05-18) — introduces DiskANN/IVF |
| License | Apache-2.0 OR MIT (dual) |
| Language | Pure C, no dependencies |
| Sponsor | Mozilla Builders; Fly.io, Turso, SQLite Cloud, Shinkai |
| Stars | ~7.6k |
| Distribution | npm (`sqlite-vec`), PyPI, RubyGems, Cargo, Go, Datasette |
| Vector types | `float[N]`, `int8[N]`, `bit[N]` (binary) |
| Query semantics | Default = **exhaustive (flat) KNN** via `MATCH` operator |
| ANN | Pre-release in `v0.1.10-alpha.1+` (DiskANN, IVF — experimental) |
| Distance | L2 (default for float), cosine (via normalisation), Hamming (binary) |
| Storage | Chunked shadow tables; reads stream chunk-by-chunk — does **not** require holding all vectors in RAM |
| Max dimensions | No documented hard cap; constrained by row/page memory. **Recommend ≤ 1024.** |
| Stability warning | "`sqlite-vec` is a pre-v1, so expect breaking changes!" (verbatim, repo README) |

**Production maturity (Medium-High):** The project is healthy by every
public signal (active releases, sponsored, broad bindings) but the pre-v1
disclaimer is load-bearing. The `v0.1.7` release notes describe a return
from hiatus and an explicit roadmap. Any production adoption should pin to
an exact version, vendor the loadable extension binary in the build, and
hold an upgrade kata in CI.

**Alternatives considered:**

- **`sqlite-vss`** — author-deprecated. Repo README: *"`sqlite-vss` is
  not in active development. Instead, my effort is now going towards
  `sqlite-vec`."* Faiss-bound, 1 GB index cap, Linux/Mac only, in-memory.
  **Reject.**
- **`usearch`** — fast, header-only HNSW, but standalone (not a SQLite
  extension) and would require a parallel persistence layer. Loses the
  "everything in one file" property that justifies the SQLite choice.
  **Reject for v1; revisit if ANN becomes mandatory.**
- **Pure SQL + BLOB columns + linear scan** — viable up to ~500 entries
  and is essentially the §5 "Default" flow in the current memory spec. Past
  that the manual cosine in SQL becomes slow and noisy. **Reject as
  default backend; retain as conceptual fallback.**

**Sources:** [SVEC-REPO], [SVEC-RELEASES], [SVEC-DOCS], [SVEC-BLOG], [SVSS-REPO].

---

## 2. Local Embedding Model

**Verdict:** Default to **`sentence-transformers/all-MiniLM-L6-v2`** (384
dim). Document **`BAAI/bge-small-en-v1.5`** (384 dim) as a swap-compatible
quality upgrade.

### Recommended model

| Property | Value |
|---|---|
| Name | `sentence-transformers/all-MiniLM-L6-v2` |
| Dimensions | **384** |
| Params | 22.7M (~80 MB FP32, ~25 MB INT8 ONNX) |
| License | Apache-2.0 |
| MTEB avg | 56.26 (small-tier baseline) |
| Sequence cap | 256 word-pieces (truncates beyond) |
| ONNX weights | Yes, official on the HF hub |
| Apple Silicon | Runs on CPU via ONNX Runtime; ARM64 wheels exist; CoreML EP available |
| x86 | Native ONNX Runtime CPU |
| Downloads (HF, last month) | 259.7 M — most-deployed sentence-encoder in its class |

### Why MiniLM and not the better-scoring options

| Model | Dim | Params | MTEB | License | Verdict |
|---|---:|---:|---:|---|---|
| **all-MiniLM-L6-v2** | 384 | 22.7M | 56.26 | Apache-2.0 | **Default.** Tiny, ubiquitous, ONNX-ready. |
| BGE-small-en-v1.5 | 384 | 33.4M | **62.17** | MIT | **Documented upgrade.** Same dim → no schema change. ~+6 MTEB. Larger weights. Requires query-prefix instruction. |
| GTE-small | 384 | 33.4M | 61.36 | MIT | Roughly equivalent to BGE-small; weaker community tooling than BGE. |
| nomic-embed-text-v1.5 | 768 (Matryoshka 64/128/256/512/768) | ~137M | 62.28 @ 768 / 61.96 @ 512 | Apache-2.0 | **Defer.** 768 dim doubles index size; Matryoshka is appealing but adds operational complexity. Revisit when long-context (8192 tok) becomes a requirement. |

The MiniLM verdict prioritises **footprint, schema stability, and "boring
choice" effects** over a ~6-point MTEB delta. The memory subsystem is not
performing open-domain retrieval — it is indexing a small, curated vault.
The quality difference at our scale (≤ 500 notes initially, per spec §5)
is below the recall noise floor. If empirical recall@5 drops below the
spec's 0.85 trigger, swap to BGE-small — **same dimension, no migration**.

### Runtime: `transformers.js`

| Property | Value |
|---|---|
| Package | `@huggingface/transformers` |
| License | Apache-2.0 (Hugging Face official) |
| Backend | ONNX Runtime (WASM/CPU; optional WebGPU) |
| Quantization | fp32 / fp16 / q8 / q4 |
| Node + browser | Both |
| Maintenance | Active (HF first-party) |

**Alternative rejected:** `fastembed-js` — **archived 2026-01-15** by its
maintainer, repo now read-only. Last release `v2.1.0` (2025-12-15).
Adopting it would inherit deprecated code on day one.

**Why local-only, not OpenAI/Voyage/Cohere:** the memory subsystem is a
shared developer vault; an embeddings-as-a-service dependency adds a
network leg, a billing surface, and (per existing R1 untrusted-input rule
and §9 secrets ban) an exfiltration path for any text mistakenly stored.

**Apple Silicon vs x86 note:** all four candidate models ship ONNX
weights and run on CPU via ONNX Runtime; no platform splits. WebGPU is
*not* a goal for this backend — agents run server-side / CLI-side.

**Sources:** [MINILM-CARD], [BGE-CARD], [GTE-CARD], [NOMIC-CARD],
[TXJS-DOCS], [FASTEMBED-ARCHIVED].

---

## 3. Schema Design

**Verdict:** Three tables — one row table, one `vec0` virtual table, one
FTS5 contentless-delete table — all keyed by the same INTEGER PRIMARY KEY
("entry_id"). Hybrid search composes vector top-K with FTS5 BM25 in a
single SQL query.

### DDL sketch (illustrative — not for direct paste)

```sql
-- 1. Canonical row table
CREATE TABLE entries (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,         -- slug; matches MEMORY.md
  tier            TEXT NOT NULL CHECK (tier IN
                    ('short','mid','long','frequent','forgettable')),
  kind            TEXT NOT NULL CHECK (kind IN
                    ('working','episodic','semantic','procedural')),
  body            TEXT NOT NULL,                -- markdown body
  description     TEXT NOT NULL,
  tags            TEXT NOT NULL,                -- JSON array
  links           TEXT NOT NULL,                -- JSON array of wikilinks
  importance      INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  created         TEXT NOT NULL,                -- ISO-8601 date
  updated         TEXT NOT NULL,
  last_accessed   TEXT NOT NULL,
  access_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX entries_tier_idx ON entries (tier, last_accessed);

-- 2. Vector index — sqlite-vec virtual table
CREATE VIRTUAL TABLE entries_vec USING vec0 (
  id INTEGER PRIMARY KEY,
  embedding float[384]                          -- MiniLM dim
);

-- 3. Lexical index — FTS5, external content over entries
CREATE VIRTUAL TABLE entries_fts USING fts5 (
  name, description, body, tags,
  content='entries', content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);

-- Triggers to keep FTS in sync (vector sync is application-side
-- because embedding is an out-of-DB computation)
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

### Hybrid search query (sketch)

```sql
WITH knn AS (
  SELECT id, distance
  FROM entries_vec
  WHERE embedding MATCH :query_vec AND k = 50
),
lex AS (
  SELECT rowid AS id, bm25(entries_fts) AS bm
  FROM entries_fts WHERE entries_fts MATCH :query_text LIMIT 50
)
SELECT e.id, e.name, e.description,
       COALESCE(knn.distance, 1e9) AS vec_dist,
       COALESCE(lex.bm, 0)         AS lex_score
FROM entries e
LEFT JOIN knn ON knn.id = e.id
LEFT JOIN lex ON lex.id = e.id
WHERE knn.id IS NOT NULL OR lex.id IS NOT NULL
ORDER BY (1.0 / (1.0 + vec_dist)) * 0.7 + lex_score * 0.3 DESC
LIMIT :k;
```

The vector weight / lexical weight (0.7 / 0.3 above) is a **knob, not a
constant**. Tech Lead to decide whether weights are configurable per
deployment or fixed in the implementation ticket.

**Why FTS5 external-content over contentless:** keeps `entries` as the
single source of truth and avoids the contentless-table delete pitfalls
documented in the FTS5 spec (§4.4.4.1). The "external content table
pitfalls" section is a real footgun — the trigger pattern above is the
sanctioned workaround.

**Sources:** [SVEC-DOCS], [FTS5-DOCS].

---

## 4. Migration from File Vault

**Verdict:** **One-shot import** (no dual-read window), invoked via
`npm run memory:import`, idempotent on the `name` slug, with a JSONL
export reversal path.

### Rationale

- Existing vault is small (≤ 200 entries per spec §4 budget). Dual-read
  complexity is not justified by the size of the corpus.
- The file vault has the **canonical schema** (`/docs/specs/agent-memory.md`
  §3). The SQLite row schema is a 1:1 superset — every YAML field maps to
  a column.
- **Conflict resolution:** `name` is the unique key. If the SQLite row
  already exists, the importer uses `updated` (file) vs `updated`
  (database) — **most-recent wins**, with the loser archived to
  `.opencode/memory/conflicts/<name>.<date>.md` for human review.
- **Idempotency:** import is `INSERT … ON CONFLICT(name) DO UPDATE` for
  rows, plus a delete-then-insert on the vec0 row (sqlite-vec does not
  support `UPDATE` on `vec0` virtual tables — verified against repo TODOs;
  this is a known sqlite-vec quirk).
- **Embedding step:** the importer computes embeddings during import. On a
  laptop CPU with MiniLM-L6-v2, expect ~80–150 short notes/second
  (published `all-MiniLM-L6-v2` throughput on commodity x86 CPU; Apple
  M-class is comparable). 200-entry import: < 10 s.
- **Rollback:** the importer never deletes file-vault content. It writes
  to the database only. If the implementation is faulty, `rm memory.db`
  is the rollback. To revert after the file vault has been retired in a
  future ticket, run the JSONL export (§5) and re-materialise to
  `.opencode/memory/{mid,long,frequent}/<name>.md`.

### Migration script contract (out of scope to implement)

```
# Dry-run mode validates schema and reports counts; no writes.
npm run memory:import -- --dry-run

# Actual import. Reads .opencode/memory/{mid,long,frequent}/*.md.
# Skips short/ and forgettable/ (per spec — they remain file-vault).
npm run memory:import

# Reverse direction: dump SQLite back to file-vault layout.
npm run memory:export -- --tier=long --format=jsonl > memory.jsonl
```

**Source:** spec §3, §4. No external sources required — derived from
existing schema.

---

## 5. Backup & Portability

**Verdict:** SQLite file is **per-project, gitignored**, at
`.opencode/memory/memory.db`. A periodic JSONL export is committed and
diff-able. Re-creation from JSONL is one command.

### Why gitignored, not committed

- **Binary churn.** Every read updates `last_accessed`/`access_count`,
  producing a new file blob on every commit. Even with no schema change,
  diffs are useless. Reviewer obligation (R3 in spec §11) requires
  *human-readable* diffs to scan for prohibited content — binary makes
  this impossible.
- **Concurrency.** A committed `.db` would mean every PR rebases produce
  merge conflicts on the binary. There is no satisfying resolution
  strategy for binary merge conflicts.
- **Privacy posture.** The Fork Callout (spec §13) tells projects with
  real customer data to consider gitignoring `long/`. Going binary-by-default
  + JSONL export-for-diff makes that posture *the default* for the SQLite
  case.

### Disk size estimate (10 k entries, 384-dim float32)

| Component | Per entry | 10 k total |
|---|---:|---:|
| float32 vector (384 × 4 B) | 1 536 B | ~15.4 MB |
| sqlite-vec chunk overhead | ~10% | ~1.5 MB |
| `entries` row (avg 1 KB body) | ~1.0 KB | ~10 MB |
| FTS5 index | ~30% of body | ~3 MB |
| Indexes / SQLite overhead | — | ~3 MB |
| **Total** | — | **~30–35 MB** |

For the template's default budget (long-tier cap of 200 entries per spec
§4), the database is **well under 1 MB**. The 10 k figure is a stress
scenario for downstream forks.

**Int8 quantization** (Matryoshka or post-hoc) shrinks vectors 4× to
~4 MB at 10 k entries — worth offering as a `--quantize=int8` config knob
if size becomes a concern.

**Sources:** spec §11, §13; arithmetic.

---

## 6. Concurrency

**Verdict:** Enable WAL mode at first open. Set `busy_timeout = 5000`.
Treat all writes as serialised through a single application-layer
mutex/queue per process. Multi-process write contention is **possible but
rare** in the squad model and acceptable to retry.

### Behaviour summary (from SQLite WAL docs)

- WAL: **readers do not block writers, writers do not block readers**.
- But: **only one writer at a time** across all connections to the file.
- WAL **does not work over network filesystems** — all readers/writers
  must be on the same host. Not a concern for `.opencode/memory/`.
- Certain operations return `SQLITE_BUSY` even in WAL mode (last
  connection closing, recovery after crash, exclusive locking). All
  callers must retry on `SQLITE_BUSY` — `busy_timeout` handles this
  transparently up to the timeout window.

### Multi-agent reality

In the squad model, each agent process opens its own connection. Writes
come from:
1. The agent appending a memory after a turn (rare, one write).
2. The `memory:gc` script (batched, scheduled).
3. The migration importer (one-shot).

Contention scenarios are limited to (1)+(2) overlap, which is unlikely
and recoverable. **No additional locking layer is needed.**

### Recommended pragmas

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;        -- faster, durable across crashes
PRAGMA busy_timeout = 5000;         -- ms
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
```

**Source:** [SQLITE-WAL].

---

## 7. Security

**Verdict:** **Do not adopt SQLCipher in v1.** Rely on the existing
secrets ban (spec §9–10), R3 reviewer obligation (§11), R1 untrusted-input
rule (§12), parameterised queries everywhere, and OS disk encryption
(FileVault / LUKS / BitLocker) which is already mandatory on team laptops
per the existing security baseline.

### Why not SQLCipher

| Factor | Detail |
|---|---|
| License (Community) | BSD-style — but the optimised builds, value-level encryption, performance counters, and pre-built packages are paywalled (Commercial: $999+/yr per vendor page). |
| Build complexity | Drop-in API-compatible with SQLite, but requires linking against a custom SQLite build — incompatible with the `better-sqlite3` npm distribution's bundled binary. |
| Perf cost (CE) | Vendor markets Commercial as "up to 4× faster than Community" — implies CE has measurable overhead, exact baseline not published. |
| Key management | A new burden: who holds the DB key, where, with what rotation policy. Out of scope for a template repo. |
| Threat model fit | The vault holds developer notes, not customer data. AES-at-rest is the wrong control for the actual risk (accidental commit, prompt injection). |

If a downstream fork stores production data, the §13 Fork Callout already
mandates re-running the threat model — SQLCipher (or git-crypt) goes in
that conversation, not this one.

### Vector queries as untrusted input (R1)

Query vectors come from agent-generated text. The `MATCH` operator only
accepts a vector literal or named parameter — there is no SQL injection
surface in `WHERE embedding MATCH :q`. **All vector queries MUST use
parameter binding**, never string interpolation. Same rule for FTS5 MATCH
expressions, where a malformed expression can be a syntax error or, more
seriously, a denial-of-service via expensive query plans. Implementation
must validate the FTS5 query string against a permitted-grammar subset
before executing.

### Secrets ban enforcement

The existing pre-commit secret-scrub hook (TBD per spec §9) covers
file-vault writes. Equivalent hook for the SQLite path: a `memory:lint`
check that scans `entries.body` and `entries.description` with the same
regex set, runnable in CI on the JSONL export from §5.

**Sources:** [SQLCIPHER-VENDOR], spec §9–§13.

---

## 8. Backend Interface

**Verdict:** Define a narrow, six-method `MemoryBackend` interface.
Implementations: `SqliteVecBackend` (default), `FileVaultBackend`
(existing, for `short/` and `forgettable/`), plus stub points for
`PgVectorBackend`, `QdrantBackend`, `ChromaBackend`. **Per-tier
configurable** in `opencode.json`.

### Interface sketch (signatures only, not implementation)

```ts
interface MemoryEntry {
  name: string;                 // slug, unique within vault
  tier: 'short'|'mid'|'long'|'frequent'|'forgettable';
  kind: 'working'|'episodic'|'semantic'|'procedural';
  description: string;
  body: string;
  tags: string[];
  links: string[];              // wikilinks
  importance: 1|2|3|4|5;
  created: string;              // ISO-8601 date
  updated: string;
  lastAccessed: string;
  accessCount: number;
}

interface SearchHit {
  entry: MemoryEntry;
  score: number;                // backend-normalised, higher = more relevant
  matchedBy: 'vector'|'lexical'|'hybrid';
}

interface MemoryBackend {
  // CRUD
  put(entry: MemoryEntry): Promise<void>;
  get(name: string): Promise<MemoryEntry | null>;
  delete(name: string): Promise<boolean>;
  list(filter: { tier?: string; kind?: string }): Promise<MemoryEntry[]>;

  // Retrieval
  search(opts: {
    query: string;              // natural language; backend handles embedding
    k: number;
    tier?: string[];            // restrict
    mode?: 'vector'|'lexical'|'hybrid';
  }): Promise<SearchHit[]>;

  // Maintenance
  reindex(): Promise<void>;     // recompute embeddings, FTS index
}
```

The interface deliberately **does not expose** embedding model choice,
distance metric, or schema. Those are implementation concerns. A Postgres
+ pgvector backend would compute embeddings the same way and serve the
same six methods.

### Configuration schema (sketch, ADR to ratify)

```jsonc
{
  "memory": {
    "backends": {
      "short":       { "type": "file" },
      "forgettable": { "type": "file" },
      "mid":         { "type": "sqlite-vec",
                       "path": ".opencode/memory/memory.db" },
      "long":        { "type": "sqlite-vec",
                       "path": ".opencode/memory/memory.db" },
      "frequent":    { "type": "sqlite-vec",
                       "path": ".opencode/memory/memory.db" }
    },
    "embeddings": {
      "model": "Xenova/all-MiniLM-L6-v2",
      "dim": 384,
      "runtime": "transformers.js"
    }
  }
}
```

---

## Recommended stack

| Layer | Choice |
|---|---|
| Storage extension | `sqlite-vec` v0.1.9 (pinned) |
| SQLite driver (Node) | `better-sqlite3` (sync, loadable-extension support) |
| Vector type | `float[384]` (MiniLM); upgrade path to `int8[384]` quantised |
| Lexical index | FTS5 external-content, `porter unicode61 remove_diacritics 2` |
| Hybrid ranking | Weighted sum of `1/(1+vec_dist)` and `bm25` (weights TBD by Tech Lead) |
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` (default), `BAAI/bge-small-en-v1.5` (documented upgrade) |
| Embedding runtime | `@huggingface/transformers` (transformers.js), ONNX Runtime CPU |
| Tier mapping | file: `short`, `forgettable` · SQLite: `mid`, `long`, `frequent` |
| Concurrency | WAL + `busy_timeout=5000` + `synchronous=NORMAL` |
| DB location | `.opencode/memory/memory.db` — **gitignored** |
| Diff/review surface | JSONL export, committed periodically, scanned by `memory:lint` |
| Encryption | None in v1; OS disk encryption + §9 secrets ban only |

---

## Open questions for @tech-lead

1. **ANN gate.** What corpus size / recall floor triggers a move from
   flat KNN to DiskANN/IVF in `sqlite-vec` v0.1.10-line? Define the
   trigger explicitly so the team is not tempted by ANN-shaped curiosity
   while ANN is still alpha.
2. **Embedding swap policy.** When (and how) does the team swap from
   MiniLM to BGE-small? Same dim → no migration, but `last_accessed`
   semantics change subtly because BGE distances are bounded differently.
   Either (a) make the model a deployment knob and accept distance
   incompatibility across forks, or (b) write distances as
   `model_id`-tagged and let the retrieval layer enforce.
3. **Chunking ownership.** The spec body is markdown. Long entries
   exceed MiniLM's 256-tokeniser cap. Does the backend chunk and store
   one row per chunk (with `parent_name` linkage), or does it accept
   truncation and treat that as the user's problem? Recommendation:
   **truncation in v1**, chunking in a follow-up ticket once corpus
   characteristics are observed.
4. **Long-tier markdown mirror.** Should `long/` keep a markdown-on-disk
   mirror for git diffability (mirroring §11 reviewer obligation) even
   when SQLite is the authoritative store? My recommendation is **yes**,
   write-through on `put()` for `long` only, but this doubles the I/O.
5. **`memory:gc` semantics.** Issue #25 acceptance criteria explicitly
   asks for `memory:gc`'s role in the SQLite world. Concretely:
   does GC run SQL `DELETE`s against `entries` (with vec0 + FTS triggers
   following) and `VACUUM` periodically? Or does it operate purely as a
   policy enforcer and emit `delete` requests through the backend
   interface? My recommendation is the latter (interface-mediated) to
   keep `memory:gc` backend-agnostic.
6. **Backend interface ownership of embedding generation.** Interface
   §8 places embedding computation inside `search()`/`put()`. Alternative:
   embedding is a separate pipeline component that hands a vector to the
   backend. This affects whether `PgVectorBackend` can reuse the
   transformers.js code path. Recommendation: extract `Embedder` as a
   sibling interface so backend ≠ embedder; this is a one-line interface
   change but a meaningful architecture call.

---

## Sources

| Tag | Title | URL |
|---|---|---|
| SVEC-REPO | asg017/sqlite-vec — README | https://github.com/asg017/sqlite-vec |
| SVEC-RELEASES | sqlite-vec releases | https://github.com/asg017/sqlite-vec/releases |
| SVEC-DOCS | sqlite-vec documentation site | https://alexgarcia.xyz/sqlite-vec/ |
| SVEC-BLOG | "I'm writing a new vector search SQLite Extension" — Alex Garcia, May 2024 | https://alexgarcia.xyz/blog/2024/building-new-vector-search-sqlite/index.html |
| SVSS-REPO | asg017/sqlite-vss — README (deprecation notice) | https://github.com/asg017/sqlite-vss |
| MINILM-CARD | sentence-transformers/all-MiniLM-L6-v2 model card | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 |
| BGE-CARD | BAAI/bge-small-en-v1.5 model card | https://huggingface.co/BAAI/bge-small-en-v1.5 |
| GTE-CARD | thenlper/gte-small model card | https://huggingface.co/thenlper/gte-small |
| NOMIC-CARD | nomic-ai/nomic-embed-text-v1.5 model card | https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 |
| TXJS-DOCS | Transformers.js documentation | https://huggingface.co/docs/transformers.js/en/index |
| FASTEMBED-ARCHIVED | Anush008/fastembed-js (archived 2026-01-15) | https://github.com/Anush008/fastembed-js |
| SQLITE-WAL | SQLite Write-Ahead Logging spec | https://www.sqlite.org/wal.html |
| FTS5-DOCS | SQLite FTS5 Extension | https://www.sqlite.org/fts5.html |
| SQLCIPHER-VENDOR | SQLCipher product page (Zetetic) | https://www.zetetic.net/sqlcipher/ |
| SPEC | Agent memory specification (this repo) | /docs/specs/agent-memory.md |
