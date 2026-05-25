---
title: Memory Backend Threat Model — SQLite + sqlite-vec
date: 2026-05-25
author: "@security"
issue: 25
status: draft
related:
  - /docs/research/sqlite-vec-memory.md
  - /docs/specs/agent-memory.md
  - /docs/adr/0003-sqlite-vec-memory-backend.md (pending)
---

> **Status:** Draft for ADR-0003 gate. Methodology: STRIDE applied to the
> data-flow model from Research Brief §1–§8. Scope is the **v1 SQLite +
> sqlite-vec backend on a developer workstation**; production data is
> out of scope and re-triggers the model (see §7).

## 1. Scope

### In scope
- The SQLite vault at `.opencode/memory/memory.db` and its sidecar files (`-wal`, `-shm`, `-journal`).
- The `mid/`, `long/`, `frequent/` tiers served by the SQLite backend.
- The embedder runtime (`@huggingface/transformers` + ONNX weights for `all-MiniLM-L6-v2`).
- The `sqlite-vec` loadable extension binary.
- The JSONL export committed to git (per PM ruling — DB is gitignored, export is the diff surface).
- Hybrid retrieval path: FTS5 `MATCH` + `vec0` `MATCH`.

### Out of scope (explicitly)
- The file vault serving `short/` and `forgettable/` tiers — covered by the existing spec §9–§13 threat posture, unchanged.
- Production deployments storing real customer data — those forks MUST re-run this model per spec §13 Fork Callout.
- Any future memory-rendering UI (see T-13 for the assumption).
- Network-attached vaults (WAL is unsafe over network filesystems — out-of-scope assumption).

## 2. Assets

| Asset | What it is | Why an attacker wants it |
|---|---|---|
| Agent notes (`entries.body`, `entries.description`) | Markdown prose written by agents — design decisions, debugging traces, user preferences, links to issues | Reconstruct project intent, harvest accidentally-stored secrets, plant adversarial instructions |
| Wikilink graph (`entries.links`) | Inter-note edges | Map team workflows; identify high-value notes by centrality |
| Embeddings (`entries_vec.embedding`) | 384-d float32 per entry | Vector-inversion attacks can partially recover source text (Vec2Text); membership inference |
| Frontmatter metadata | Per-entry classification | Importance/access frequency reveals operationally critical notes |
| JSONL export (committed) | Round-trip representation | Same as notes + embeddings, distributed via git |
| Embedder ONNX weights | Local model file | Substitution attack: tampered embedder maps queries to a chosen vector → silent retrieval failure or info leak |
| `sqlite-vec` extension binary | Native loadable extension | Full process privilege if substituted |

## 3. Trust boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  Developer workstation                                              │
│                                                                     │
│  ┌──────────────┐    (B1)    ┌────────────────┐                    │
│  │ Agent process│───────────▶│  memory.db     │                    │
│  │ (npm/CLI)    │            │  + -wal/-shm   │                    │
│  └──────┬───────┘            └────────────────┘                    │
│         │ (B2)                       ▲                              │
│         ▼                            │                              │
│  ┌──────────────┐                   (B1)                            │
│  │ Embedder     │───────────────────┘                              │
│  │ (txjs+ONNX)  │                                                  │
│  └──────────────┘                                                  │
│         │ (B3)                                                      │
│         ▼                                                           │
│  ┌──────────────┐                                                  │
│  │ HF Hub cache │                                                  │
│  └──────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────┘
              │ (B4)                                  │ (B5)
              ▼                                       ▼
       ┌──────────────┐                       ┌──────────────┐
       │ git + CI     │   (JSONL export only) │ Downstream   │
       │ (memory:lint)│──────────────────────▶│ forks        │
       └──────────────┘                       └──────────────┘
```

- **B1** — Agent process ↔ DB file. OS file-system permissions only.
- **B2** — Embedder runtime ↔ DB. Embedder produces a vector; agent writes.
- **B3** — Embedder ↔ HF Hub. First-use download; cache-hit dormant.
- **B4** — CI ↔ JSONL export. CI does not read `.db`.
- **B5** — Downstream forks ↔ committed JSONL.

## 4. Threats

| # | Threat | STRIDE | L | I | Mitigation | Owner |
|---|---|---|---|---|---|---|
| T-01 | FTS5 `MATCH` grammar abuse → syntax error or pathological query plan | T, D | M | M | Phrase-quote user input by default; advanced grammar opt-in + allowlist validation; per-query timeout ≤ 500 ms; parameter binding always | tech-lead, security |
| T-02 | Prompt injection stored in `entries.body` (R1) | T, E | H | H | Spec §12 R1 unchanged: agents surface actionable content for explicit user confirmation. Reaffirm in role prompts | all agents, security |
| T-03 | Secret / PII leakage in body/description (R2) | I | M | H | Spec §9–§10 ban retained. New: `npm run memory:lint` scans JSONL export with secrets-ban regex set; CI-enforced. R3 reviewer §11 applies to JSONL diffs | devops, security |
| T-04 | Accidental commit of `.db` or sidecar files | I | M | H | `.gitignore` covers `*.db`, `*.db-wal`, `*.db-shm`, `*.db-journal`; CI guard fails PR on staged `.db*` | devops, tech-lead |
| T-05 | npm supply-chain compromise of `@huggingface/transformers` or `sqlite-vec` | T, E | L | H | Exact-version pin; `npm audit` blocks high/critical; Renovate PRs get explicit security review (no auto-merge) | devops, security |
| T-06 | HF Hub model substitution / tampered ONNX weights | T | L | H | Pin model `revision` to commit SHA. SHA-256 of ONNX in `embeddings.lock`; first-use verification fail-closed | tech-lead, security |
| T-07 | `sqlite-vec` extension binary tampered | T, E | L | Critical | Pin npm version; SHA-256 per platform binary in `sqlite-vec.lock`; `load_extension` wrapper fail-closed | tech-lead, security |
| T-08 | Cross-process write contention → `SQLITE_BUSY` → write loss | D | L | M | WAL + `busy_timeout=5000`; jittered backoff retry (max 3); `put()` idempotent on `name` | tech-lead |
| T-09 | `vec0` lacks UPDATE; delete-then-insert window leaves orphans on crash | T, D | L | M | Wrap both ops in single SQLite transaction. `memory:gc` orphan-repair pass | tech-lead |
| T-10 | Embedding inversion / membership inference on committed JSONL (Vec2Text) | I | L | L (v1) / M (fork w/ customer data) | **JSONL export schema MUST exclude `embedding`** and `embed_model_*` cols. Recomputed at import. CI-tested. Non-negotiable | tech-lead, security |
| T-11 | `.db` leak via stolen laptop / backup / malware | I | L | L (v1) | OS disk encryption (FileVault / LUKS / BitLocker). §13 Fork Callout triggers SQLCipher re-eval | security (residual) |
| T-12 | DoS via oversize body or pathological vector input | D | L | L | Hard cap `entries.body` ≤ 64 KB at `put()`. Validate vector dim == 384; reject clearly | tech-lead |
| T-13 | Stored XSS / markdown injection in future UI | T | n/a (v1) | H (future) | **Out of scope for v1** — no UI. Future UI MUST escape + sanitise. Re-opens on UI ticket | deferred |
| T-14 | Repudiation of writes — no per-agent audit log | R | L | L | Accepted residual. Git history attributes JSONL/file-vault changes | accepted |
| T-15 | Spoofing between agent roles (shared vault) | S | L | L | Accepted residual per spec §8. Re-opens if per-role ACL is introduced | accepted |

## 5. Controls inventory

### Existing (retained)
- Spec §9 secret ban; §10 prohibited content list; §11 R3 reviewer; §12 R1 untrusted input; §13 Fork Callout.
- OS full-disk encryption (team baseline).
- Parameterised SQL discipline.
- `npm audit` in CI; Dependabot/secret/code-scanning alerts.

### New (this backend)
1. `.gitignore` globs: `*.db`, `*.db-wal`, `*.db-shm`, `*.db-journal`.
2. CI guard: fail PR on staged `.opencode/memory/**/*.db*`.
3. `npm run memory:lint` — secrets-ban regex over JSONL export, CI-enforced.
4. JSONL export schema **excludes embeddings + embed_model_* columns**. Unit test verifies.
5. `embeddings.lock` — committed SHA-256 manifest for ONNX. First-use verified.
6. `sqlite-vec.lock` — committed SHA-256 manifest per platform. Verified before `sqlite3_load_extension`.
7. FTS5 wrapper: phrase-quote by default; advanced opt-in with grammar validation; per-query timeout 500 ms.
8. WAL + `busy_timeout=5000` + transaction-wrapped vec0 delete-then-insert.
9. Hard cap on `entries.body` (≤ 64 KB); strict vector-dim validation at `put()`.
10. `memory:gc` orphan-repair pass.

## 6. Residual risk register

| Risk | Disposition | Rationale |
|---|---|---|
| Prompt injection via stored body (T-02) | **Accept** | Inherent to LLM agents; R1 is best available. Same as file vault. |
| `.db` leak → embedding inversion (T-10/T-11) | **Transfer** to OS disk encryption | Developer notes, not customer data. SQLCipher disproportionate. §13 re-triggers. |
| Repudiation / spoofing in squad (T-14, T-15) | **Accept** | Shared-vault model explicit in §8. |
| Future UI (T-13) | **Avoid** for v1; **re-trigger** on UI ticket | No UI exists. |
| Embedder cache poisoning via local malware | **Accept** | Same malware has full process privilege; `embeddings.lock` raises bar; sealed-storage out of scope. |

### On SQLCipher (v1 non-adoption)

Sound for v1 with §5 controls enforced. Asset class is developer notes under explicit secrets ban — exactly the data prohibited. Realised threats (prompt injection, accidental commit, supply chain) are not addressed by at-rest encryption. CE is GPL-conditioned; optimised paywalled; incompatible with `better-sqlite3` bundled binary; key management is a new operational burden. Re-eval on §13 Fork Callout for production-data forks.

## 7. Re-trigger criteria

Re-run when **any** of:
1. §13 Fork Callout activates (customer data / PII).
2. Embeddings move off-host (cloud embedder).
3. Memory-rendering UI added (T-13 re-opens).
4. `sqlite-vec` reaches v1.0 or ANN gates engage (T-07 re-eval).
5. Multi-host / networked vault proposed (T-08 invalidated).
6. Embedder runtime changes (GPU / WebGPU / different ONNX runtime).
7. New agent role gains write access or per-agent ACLs introduced.
8. Cross-fork data sharing pattern emerges.

## 8. References

- Research Brief — `/docs/research/sqlite-vec-memory.md`
- Agent memory spec — `/docs/specs/agent-memory.md` §8–§13
- ADR-0003 — `/docs/adr/0003-sqlite-vec-memory-backend.md`
- SQLite WAL — https://www.sqlite.org/wal.html
- SQLite FTS5 — https://www.sqlite.org/fts5.html
- sqlite-vec docs — https://alexgarcia.xyz/sqlite-vec/
- OWASP A03:2021, A05:2021, A06:2021, A08:2021
- Morris, Kuleshov et al., *Text Embeddings Reveal (Almost) As Much As Text* (Vec2Text)