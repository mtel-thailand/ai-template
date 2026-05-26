/**
 * FTS5 query wrapper for safe user-input handling.
 *
 * Per ADR-0003 §"Security requirements" point 5 and threat model T-01:
 * - Phrase-quote user input by default (treats raw input as a literal phrase).
 * - Advanced grammar opt-in with allowlist validation.
 * - Per-query timeout ≤ `search.ftsTimeoutMs` (default 500 ms).
 */

/**
 * Options for building an FTS5 query.
 */
export interface FtsQueryOptions {
  /**
   * When true, permits the full FTS5 grammar with allowlist validation.
   * When false (default), input is phrase-quoted as a single literal.
   */
  advanced?: boolean;

  /**
   * Timeout in milliseconds for the query. Defaults to 500 ms.
   */
  timeoutMs?: number;
}

/**
 * Result of a safe FTS5 query build.
 */
export interface FtsQueryResult {
  /** The safe query string to pass to FTS5 MATCH. */
  query: string;

  /** Whether the input required modification (quoting/filtering). */
  modified: boolean;
}

/**
 * Error thrown when advanced-mode FTS5 grammar validation fails.
 */
export class FtsGrammarError extends Error {
  readonly code = 'FTS_GRAMMAR_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'FtsGrammarError';
  }
}

/**
 * Error thrown when an FTS5 query times out.
 */
export class FtsTimeoutError extends Error {
  readonly code = 'FTS_TIMEOUT_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'FtsTimeoutError';
  }
}

/**
 * FTS5 keyword operators (case-insensitive).
 */
const FTS5_KEYWORDS = new Set(['AND', 'OR', 'NOT', 'NEAR']);

/**
 * Regex for a valid bare term in FTS5 (alphanumeric + underscore + dot + hyphen).
 */
const TERM_RE = /^[a-zA-Z0-9_.-]+$/;

/**
 * Regex for valid column name prefix.
 */
const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Build a safe FTS5 query string from user input.
 *
 * **Default mode (advanced=false):** the entire input is phrase-quoted so that
 * special characters (`"`, `*`, `:`, `NEAR`, parentheses, unmatched quotes) are
 * treated as literal text. Example: `NEAR"hello"` → `"NEAR""hello""`.
 *
 * **Advanced mode (advanced=true):** the input is validated against a grammar
 * allowlist. Any disallowed tokens cause an `FtsGrammarError`. This is NOT a
 * silent fallback — the caller must explicitly opt in and handle the error.
 *
 * @param input - Raw user query string
 * @param options - Query options
 * @returns A safe query string and whether it was modified
 */
export function buildFtsQuery(input: string, options: FtsQueryOptions = {}): FtsQueryResult {
  const { advanced = false } = options;

  if (advanced) {
    // Advanced mode: validate against allowlist, pass through unchanged
    const validated = validateAdvancedQuery(input);
    return { query: validated, modified: false };
  }

  // Default mode: phrase-quote the entire input.
  const quoted = quoteLiteral(input);
  return { query: quoted, modified: true };
}

/**
 * Execute an FTS5 query with a timeout guard.
 *
 * Wraps a user-provided query function with a timeout. If the query exceeds
 * the specified timeout, an `FtsTimeoutError` is thrown.
 *
 * @param queryFn - Async function that performs the FTS5 query
 * @param options - Query options (timeoutMs defaults to 500)
 * @returns The result of the query function
 */
export async function withFtsTimeout<T>(
  queryFn: () => Promise<T>,
  options: FtsQueryOptions = {},
): Promise<T> {
  if (typeof queryFn !== 'function') {
    throw new TypeError('queryFn must be a function');
  }

  const timeoutMs = options.timeoutMs ?? 500;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new FtsTimeoutError(
        `FTS5 query timed out after ${timeoutMs}ms. ` +
        `Try simplifying the query or increasing search.ftsTimeoutMs.`
      ));
    }, timeoutMs);

    queryFn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Safely phrase-quotes a string literal for FTS5.
 * Escapes any internal double-quotes by doubling them (SQLite convention)
 * and wraps the whole string in double-quotes.
 */
function quoteLiteral(input: string): string {
  const escaped = input.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Validate an advanced-mode FTS5 query string against the grammar allowlist.
 *
 * The validator tokenizes the input, recognizes FTS5 grammar constructs
 * (keywords, parentheses, column prefixes, quoted phrases, operators),
 * and rejects any character or structure not on the allowlist.
 *
 * @param input - Raw user query string for advanced mode
 * @returns The validated input (unchanged if valid)
 * @throws FtsGrammarError on any disallowed token
 */
function validateAdvancedQuery(input: string): string {
  // Step 1: Reject control characters
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Allow tab (0x09), reject other control chars (< 0x20) and DEL (0x7F)
    if (code < 0x20 && code !== 0x09) {
      throw new FtsGrammarError(
        `Control character (U+${code.toString(16).padStart(4, '0')}) ` +
        `rejected in advanced FTS5 query at position ${i}.`
      );
    }
    if (code === 0x7f) {
      throw new FtsGrammarError(
        `Control character (U+007F) rejected in advanced FTS5 query at position ${i}.`
      );
    }
  }

  // Step 2: Tokenize, preserving quoted strings
  // We use a stateful tokenizer that handles whitespace, quotes, and parentheses
  const tokens = tokenizeAdvanced(input);

  // Step 3: Validate each token
  for (const token of tokens) {
    validateToken(token);
  }

  return input;
}

/**
 * Tokenize an advanced FTS5 query into individual tokens.
 *
 * Handles:
 * - Whitespace-delimited tokens
 * - Quoted strings ("...") — kept as single tokens with quotes
 * - Parentheses — split into separate tokens
 * - Column prefixes (col:term) — kept as unified tokens
 */
function tokenizeAdvanced(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar: string | null = null;

  const flushToken = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuote) {
      current += ch;
      if (ch === quoteChar) {
        // Check for doubled quotes (escape)
        if (i + 1 < input.length && input[i + 1] === quoteChar) {
          current += input[i + 1];
          i++; // skip next
        } else {
          inQuote = false;
          quoteChar = null;
        }
      }
      continue;
    }

    // Check for quote start
    if (ch === '"') {
      flushToken();
      inQuote = true;
      quoteChar = '"';
      current = '"';
      continue;
    }

    // Parentheses are standalone tokens
    if (ch === '(' || ch === ')') {
      flushToken();
      tokens.push(ch);
      continue;
    }

    // Whitespace — token boundary
    if (/[\s]/.test(ch)) {
      flushToken();
      continue;
    }

    // Regular character — accumulate
    current += ch;
  }

  flushToken();

  return tokens;
}

/**
 * Validate a single FTS5 query token against the grammar allowlist.
 *
 * @throws FtsGrammarError if the token is not allowed
 */
function validateToken(token: string): void {
  // Empty tokens are filtered out by the tokenizer, but guard anyway
  if (token.length === 0) return;

  // Single-character parentheses are always allowed
  if (token === '(' || token === ')') return;

  // If it's a quoted phrase, allow as-is (content inside is literal per FTS5)
  if (token.startsWith('"') && token.endsWith('"')) {
    // A quoted string must be at least 2 characters ("")
    if (token.length >= 2) return;
    throw new FtsGrammarError(
      `Malformed quoted string rejected in advanced FTS5 query: "${token}".`
    );
  }

  // Check for column prefix: `column:term` or `column:`
  // In FTS5, a column prefix can be followed by a term or a quoted phrase
  // that appears as a separate token.
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0) {
    const columnPart = token.slice(0, colonIdx);
    const valuePart = token.slice(colonIdx + 1);

    // Validate column name
    if (!COLUMN_RE.test(columnPart)) {
      throw new FtsGrammarError(
        `Invalid column name "${columnPart}" rejected in advanced FTS5 query: "${token}". ` +
        `Column names must start with a letter or underscore and contain only alphanumeric ` +
        `characters and underscores.`
      );
    }

    // If the value part is empty (e.g., `title:` as a standalone token),
    // it's a valid column prefix — the value follows as the next token
    if (valuePart.length === 0) return;

    // Validate value part (must be a valid term or quoted phrase)
    if (valuePart.startsWith('"') && valuePart.endsWith('"')) {
      if (valuePart.length >= 2) return;
    } else if (TERM_RE.test(valuePart)) {
      return;
    } else {
      throw new FtsGrammarError(
        `Invalid value "${valuePart}" for column "${columnPart}" rejected in advanced FTS5 query.`
      );
    }
    return;
  }

  // Detect leading operator prefixes and trailing wildcard
  const stripped = stripOperators(token);

  // If the base is empty (e.g., just an operator like `+`), it's OK only
  // if the original token is one of the valid prefix operators
  if (stripped.base.length === 0) {
    // Bare operator prefix without a term — only + and - are valid standalone?
    // In FTS5, + and - must precede a term, and ^ must precede a term.
    // A lone `+` or `-` or `^` is not valid FTS5 grammar, so reject.
    throw new FtsGrammarError(
      `Bare operator "${token}" rejected in advanced FTS5 query. ` +
      `Prefix operators (+, -, ^) must be followed by a search term.`
    );
  }

  // Check if the base is a known FTS5 keyword
  if (FTS5_KEYWORDS.has(stripped.base.toUpperCase())) {
    // Keywords are valid as standalone tokens (they act as operators between terms)
    // But validate that they're followed by appropriate operands (done pre-execution)
    return;
  }

  // Check for NEAR/N pattern (e.g., NEAR/5)
  if (/^NEAR\/[1-9]\d*$/i.test(stripped.base)) {
    return;
  }

  // Check for pure wildcard (just `*`) — not valid in FTS5 unless inside a phrase
  if (stripped.base === '*') {
    throw new FtsGrammarError(
      `Bare wildcard "*" rejected in advanced FTS5 query. ` +
      `A prefix wildcard must follow a search term (e.g., "hel*").`
    );
  }

  // Final validation: check that the base is a valid term
  if (!TERM_RE.test(stripped.base)) {
    throw new FtsGrammarError(
      `Disallowed token "${token}" rejected in advanced FTS5 query. ` +
      `Only alphanumeric characters, underscores, dots, and hyphens are permitted ` +
      `in term positions.`
    );
  }
}

/**
 * Result of stripping prefix/suffix operators from a token.
 */
interface StrippedToken {
  /** The base term after removing operators. */
  base: string;
  /** Whether a prefix wildcard was present (* at end). */
  hasWildcard: boolean;
  /** Whether a prefix operator was present (+, -, ^ at start). */
  hasPrefixOp: boolean;
}

/**
 * Strip leading prefix operators (+, -, ^) and trailing wildcard (*) from a token.
 */
function stripOperators(token: string): StrippedToken {
  let base = token;
  let hasPrefixOp = false;
  let hasWildcard = false;

  // Strip leading prefix operator
  if (base.startsWith('+') || base.startsWith('-') || base.startsWith('^')) {
    hasPrefixOp = true;
    base = base.slice(1);
  }

  // Strip trailing wildcard
  if (base.endsWith('*') && base.length > 1) {
    hasWildcard = true;
    base = base.slice(0, -1);
  }

  return { base, hasWildcard, hasPrefixOp };
}
