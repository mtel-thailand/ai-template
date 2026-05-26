import { describe, it, expect, vi } from 'vitest';
import {
  buildFtsQuery,
  withFtsTimeout,
  FtsGrammarError,
  FtsTimeoutError,
} from './fts-wrapper.js';

describe('buildFtsQuery — default phrase-quoting mode', () => {
  it('wraps plain text in double quotes', () => {
    const result = buildFtsQuery('hello world');
    expect(result.query).toBe('"hello world"');
    expect(result.modified).toBe(true);
  });

  it('handles input containing double quotes by escaping them', () => {
    const result = buildFtsQuery('say "hello"');
    // Internal double-quotes are doubled per SQLite convention
    expect(result.query).toBe('"say ""hello"""');
    expect(result.modified).toBe(true);
  });

  it('handles input containing asterisk', () => {
    const result = buildFtsQuery('foo*bar');
    expect(result.query).toBe('"foo*bar"');
    expect(result.modified).toBe(true);
  });

  it('handles input containing colon', () => {
    const result = buildFtsQuery('field:value');
    expect(result.query).toBe('"field:value"');
    expect(result.modified).toBe(true);
  });

  it('handles input containing NEAR keyword', () => {
    const result = buildFtsQuery('NEAR("hello","world")');
    expect(result.query).toBe('"NEAR(""hello"",""world"")"');
    expect(result.modified).toBe(true);
  });

  it('handles input containing parentheses', () => {
    const result = buildFtsQuery('(foo OR bar)');
    expect(result.query).toBe('"(foo OR bar)"');
    expect(result.modified).toBe(true);
  });

  it('handles unmatched double quotes', () => {
    const result = buildFtsQuery('unmatched " quotes');
    expect(result.query).toBe('"unmatched "" quotes"');
    expect(result.modified).toBe(true);
  });

  it('handles empty string', () => {
    const result = buildFtsQuery('');
    expect(result.query).toBe('""');
    expect(result.modified).toBe(true);
  });

  it('handles special FTS5 operators as literal text', () => {
    const inputs = [
      'hello AND world',
      'hello OR world',
      'hello NOT world',
      'hello NEAR/5 world',
      '+required',
      '-prohibited',
      'prefix*',
      '^boost',
    ];

    for (const input of inputs) {
      const result = buildFtsQuery(input);
      // All should be phrase-quoted as a single literal
      expect(result.query).toBe(`"${input.replace(/"/g, '""')}"`);
      expect(result.modified).toBe(true);
    }
  });
});

describe('buildFtsQuery — advanced mode with allowlist', () => {
  it('passes through valid simple terms unchanged', () => {
    const result = buildFtsQuery('hello world', { advanced: true });
    expect(result.query).toBe('hello world');
    expect(result.modified).toBe(false);
  });

  it('passes through valid FTS5 grammar', () => {
    const result = buildFtsQuery('hello AND world', { advanced: true });
    expect(result.query).toBe('hello AND world');
    expect(result.modified).toBe(false);
  });

  it('allows OR operator', () => {
    const result = buildFtsQuery('foo OR bar', { advanced: true });
    expect(result.query).toBe('foo OR bar');
  });

  it('allows NOT operator', () => {
    const result = buildFtsQuery('foo NOT bar', { advanced: true });
    expect(result.query).toBe('foo NOT bar');
  });

  it('allows NEAR operator', () => {
    const result = buildFtsQuery('hello NEAR world', { advanced: true });
    expect(result.query).toBe('hello NEAR world');
  });

  it('allows parenthesised groups', () => {
    const result = buildFtsQuery('(hello OR world) AND foo', { advanced: true });
    expect(result.query).toBe('(hello OR world) AND foo');
  });

  it('allows prefix wildcards', () => {
    const result = buildFtsQuery('hel* world', { advanced: true });
    expect(result.query).toBe('hel* world');
  });

  it('allows required (+) and prohibited (-) prefixes', () => {
    const result = buildFtsQuery('+required -prohibited', { advanced: true });
    expect(result.query).toBe('+required -prohibited');
  });

  it('allows quoted phrases in advanced mode', () => {
    const result = buildFtsQuery('"hello world" foo', { advanced: true });
    expect(result.query).toBe('"hello world" foo');
  });

  it('rejects invalid tokens with FtsGrammarError (not silent fallback)', () => {
    // SQL injection attempt via FTS5
    expect(() => buildFtsQuery('foo; DROP TABLE entries', { advanced: true }))
      .toThrow(FtsGrammarError);
  });

  it('rejects tokens with special characters in term position', () => {
    expect(() => buildFtsQuery('foo@bar', { advanced: true }))
      .toThrow(FtsGrammarError);
    expect(() => buildFtsQuery('foo!bar', { advanced: true }))
      .toThrow(FtsGrammarError);
  });

  it('allows alphanumeric terms with dots and hyphens', () => {
    const result = buildFtsQuery('foo.bar baz-qux', { advanced: true });
    expect(result.query).toBe('foo.bar baz-qux');
  });
});

describe('withFtsTimeout', () => {
  it('resolves with the query result when under timeout', async () => {
    const result = await withFtsTimeout(
      async () => 'query result',
      { timeoutMs: 500 },
    );
    expect(result).toBe('query result');
  });

  it('rejects with FtsTimeoutError when query exceeds timeout', async () => {
    const slowQuery = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'too late';
    };

    await expect(
      withFtsTimeout(slowQuery, { timeoutMs: 50 }),
    ).rejects.toThrow(FtsTimeoutError);
  });

  it('uses default timeout of 500ms when not specified', async () => {
    const fastQuery = async () => 'ok';
    const result = await withFtsTimeout(fastQuery);
    expect(result).toBe('ok');
  });

  it('rejects with original error when query fails before timeout', async () => {
    const failingQuery = async () => {
      throw new Error('DB error');
    };

    await expect(
      withFtsTimeout(failingQuery, { timeoutMs: 500 }),
    ).rejects.toThrow('DB error');
  });

  it('timeout error has the correct error code', async () => {
    const slowQuery = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return 'too late';
    };

    try {
      await withFtsTimeout(slowQuery, { timeoutMs: 10 });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FtsTimeoutError);
      expect((err as FtsTimeoutError).code).toBe('FTS_TIMEOUT_ERROR');
    }
  });

  it('grammar error has the correct error code', () => {
    try {
      buildFtsQuery('foo;bar', { advanced: true });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FtsGrammarError);
      expect((err as FtsGrammarError).code).toBe('FTS_GRAMMAR_ERROR');
    }
  });
});
