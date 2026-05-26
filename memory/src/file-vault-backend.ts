/**
 * FileVaultBackend — MemoryBackend implementation for file-based tiers.
 *
 * Manages `short/` and `forgettable/` tiers as Markdown files with YAML
 * frontmatter under a vault root directory.
 *
 * File layout:
 *   <vaultDir>/<tier>/<name>.md
 *
 * Spec: /docs/specs/agent-memory.md
 * ADR:  /docs/adr/0003-sqlite-vec-memory-backend.md
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { join, resolve, sep } from 'path';
import matter from 'gray-matter';
import type { MemoryBackend, MemoryEntry, SearchHit, SearchOpts, ReindexOpts, MemoryLimits } from './backend.js';
import { validatePutInput, DEFAULT_MEMORY_LIMITS } from './backend.js';

// ─── Backend ────────────────────────────────────────────────────────────────

export class FileVaultBackend implements MemoryBackend {
  /**
   * @param vaultDir  Root directory of the vault (e.g., `.opencode/memory/`).
   *                  Expected to contain subdirectories per tier.
   * @param limits    T-12 input caps enforced by `put()`. Defaults to
   *                  `DEFAULT_MEMORY_LIMITS` (100 KB body, 1024-dim embedding).
   */
  constructor(
    private readonly vaultDir: string,
    private readonly limits: MemoryLimits = DEFAULT_MEMORY_LIMITS,
  ) {}

  // ── put ───────────────────────────────────────────────────────────────

  async put(entry: MemoryEntry, _embedding: Float32Array): Promise<void> {
    validatePutInput(entry, _embedding, this.limits);
    const filePath = this._filePath(entry.name, entry.tier);
    const dir = resolve(filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const frontmatter: Record<string, unknown> = {
      name: entry.name,
      tier: entry.tier,
      kind: entry.kind,
      description: entry.description,
      tags: entry.tags,
      links: entry.links,
      importance: entry.importance,
      created: entry.created,
      updated: entry.updated,
      last_accessed: entry.lastAccessed,
      access_count: entry.accessCount,
    };

    const md = matter.stringify(entry.body, frontmatter);
    this._atomicWrite(filePath, md);
  }

  /**
   * Write `content` to `target` atomically: stage to `<target>.tmp.<pid>`
   * first, then `rename` into place. Atomicity is provided by POSIX
   * `rename(2)` (and Windows `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`),
   * which is a single inode-level operation. A reader will therefore see
   * either the old file, the new file, or no file — never a partial one.
   *
   * If the staged write or rename fails, the temp file is best-effort
   * unlinked before re-throwing so no orphan `.tmp.<pid>` artefacts are
   * left behind. The original error is always propagated unchanged.
   */
  protected _atomicWrite(target: string, content: string): void {
    const tmp = `${target}.tmp.${process.pid}`;
    try {
      writeFileSync(tmp, content, 'utf-8');
      renameSync(tmp, target);
    } catch (err) {
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* swallow */ }
      throw err;
    }
  }

  // ── get ───────────────────────────────────────────────────────────────

  async get(name: string): Promise<MemoryEntry | null> {
    // Search across all tier directories
    for (const tier of this._listTierDirs()) {
      const filePath = this._filePath(name, tier);
      if (existsSync(filePath)) {
        return this._readEntry(filePath);
      }
    }
    return null;
  }

  // ── delete ───────────────────────────────────────────────────────────

  async delete(name: string): Promise<boolean> {
    for (const tier of this._listTierDirs()) {
      const filePath = this._filePath(name, tier);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        return true;
      }
    }
    return false;
  }

  // ── list ─────────────────────────────────────────────────────────────

  async list(
    filter: { tier?: TierList; kind?: KindList },
  ): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];
    const tiers = filter.tier ?? this._listTierDirs();

    for (const tier of tiers) {
      const dir = join(this.vaultDir, tier);
      if (!existsSync(dir)) continue;

      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.md')) continue;
        const filePath = join(dir, file);
        const entry = this._readEntry(filePath);

        if (filter.kind && filter.kind.length > 0 && !filter.kind.includes(entry.kind)) {
          continue;
        }

        entries.push(entry);
      }
    }

    return entries;
  }

  // ── search ───────────────────────────────────────────────────────────

  async search(opts: SearchOpts): Promise<SearchHit[]> {
    const mode = opts.mode ?? 'lexical';
    if (mode === 'vector') return []; // File vault has no vector search

    // Lexical (or hybrid → lexical fallback): case-insensitive substring match
    const query = opts.query.toLowerCase();
    const all = await this.list({});

    const hits: SearchHit[] = [];

    for (const entry of all) {
      const searchable = [entry.name, entry.description, entry.body, ...entry.tags]
        .join(' ')
        .toLowerCase();

      if (searchable.includes(query)) {
        // Simple TF-like score: count occurrences
        const count = searchable.split(query).length - 1;
        hits.push({
          entry,
          score: count / (searchable.length || 1),
          matchedBy: 'lexical',
        });
      }
    }

    // Sort by score descending, limit to k
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, opts.k);
  }

  // ── reindex ──────────────────────────────────────────────────────────

  async reindex(_opts?: ReindexOpts): Promise<void> {
    // No-op: file vault has no indexes to rebuild
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _filePath(name: string, tier: string): string {
    return resolve(join(this.vaultDir, tier, `${name}.md`));
  }

  private _listTierDirs(): string[] {
    if (!existsSync(this.vaultDir)) return [];
    return readdirSync(this.vaultDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  private _readEntry(filePath: string): MemoryEntry {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);

    const fm = parsed.data as Record<string, unknown>;

    return {
      name: fm.name as string,
      tier: fm.tier as MemoryEntry['tier'],
      kind: fm.kind as MemoryEntry['kind'],
      description: fm.description as string,
      body: parsed.content.trim(),
      tags: (fm.tags ?? []) as string[],
      links: (fm.links ?? []) as string[],
      importance: (fm.importance ?? 3) as 1 | 2 | 3 | 4 | 5,
      created: fm.created as string,
      updated: fm.updated as string,
      lastAccessed: (fm.last_accessed ?? fm.updated) as string,
      accessCount: (fm.access_count ?? 0) as number,
    };
  }
}

// ─── Type helpers ───────────────────────────────────────────────────────────

type TierList = MemoryEntry['tier'][];
type KindList = MemoryEntry['kind'][];
