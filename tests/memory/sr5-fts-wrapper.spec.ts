/**
 * SR5 — FTS5 security wrapper (phrase-quoting, grammar allowlist, timeout).
 *
 * Security requirement:
 *   All FTS5 queries shall default to phrase-quoting of the entire input.
 *   Advanced syntax may be enabled only via FtsQueryOptions.advanced = true,
 *   and such input must pass a grammar allowlist rejecting disallowed tokens.
 *   A per-query timeout of ≤ 500ms shall be enforced.
 *   (Threat model T-07, T-08)
 *
 * This test verifies:
 *   - Default mode wraps entire input in phrase quotes (SQL injection safe).
 *   - Advanced mode rejects suspicious tokens (FtsGrammarError).
 *   - Per-query timeout enforced (FtsTimeoutError).
 *   - Timeout default is 500ms or less.
 *   - Both error types have distinct error codes.
 */
import { describe, it, expect } from 'vitest';

import {
  buildFtsQuery,
  withFtsTimeout,
  FtsGrammarError,
  FtsTimeoutError,
} from '../../src/memory/fts-wrapper.js';

describe('SR5: default phrase-quoting mode', () => {
  it('wraps entire user input in double quotes', () => {
    const result = buildFtsQuery('hello world');
    expect(result.query).toBe('"hello world"');
    expect(result.modified).toBe(true);
  });

  it('prevents FTS5 operator injection', () => {
    // Without quoting, "hello OR world" could be interpreted as an OR query.
    // With quoting, it becomes a literal search for the phrase.
    const result = buildFtsQuery('hello OR world');
    expect(result.query).toBe('"hello OR world"');
  });

  it('prevents column/table prefix injection via colon', () => {
    const result = buildFtsQuery('field:value');
    expect(result.query).toBe('"field:value"');
  });

  it('prevents NEAR operator injection', () => {
    const result = buildFtsQuery('NEAR("hello","world")');
    expect(result.query).toBe('"NEAR(""hello"",""world"")"');
  });

  it('prevents NOT operator injection', () => {
    const result = buildFtsQuery('hello NOT world');
    expect(result.query).toBe('"hello NOT world"');
  });

  it('prevents prefix wildcard injection', () => {
    const result = buildFtsQuery('hel*');
    expect(result.query).toBe('"hel*"');
  });

  it('prevents required/prohibited operator injection', () => {
    expect(buildFtsQuery('+required -prohibited').query).toBe('"+required -prohibited"');
    expect(buildFtsQuery('+hello').query).toBe('"+hello"');
    expect(buildFtsQuery('-goodbye').query).toBe('"-goodbye"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    const result = buildFtsQuery('say "hello" world');
    expect(result.query).toBe('"say ""hello"" world"');
  });
});

describe('SR5: advanced mode grammar allowlist', () => {
  it('allows valid simple terms without modification', () => {
    const result = buildFtsQuery('hello', { advanced: true });
    expect(result.query).toBe('hello');
    expect(result.modified).toBe(false);
  });

  it('allows valid multi-term queries', () => {
    const result = buildFtsQuery('hello world', { advanced: true });
    expect(result.query).toBe('hello world');
  });

  it('allows AND operator', () => {
    const result = buildFtsQuery('hello AND world', { advanced: true });
    expect(result.query).toBe('hello AND world');
  });

  it('allows OR operator', () => {
    const result = buildFtsQuery('hello OR world', { advanced: true });
    expect(result.query).toBe('hello OR world');
  });

  it('allows NOT operator', () => {
    const result = buildFtsQuery('hello NOT world', { advanced: true });
    expect(result.query).toBe('hello NOT world');
  });

  it('allows NEAR operator', () => {
    const result = buildFtsQuery('hello NEAR world', { advanced: true });
    expect(result.query).toBe('hello NEAR world');
  });

  it('allows NEAR with distance parameter', () => {
    const result = buildFtsQuery('hello NEAR/5 world', { advanced: true });
    expect(result.query).toBe('hello NEAR/5 world');
  });

  it('allows quoted phrases in advanced mode', () => {
    const result = buildFtsQuery('"exact phrase"', { advanced: true });
    expect(result.query).toBe('"exact phrase"');
  });

  it('allows parenthesised expressions', () => {
    const result = buildFtsQuery('(hello OR world) AND foo', { advanced: true });
    expect(result.query).toBe('(hello OR world) AND foo');
  });

  it('allows prefix wildcards', () => {
    const result = buildFtsQuery('hel* wor*', { advanced: true });
    expect(result.query).toBe('hel* wor*');
  });

  it('allows required (+) prefix', () => {
    const result = buildFtsQuery('+must -exclude', { advanced: true });
    expect(result.query).toBe('+must -exclude');
  });

  it('allows column prefix', () => {
    const result = buildFtsQuery('title:hello', { advanced: true });
    expect(result.query).toBe('title:hello');
  });

  it('allows column prefix with quoted value', () => {
    const result = buildFtsQuery('title:"hello world"', { advanced: true });
    expect(result.query).toBe('title:"hello world"');
  });
});

describe('SR5: advanced mode — reject invalid grammar', () => {
  it('rejects SQL injection via semicolon', () => {
    expect(() => buildFtsQuery('hello; DROP TABLE entries', { advanced: true }))
      .toThrow(FtsGrammarError);
  });

  it('rejects special characters in terms', () => {
    expect(() => buildFtsQuery('hello!', { advanced: true }))
      .toThrow(FtsGrammarError);
    expect(() => buildFtsQuery('@world', { advanced: true }))
      .toThrow(FtsGrammarError);
    expect(() => buildFtsQuery('foo#bar', { advanced: true }))
      .toThrow(FtsGrammarError);
    expect(() => buildFtsQuery('foo$bar', { advanced: true }))
      .toThrow(FtsGrammarError);
    expect(() => buildFtsQuery('foo%bar', { advanced: true }))
      .toThrow(FtsGrammarError);
  });

  it('rejects attempted escape sequence injection', () => {
    expect(() => buildFtsQuery('\\"', { advanced: true }))
      .toThrow(FtsGrammarError);
  });

  it('rejects control characters in input', () => {
    expect(() => buildFtsQuery('hello\x00world', { advanced: true }))
      .toThrow(FtsGrammarError);
    expect(() => buildFtsQuery('hello\nworld', { advanced: true }))
      .toThrow(FtsGrammarError);
  });

  it('error message clearly indicates the rejected token', () => {
    try {
      buildFtsQuery('hello; DROP TABLE entries', { advanced: true });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FtsGrammarError);
      const msg = (err as FtsGrammarError).message;
      expect(msg).toContain(';');
      expect(msg).toContain('rejected');
    }
  });

  it('FtsGrammarError has correct error code', () => {
    try {
      buildFtsQuery('foo!', { advanced: true });
    } catch (err) {
      expect((err as FtsGrammarError).code).toBe('FTS_GRAMMAR_ERROR');
    }
  });
});

describe('SR5: per-query timeout', () => {
  it('enforces timeout ≤ 500ms by default', async () => {
    // The default timeout must be ≤ 500ms per SR5
    const slowQuery = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return 'slow';
    };

    await expect(
      withFtsTimeout(slowQuery),
    ).rejects.toThrow(FtsTimeoutError);
  });

  it('allows custom timeout value', async () => {
    const fastQuery = async () => 'fast';
    const result = await withFtsTimeout(fastQuery, { timeoutMs: 100 });
    expect(result).toBe('fast');
  });

  it('resolves when query completes within timeout', async () => {
    const result = await withFtsTimeout(
      async () => 'hello',
      { timeoutMs: 500 },
    );
    expect(result).toBe('hello');
  });

  it('rejects with FtsTimeoutError when slow query exceeds timeout', async () => {
    const slowQuery = async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return 'too late';
    };

    await expect(
      withFtsTimeout(slowQuery, { timeoutMs: 50 }),
    ).rejects.toThrow(FtsTimeoutError);
  });

  it('FtsTimeoutError has correct error code', async () => {
    const slowQuery = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return 'too late';
    };

    try {
      await withFtsTimeout(slowQuery, { timeoutMs: 1 });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FtsTimeoutError);
      expect((err as FtsTimeoutError).code).toBe('FTS_TIMEOUT_ERROR');
    }
  });

  it('propagates non-timeout errors from the query', async () => {
    const failingQuery = async () => {
      throw new Error('Database connection lost');
    };

    await expect(
      withFtsTimeout(failingQuery, { timeoutMs: 500 }),
    ).rejects.toThrow('Database connection lost');
  });

  it('does not suppress TypeError from malformed query function', async () => {
    await expect(
      withFtsTimeout(null as unknown as () => Promise<string>),
    ).rejects.toThrow();
  });
});

describe('SR5: buildFtsQuery options validation', () => {
  it('default mode is phrase-quoting (not advanced)', () => {
    const result = buildFtsQuery('hello AND world');
    expect(result.query).toBe('"hello AND world"');
  });

  it('modified flag is true when input was quoted', () => {
    const result = buildFtsQuery('hello world');
    expect(result.modified).toBe(true);
  });

  it('modified flag is false when input unchanged in advanced mode', () => {
    const result = buildFtsQuery('hello', { advanced: true });
    expect(result.modified).toBe(false);
  });
});
