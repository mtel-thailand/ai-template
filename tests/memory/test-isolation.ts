/**
 * test-isolation.ts — MEMORY_DB_PATH cascade for SQLite vault tests
 *
 * Mirrors the MEMORY_ROOT pattern from PR #22:
 *   - Read MEMORY_DB_PATH env var (if set).
 *   - Fall back to a temp directory under os.tmpdir().
 *
 * Exports a `withTestDb` helper that creates an in-memory SQLite database
 * for fast unit tests, and `withTempDb` that creates an on-disk database
 * for integration tests.
 *
 * Usage (unit tests):
 * ```ts
 * import { withTestDb } from './test-isolation';
 * import Database from 'better-sqlite3';
 *
 * withTestDb((db) => {
 *   db.exec('CREATE TABLE test (id INTEGER)');
 *   // ... assertions
 * });
 * ```
 *
 * Usage (integration tests with disk persistence):
 * ```ts
 * import { withTempDb } from './test-isolation';
 *
 * const dbPath = withTempDb((path) => {
 *   const db = new Database(path);
 *   // ... run operations, verify persistence
 * });
 * ```
 */

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Return the path to use for a test SQLite database.
 *
 * Resolution order:
 *   1. `MEMORY_DB_PATH` environment variable
 *   2. Fresh temp directory under os.tmpdir()
 */
export function resolveTestDbPath(): string {
  if (process.env.MEMORY_DB_PATH) {
    return process.env.MEMORY_DB_PATH;
  }
  const dir = mkdtempSync(join(tmpdir(), 'memory-vault-test-'));
  return join(dir, 'memory.db');
}

/**
 * Run a callback with an in-memory SQLite database, then clean it up.
 * Useful for fast unit tests that don't need persistence.
 */
export function withTestDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(':memory:');
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * Create a temp directory with an on-disk SQLite database, run a callback
 * that receives the path, then clean up the directory.
 * Useful for integration tests that need persistence between connections.
 */
export function withTempDb<T>(fn: (dbPath: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'memory-vault-integration-'));
  const dbPath = join(dir, 'memory.db');
  try {
    return fn(dbPath);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Temp clean-up best-effort only
    }
  }
}

/**
 * Run a callback with an on-disk SQLite database opened and closed
 * within the scope.
 */
export function withOpenDb<T>(fn: (db: Database.Database) => T): T {
  return withTempDb((dbPath) => {
    const db = new Database(dbPath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  });
}
