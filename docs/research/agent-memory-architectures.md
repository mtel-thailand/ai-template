# Research Brief — LLM Agent Memory Architectures

**Question:** What does industry standard look like for tiered, markdown-vault agent memory, and what should we recommend to the Tech Lead drafting an ADR?

---

## 1. Landscape scan

| System | Memory model | Storage | Retrieval | Eviction |
|---|---|---|---|---|
| **MemGPT / Letta** (Packer et al., 2023) | OS-inspired: "main context" (in-window) + "external context" (recallable); agent uses tool calls to page in/out | Postgres + pgvector (Letta); originally SQLite | Function-call self-directed search (semantic + recency) | Agent decides; summarised on overflow |
| **mem0** | Two-tier: short-term (working) + long-term (facts extracted from conversation by LLM) | Vector store + optional graph (Neo4j) | Hybrid: semantic + graph traversal | LLM-driven dedup/update; no automatic TTL |
| **Zep** (Graphiti) | Temporal knowledge graph of episodes → semantic nodes | Postgres + Neo4j-like graph | Hybrid: BM25 + semantic + graph + temporal edges | Edge invalidation on contradiction; nothing deleted, marked stale |
| **A-Mem** (Xu et al., 2024) | Zettelkasten-inspired: atomic notes that auto-link to related notes | Vector store + linked-note graph | Semantic + link traversal | Notes evolved (rewritten) when linked, never explicitly evicted |
| **LangChain memory** | Pluggable: BufferMemory, BufferWindow, Summary, SummaryBuffer, VectorStoreRetriever, Entity, KG | Whatever store user wires | Per-class (window / summary / vector) | Window size or summarisation threshold |
| **LlamaIndex memory** | `ChatMemoryBuffer`, `VectorMemory`, `ChatSummaryMemoryBuffer`, `SimpleComposableMemory` | Pluggable | Token-budget aware buffer + vector recall | Token-budget eviction; summarisation |
| **Anthropic memory tool** (claude.ai, 2025) | File-based: model reads/writes files in a `/memories` directory via tool calls | Plain files on Anthropic infra | Model lists/reads files itself; no embeddings | Model deletes; user can clear |
| **Cursor project rules** | Static instruction packs scoped by glob; not "memory" in the dynamic sense | `.cursor/rules/*.mdc` + legacy `.cursorrules` | Auto-attach by file glob, manual, or "agent-requested" | Human-edited only |
| **Claude Code auto-memory** | Typed markdown notes (user / feedback / project / reference) with frontmatter + `[[links]]` + `MEMORY.md` index | `~/.claude/.../memory/*.md` | LLM reads MEMORY.md index, decides which files to open | Manual update/delete; staleness check before use |
| **Obsidian + Dataview** | Human knowledge vault; not LLM-native | Markdown + YAML | Dataview SQL-ish queries over frontmatter + links; full-text via plugin | Human only |

## 2. Canonical taxonomy

Cognitive science (Tulving, Baddeley) maps imperfectly onto agent tiers. The honest mapping:

| Cog-sci term | What it is | User's tier | Notes |
|---|---|---|---|
| Working memory | Active context window | **short** | Bounded by token limit, not policy |
| Episodic | Time-stamped events ("what happened") | **mid** | Per-session/per-project transcripts, decisions |
| Semantic | Distilled facts ("what is true") | **long** | User profile, project invariants |
| Procedural | How-to / skills | overlaps **long** + **frequent** | Skills are mostly static; could live as `frequent` if used every turn |
| (none — pragmatic) | Hot cache | **frequent-access** | Engineering construct, not a cog-sci tier |
| (none — pragmatic) | Scratch / ephemeral | **forgettable** | TTL'd notes; conflict-resolution drafts |

**Recommended naming:** keep the user's five user-facing labels but tag them in frontmatter with the cog-sci primary so retrieval policies can key off either. Example: `tier: short` + `kind: working`.

## 3. Tier semantics — opinionated

| Tier | Scope | Write authority | Retention | Promote → | Demote → | Budget |
|---|---|---|---|---|---|---|
| short | Session | Agent (auto) | End-of-session purge | `mid` if referenced ≥2× or user marks "keep" | — | ≤ 4 KB / session |
| mid | Project | Both | 30-day sliding TTL since `last_accessed`; summarised on TTL | `long` if referenced across ≥3 sessions OR `importance ≥ 4` | `forgettable` on TTL miss | ≤ 50 entries / project |
| long | Project or global | User-confirmed for global, agent for project | None; manual prune | `frequent` if `access_count ≥ N` in 7 days | `mid` if not read in 90 days | ≤ 200 entries |
| frequent-access | Any | Auto (derived) | Recomputed daily | — | `long` when access rate drops | ≤ 20 entries, always loaded |
| forgettable | Session or project | Either | 7-day TTL, hard-delete | `mid` if explicitly pinned before TTL | (deleted) | unbounded but TTL'd |

## 4. Retrieval

| Mechanism | Latency | Quality | Deps | Markdown-vault fit |
|---|---|---|---|---|
| Keyword (ripgrep / BM25) | ms | Good for known terms, poor for paraphrase | None / `tantivy` | Excellent — zero infra |
| Semantic (embeddings + vector store) | 10s–100s ms | Best for paraphrase | Embedding model + vector DB (sqlite-vss, LanceDB, Chroma) | Adds a binary index alongside markdown |
| Hybrid (RRF of BM25 + vector) | as above | SOTA for general retrieval | Both | Recommended upgrade path |
| Graph (link traversal) | ms | Best for "related to X" navigation | None if links are in markdown | Native to Obsidian / `[[wikilinks]]` |

**Default recommendation:** **MEMORY.md index + ripgrep + wikilink traversal**. Zero-dependency, git-diffable, model-readable, matches Claude Code's existing pattern. **Upgrade path:** add sqlite-vss + BGE-small/all-MiniLM-L6-v2 when corpus exceeds ~500 notes.

## 5. File format conventions

**Minimum frontmatter:**
```yaml
---
name: kebab-case-slug
description: one-line hook
tier: short|mid|long|frequent|forgettable
kind: working|episodic|semantic|procedural
created: 2026-05-25
updated: 2026-05-25
last_accessed: 2026-05-25
access_count: 0
importance: 1-5
tags: [auth, infra]
links: [[other-note]]
---
```

**Linking:** `[[wikilink]]` inline. **Index:** `MEMORY.md` as a 1-line-per-entry pointer file, ≤ 200 lines, always loaded.

## 6. Eviction & forgetting

| Pattern | Where seen | Mechanism |
|---|---|---|
| Hard TTL | mem0 (optional) | Delete on `now - created > T` |
| Sliding TTL on `last_accessed` | MemGPT recall storage | Delete on `now - last_accessed > T` |
| LRU / LFU | Classic caches | Rank by access; trim tail |
| Importance-weighted decay | Generative Agents (Park et al., 2023) | `score = w_recency·e^(-λΔt) + w_importance + w_relevance` |
| Summarisation-on-evict | LangChain SummaryBuffer | Compress N → 1, keep in next tier |
| Mark-stale (no delete) | Zep / Graphiti | Edge invalidation; history preserved |

**Recommendation:** `forgettable` = hard TTL · `mid` = sliding TTL + summarise-on-evict into `long` · `frequent-access` = LFU window, recomputed nightly via script.

## 7. Security & privacy

| Control | Source |
|---|---|
| Pattern-based scrub on write (regex for AWS/GCP keys, JWTs, emails) | trufflehog patterns |
| Allowlist of frontmatter fields the agent may write | Anthropic memory tool guidance |
| `.gitignore` the memory dir, or sign commits as a separate identity | Git hygiene |
| Per-tier authority (user-confirm before global writes) | Claude Code pattern |

**Threat headlines:** prompt-injection-induced exfiltration; cross-project leakage; supply-chain via third-party MCPs.

## 8. Recommended opinionated stack

**File layout:**
```
.opencode/memory/
├── MEMORY.md
├── frequent/*.md
├── long/*.md
├── mid/*.md
├── short/*.md       (gitignored)
└── forgettable/*.md (gitignored)
```

Retrieval: `MEMORY.md` + ripgrep + wikilinks. Upgrade: sqlite-vss + BGE-small when corpus > 500. Eviction defaults per §3 table. Frontmatter per §5. Runtime deps: zero. Script deps: `gray-matter`, `zod`.

## 9. Open questions for the design gate

(All resolved during the gate — see ADR/test-plan/threat-model/NFR comments on Issue #15.)

---

**Sources**
- MemGPT — Packer et al., arXiv:2310.08560 (2023); https://docs.letta.com
- mem0 — https://docs.mem0.ai
- Zep / Graphiti — https://help.getzep.com ; https://github.com/getzep/graphiti
- A-Mem — Xu et al., arXiv:2502.12110 (2024)
- LangChain — https://python.langchain.com/docs/versions/migrating_memory/
- LlamaIndex — https://docs.llamaindex.ai/en/stable/module_guides/deploying/agents/memory/
- Anthropic memory tool — https://www.anthropic.com/news/memory (2025)
- Cursor — https://docs.cursor.com/context/rules
- Generative Agents — Park et al., arXiv:2304.03442 (2023)
- Obsidian — https://help.obsidian.md
