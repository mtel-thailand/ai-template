/**
 * Typed SQLITE_BUSY retry with exponential backoff and full jitter (C4).
 *
 * Jitter range: 50–250 ms exponential with full jitter, max 3 retries.
 *
 * When SQLite returns SQLITE_BUSY (database is locked), the application-level
 * retry logic below attempts the operation up to MAX_RETRIES + 1 times (the
 * initial attempt plus MAX_RETRIES retries) with exponential backoff and full
 * jitter. If all attempts fail, a `MemoryBackendBusyError` is thrown.
 *
 * This is distinct from the built-in `busy_timeout=5000` PRAGMA, which tells
 * SQLite to sleep and retry inside the same call. The application-level retry
 * here catches cases where the internal retry also times out (e.g., contention
 * from multiple processes on WAL mode).
 *
 * @see MemoryBackendBusyError — typed error class in `backend.ts`
 */

import { MemoryBackendBusyError } from './backend.js';

// ─── Constants ──────────────────────────────────────────────────────────────

export const MAX_RETRIES = 3;
export const JITTER_MIN_MS = 50;
export const JITTER_MAX_MS = 250;

// ─── Backoff calculation ────────────────────────────────────────────────────

/**
 * Calculate exponential backoff with full jitter.
 *
 * Formula (full jitter):
 *   delay = random_uniform(JITTER_MIN_MS, min(cap, JITTER_MAX_MS * 2^attempt))
 *
 * This spreads retries to avoid thundering-herd when multiple processes
 * contend for the same SQLite database.
 *
 * @param attempt — zero-based retry attempt index (0 = first retry after initial failure).
 * @returns delay in milliseconds, guaranteed ≥ JITTER_MIN_MS.
 */
export function calculateBackoff(attempt: number): number {
  const base = JITTER_MAX_MS;
  const cap = base * Math.pow(2, attempt);
  const upper = Math.min(cap, 5_000); // hard cap at 5 seconds
  return Math.floor(Math.random() * (upper - JITTER_MIN_MS + 1)) + JITTER_MIN_MS;
}

// ─── Error detection ────────────────────────────────────────────────────────

/**
 * Returns `true` if the given error represents a SQLITE_BUSY condition.
 *
 * Detects by checking either:
 * 1. `err.message` contains the string "SQLITE_BUSY"
 * 2. `err.code` equals "SQLITE_BUSY"
 */
export function isSQLiteBusyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  if (typeof e.message === 'string' && (e.message as string).includes('SQLITE_BUSY')) {
    return true;
  }
  if (e.code === 'SQLITE_BUSY') {
    return true;
  }
  return false;
}

// ─── Retry wrapper ──────────────────────────────────────────────────────────

/**
 * Wrap an async operation with SQLITE_BUSY retry logic.
 *
 * - On success: returns the operation result.
 * - On SQLITE_BUSY: retries up to `MAX_RETRIES` times with jittered backoff.
 * - On other errors: re-throws immediately (no retry).
 * - After exhausting retries: throws `MemoryBackendBusyError` with attempt
 *   count and delay history.
 *
 * @param fn — the operation to execute. Must be an async function.
 * @param context — optional human-readable context for error messages.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<T> {
  let lastError: unknown;
  const delays: number[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isSQLiteBusyError(err)) {
        throw err; // non-busy errors are not retried
      }

      // Back off before the next retry (skip on the final attempt)
      if (attempt < MAX_RETRIES) {
        const delay = calculateBackoff(attempt);
        delays.push(delay);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  const ctx = context ? ` (${context})` : '';
  throw new MemoryBackendBusyError(
    `SQLITE_BUSY after ${MAX_RETRIES} retries${ctx}: ${(lastError as Error)?.message ?? String(lastError)}`,
    MAX_RETRIES,
    delays,
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
