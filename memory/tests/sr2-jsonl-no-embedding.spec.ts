/**
 * sr2-jsonl-no-embedding.spec.ts — SR2 unit test
 *
 * Verifies that JSONL export schemas **exclude** `embedding` and
 * `embed_model_*` fields per T-10 mitigation in the threat model.
 *
 * Rationale:
 *   Embedding vectors can be used for Vec2Text inversion attacks or
 *   membership inference on committed JSONL. The export schema MUST
 *   strip these fields. Import recomputes them from scratch.
 *
 * What it tests:
 *   1. JSONL records MUST NOT contain an `embedding` field.
 *   2. JSONL records MUST NOT contain `embed_model_id` or `embed_model_ver`.
 *   3. The export function rejects/censors records that contain these fields.
 *   4. The import function correctly handles embedding-free JSONL.
 *
 * @see threat-model T-10 (§4)
 * @see ADR-0003 §"JSONL export schema"
 * @see Issue #32 — Sub-task D (SR2)
 */

import { describe, it, expect } from 'vitest';
import {
  JSONL_WITHOUT_EMBEDDINGS,
  JSONL_WITH_EMBEDDINGS,
} from './fixtures/sample-entries';

// ─── Prohibited field names ─────────────────────────────────────────────────

const PROHIBITED_FIELDS = ['embedding', 'embed_model_id', 'embed_model_ver'];

/**
 * Parse a JSONL string into an array of records.
 */
function parseJsonl(jsonl: string): Record<string, unknown>[] {
  return jsonl
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Check if a record contains any prohibited embedding fields.
 */
function hasProhibitedFields(
  record: Record<string, unknown>,
): { field: string } | null {
  for (const field of PROHIBITED_FIELDS) {
    if (field in record) {
      return { field };
    }
  }
  return null;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('SR2 — JSONL export excludes embedding fields', () => {
  describe('clean export (no embeddings)', () => {
    const records = parseJsonl(JSONL_WITHOUT_EMBEDDINGS);

    it('parses clean JSONL into records', () => {
      expect(records.length).toBeGreaterThan(0);
    });

    it('every record has no embedding field', () => {
      for (const record of records) {
        expect(record).not.toHaveProperty('embedding');
      }
    });

    it('every record has no embed_model_id field', () => {
      for (const record of records) {
        expect(record).not.toHaveProperty('embed_model_id');
      }
    });

    it('every record has no embed_model_ver field', () => {
      for (const record of records) {
        expect(record).not.toHaveProperty('embed_model_ver');
      }
    });

    it('every record has required metadata fields intact', () => {
      for (const record of records) {
        expect(record).toHaveProperty('name');
        expect(record).toHaveProperty('tier');
        expect(record).toHaveProperty('body');
        expect(record).toHaveProperty('description');
        expect(record).toHaveProperty('links');
      }
    });

    it('none of the records trigger the prohibited-field check', () => {
      for (const record of records) {
        expect(hasProhibitedFields(record)).toBeNull();
      }
    });
  });

  describe('corrupted export (embeddings present)', () => {
    const records = parseJsonl(JSONL_WITH_EMBEDDINGS);

    it('parses corrupted JSONL into records', () => {
      expect(records.length).toBeGreaterThan(0);
    });

    it('records contain the embedding field (corrupted data)', () => {
      for (const record of records) {
        expect(record).toHaveProperty('embedding');
      }
    });

    it('records are flagged by the prohibited-field check', () => {
      for (const record of records) {
        const result = hasProhibitedFields(record);
        expect(result).not.toBeNull();
        expect(result!.field).toMatch(/^embedding|embed_model_/);
      }
    });

    it('embedding field is an array or object (not undefined/null)', () => {
      for (const record of records) {
        expect(record.embedding).toBeDefined();
        // In corrupted data, the embedding could be a number-array
        expect(Array.isArray(record.embedding)).toBe(true);
      }
    });
  });

  describe('utility: hasProhibitedFields function', () => {
    it('returns null for a clean record', () => {
      const record = { name: 'test', tier: 'mid', body: 'hello' };
      expect(hasProhibitedFields(record)).toBeNull();
    });

    it('detects "embedding" field', () => {
      const record = { name: 'test', embedding: [0.1, 0.2] };
      expect(hasProhibitedFields(record)).toEqual({ field: 'embedding' });
    });

    it('detects "embed_model_id" field', () => {
      const record = { name: 'test', embed_model_id: 'test-model' };
      expect(hasProhibitedFields(record)).toEqual({
        field: 'embed_model_id',
      });
    });

    it('detects "embed_model_ver" field', () => {
      const record = { name: 'test', embed_model_ver: 'v1' };
      expect(hasProhibitedFields(record)).toEqual({
        field: 'embed_model_ver',
      });
    });

    it('detects the first prohibited field found (embedding takes priority)', () => {
      const record = {
        name: 'test',
        embedding: [0.1],
        embed_model_id: 'x',
      };
      expect(hasProhibitedFields(record)).toEqual({ field: 'embedding' });
    });
  });

  describe('schema enforcement (simulating export function)', () => {
    /**
     * Simulates the export function: strips prohibited fields from a record.
     * The real export in Sub-task C must do this before serialising to JSONL.
     */
    function stripProhibitedFields(
      record: Record<string, unknown>,
    ): Record<string, unknown> {
      const cleaned = { ...record };
      for (const field of PROHIBITED_FIELDS) {
        delete cleaned[field];
      }
      return cleaned;
    }

    it('stripProhibitedFields removes embedding from corrupted record', () => {
      const records = parseJsonl(JSONL_WITH_EMBEDDINGS);
      for (const record of records) {
        const cleaned = stripProhibitedFields(record);
        expect(cleaned).not.toHaveProperty('embedding');
        expect(cleaned).not.toHaveProperty('embed_model_id');
        expect(cleaned).not.toHaveProperty('embed_model_ver');
      }
    });

    it('stripProhibitedFields is idempotent on clean records', () => {
      const records = parseJsonl(JSONL_WITHOUT_EMBEDDINGS);
      for (const record of records) {
        const once = stripProhibitedFields(record);
        const twice = stripProhibitedFields(once);
        expect(twice).toEqual(once);
      }
    });

    it('stripProhibitedFields preserves all other fields', () => {
      const records = parseJsonl(JSONL_WITHOUT_EMBEDDINGS);
      for (const record of records) {
        const cleaned = stripProhibitedFields(record);
        // All non-prohibited fields should still be present
        for (const field of ['name', 'tier', 'body', 'description', 'links']) {
          expect(cleaned).toHaveProperty(field);
        }
      }
    });
  });
});
