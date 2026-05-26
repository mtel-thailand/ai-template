/**
 * MemoryBackend interface and shared types for the agent memory subsystem.
 *
 * Spec: /docs/specs/agent-memory.md
 * ADR:  /docs/adr/0003-sqlite-vec-memory-backend.md
 */

// ─── Enums / literal unions ────────────────────────────────────────────────

export type Tier = 'short' | 'mid' | 'long' | 'frequent' | 'forgettable';
export type Kind = 'working' | 'episodic' | 'semantic' | 'procedural';

// ─── Data types ─────────────────────────────────────────────────────────────

export interface MemoryEntry {
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

export interface SearchHit {
  entry: MemoryEntry;
  score: number;
  matchedBy: 'vector' | 'lexical' | 'hybrid';
  vectorDistance?: number;
  lexicalScore?: number;
}

export interface SearchOpts {
  query: string;
  embedding?: Float32Array;
  k: number;
  tier?: Tier[];
  mode?: 'vector' | 'lexical' | 'hybrid';
  timeoutMs?: number;
}

export interface ReindexOpts {
  tier?: Tier[];
  embedder?: Embedder;
}

// ─── Backend interface ──────────────────────────────────────────────────────

export interface MemoryBackend {
  put(entry: MemoryEntry, embedding: Float32Array): Promise<void>;
  get(name: string): Promise<MemoryEntry | null>;
  delete(name: string): Promise<boolean>;
  list(filter: { tier?: Tier[]; kind?: Kind[] }): Promise<MemoryEntry[]>;
  search(opts: SearchOpts): Promise<SearchHit[]>;
  reindex(opts?: ReindexOpts): Promise<void>;
}

// ─── Embedder interface ─────────────────────────────────────────────────────

export interface Embedder {
  readonly modelId: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

// ─── Error types ────────────────────────────────────────────────────────────

/**
 * Typed, distinguishable error raised when `SQLITE_BUSY` is returned after
 * exhausting all application-level retries (C4).
 *
 * Callers (including `memory:gc`) can differentiate transient contention
 * from corruption by catching `MemoryBackendBusyError`.
 *
 * Jitter range: 50–250 ms exponential with full jitter, max 3 retries.
 * See `sqlite-retry.ts` for the retry implementation.
 */
export class MemoryBackendBusyError extends Error {
  public readonly name = 'MemoryBackendBusyError';

  /**
   * @param message  Human-readable description.
   * @param attempts Number of retry attempts made before giving up.
   * @param delays   Actual delay values (ms) used between retries, for diagnostics.
   */
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly delays: number[],
  ) {
    super(message);
    Object.setPrototypeOf(this, MemoryBackendBusyError.prototype);
  }

  /** Total elapsed time of all retry attempts (ms). */
  get retryAfterMs(): number {
    return this.delays.reduce((a, b) => a + b, 0);
  }
}

// ─── Input limits / validation (T-12) ───────────────────────────────────────

/**
 * Caps that `MemoryBackend.put()` enforces before any persistence path.
 *
 * Defaults mitigate T-12 (resource exhaustion via oversized inputs) per
 * ADR-0003. Backends accept an override via constructor opts to support
 * deployment-specific limits.
 */
export interface MemoryLimits {
  maxBodyBytes: number;
  maxEmbeddingDim: number;
}

export const DEFAULT_MEMORY_LIMITS: Readonly<MemoryLimits> = Object.freeze({
  maxBodyBytes: 102_400, // 100 KB
  maxEmbeddingDim: 1024,
});

/**
 * Typed error raised when `MemoryBackend.put()` receives an entry whose
 * body or embedding exceeds the configured caps. `field` identifies the
 * specific offender so callers can act on the cause.
 */
export class MemoryBackendInputError extends Error {
  public readonly name = 'MemoryBackendInputError';

  constructor(
    message: string,
    public readonly field: 'body' | 'embedding',
  ) {
    super(message);
    Object.setPrototypeOf(this, MemoryBackendInputError.prototype);
  }
}

/**
 * Validate `put()` input against `MemoryLimits`. Backends must call this
 * before any persistence path so oversized entries never reach storage.
 */
export function validatePutInput(
  entry: MemoryEntry,
  embedding: Float32Array,
  limits: MemoryLimits = DEFAULT_MEMORY_LIMITS,
): void {
  const bodyBytes = Buffer.byteLength(entry.body, 'utf-8');
  if (bodyBytes > limits.maxBodyBytes) {
    throw new MemoryBackendInputError(
      `body exceeds maxBodyBytes (${bodyBytes} > ${limits.maxBodyBytes})`,
      'body',
    );
  }
  if (embedding.length > limits.maxEmbeddingDim) {
    throw new MemoryBackendInputError(
      `embedding exceeds maxEmbeddingDim (${embedding.length} > ${limits.maxEmbeddingDim})`,
      'embedding',
    );
  }
}
