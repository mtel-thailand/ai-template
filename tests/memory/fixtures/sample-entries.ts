/**
 * sample-entries.ts — Test fixtures for memory backend tests.
 *
 * Provides pre-built entry objects matching the MemoryEntry interface
 * from src/memory/backend.ts.
 */

import type { MemoryEntry } from '../../../src/memory/backend.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a deterministic 384-d float32 vector. */
export function makeVector(seed: number): Float32Array {
  const vec = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    vec[i] = Math.sin(seed * (i + 1)) * 0.5;
  }
  return vec;
}

/** Generate a deterministic 384-d plain number array. */
export function makeNumberVector(seed: number): number[] {
  return Array.from(makeVector(seed));
}

// ── Tier constants ──────────────────────────────────────────────────────────

export const TIERS = ['mid', 'long', 'frequent'] as const;

// ── Single-entry fixtures ───────────────────────────────────────────────────

export const SAMPLE_ENTRY_MID: MemoryEntry = {
  name: 'arch-decision-001',
  tier: 'mid',
  kind: 'semantic',
  description: 'ADR-0003: sqlite-vec memory backend',
  body: '# Architecture Decision: Use SQLite + sqlite-vec\n\nWe chose SQLite with the sqlite-vec extension for vector search.',
  tags: ['architecture', 'adr', 'sqlite'],
  links: ['docs/adr/0003-sqlite-vec-memory-backend.md'],
  importance: 5,
  created: '2026-05-25T00:00:00.000Z',
  updated: '2026-05-25T00:00:00.000Z',
  lastAccessed: '2026-05-25T00:00:00.000Z',
  accessCount: 1,
};

export const SAMPLE_ENTRY_LONG: MemoryEntry = {
  name: 'team-workflow-agreement',
  tier: 'long',
  kind: 'semantic',
  description: 'Universal workflow contract',
  body: '# Team Workflow\n\nAll agents follow the workflow contract in `.opencode/agents/_workflow.md`.',
  tags: ['workflow', 'agreement'],
  links: ['.opencode/agents/_workflow.md'],
  importance: 4,
  created: '2026-05-20T00:00:00.000Z',
  updated: '2026-05-20T00:00:00.000Z',
  lastAccessed: '2026-05-24T00:00:00.000Z',
  accessCount: 3,
};

export const SAMPLE_ENTRY_FREQUENT: MemoryEntry = {
  name: 'current-sprint-goals',
  tier: 'frequent',
  kind: 'working',
  description: 'Sprint 12 goals',
  body: '# Sprint Goals\n\nComplete the sqlite-vec memory backend (Issue #32).',
  tags: ['sprint', 'goals'],
  links: [],
  importance: 3,
  created: '2026-05-22T00:00:00.000Z',
  updated: '2026-05-25T00:00:00.000Z',
  lastAccessed: '2026-05-25T00:00:00.000Z',
  accessCount: 5,
};

// ── Multi-entry fixture ─────────────────────────────────────────────────────

export const ALL_SAMPLE_ENTRIES: MemoryEntry[] = [
  SAMPLE_ENTRY_MID,
  SAMPLE_ENTRY_LONG,
  SAMPLE_ENTRY_FREQUENT,
];

// ── JSONL fixtures (for SR2 export tests) ───────────────────────────────────

/**
 * JSONL string that matches the export schema — **embeddings excluded**.
 * This is what the actual export produces per T-10 mitigation.
 * Fields absent: embedding, embed_model_id, embed_model_ver.
 */
export const JSONL_WITHOUT_EMBEDDINGS: string = [
  {
    name: 'arch-decision-001',
    tier: 'mid',
    kind: 'semantic',
    body: '# Architecture Decision: Use SQLite + sqlite-vec\n\nWe chose SQLite with the sqlite-vec extension for vector search.',
    description: 'ADR-0003: sqlite-vec memory backend',
    tags: ['architecture', 'adr', 'sqlite'],
    links: ['docs/adr/0003-sqlite-vec-memory-backend.md'],
    importance: 5,
    created: '2026-05-25T00:00:00.000Z',
    updated: '2026-05-25T00:00:00.000Z',
    lastAccessed: '2026-05-25T00:00:00.000Z',
    accessCount: 1,
  },
  {
    name: 'team-workflow-agreement',
    tier: 'long',
    kind: 'semantic',
    body: '# Team Workflow\n\nAll agents follow the workflow contract in `.opencode/agents/_workflow.md`.',
    description: 'Universal workflow contract',
    tags: ['workflow', 'agreement'],
    links: ['.opencode/agents/_workflow.md'],
    importance: 4,
    created: '2026-05-20T00:00:00.000Z',
    updated: '2026-05-20T00:00:00.000Z',
    lastAccessed: '2026-05-24T00:00:00.000Z',
    accessCount: 3,
  },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

/**
 * JSONL string that **incorrectly includes** embedding fields.
 * The SR2 test verifies that the export/import pipeline rejects or strips these.
 */
export const JSONL_WITH_EMBEDDINGS: string = [
  {
    name: 'arch-decision-001',
    tier: 'mid',
    kind: 'semantic',
    body: '# Architecture Decision',
    description: 'test',
    tags: [],
    links: [],
    importance: 3,
    created: '2026-05-25T00:00:00.000Z',
    updated: '2026-05-25T00:00:00.000Z',
    lastAccessed: '2026-05-25T00:00:00.000Z',
    accessCount: 0,
    embedding: makeNumberVector(1),
    embed_model_id: 'Xenova/all-MiniLM-L6-v2',
    embed_model_ver: 'v1.0',
  },
].map((e) => JSON.stringify(e)).join('\n') + '\n';
