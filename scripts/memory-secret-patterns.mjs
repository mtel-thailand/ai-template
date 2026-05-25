#!/usr/bin/env node

/**
 * memory-secret-patterns.mjs — Secret/PII scanning patterns for memory vault
 *
 * Reference threat-model T-03 (Secret / PII leakage, R2):
 *   /docs/security/memory-backend-threat-model.md
 *
 * Pattern changes require security review (locked artifact per @security C8).
 *
 * Exports:
 *   PATTERNS  — Read-only array of pattern definitions
 *   scan()    — Scan text for secret/PII matches
 *
 * #28 (memory:lint) imports this module. Sub-task B (lefthook hook) also
 * imports it. Contract is locked — see issue #33.
 *
 * @module memory-secret-patterns
 */

// ─── Pattern Definitions ──────────────────────────────────────────────────────
// Each pattern is an object with:
//   id          — kebab-case unique identifier
//   severity    — 'block' (always on) | 'block-strict' (only with strict=true)
//   category    — 'secret' | 'pii'
//   regex       — RegExp to match against full text
//   description — Human-readable description
//   examples    — { positive: [strings], negative: [strings] }

/**
 * @typedef {Object} PatternDef
 * @property {string} id
 * @property {'block'|'block-strict'} severity
 * @property {'secret'|'pii'} category
 * @property {RegExp} regex
 * @property {{positive: string[], negative: string[]}} examples
 * @property {string} description
 */

/**
 * @typedef {Object} ScanMatch
 * @property {string} patternId
 * @property {number} line      — 1-indexed
 * @property {number} column    — 1-indexed
 * @property {string} snippet   — trimmed window around the match
 */

/** @type {PatternDef[]} */
export const PATTERNS = Object.freeze([
  // ── block severity (always active) ─────────────────────────────────

  {
    id: "aws-access-key",
    severity: "block",
    category: "secret",
    regex: /AKIA[0-9A-Z]{16}/,
    examples: {
      positive: ['AKIA' + '0'.repeat(16)],
      negative: ['AKIASHORT'],
    },
    description: "AWS access key ID (AKIA prefix + 16 alphanumeric chars)",
  },

  {
    id: "github-classic-pat",
    severity: "block",
    category: "secret",
    regex: /gh[poausr]_[A-Za-z0-9]{36,}/,
    examples: {
      positive: ['ghp_' + 'X'.repeat(40)],
      negative: ['ghp_tooshort'],
    },
    description: "GitHub classic personal access token / OAuth / server token",
  },

  {
    id: "github-pat-fine-grained",
    severity: "block",
    category: "secret",
    regex: /github_pat_[A-Za-z0-9_]{82,}/,
    examples: {
      positive: ['github_pat_' + 'X'.repeat(84)],
      negative: ['github_pat_short'],
    },
    description: "GitHub fine-grained personal access token (CRITICAL — same format as this repo's GITHUB_PAT)",
  },

  {
    id: "google-api-key",
    severity: "block",
    category: "secret",
    regex: /AIza[0-9A-Za-z\-_]{35}/,
    examples: {
      positive: ['AIza' + '0'.repeat(35)],
      negative: ['AIzashort'],
    },
    description: "Google API key (AIza prefix + 35 chars)",
  },

  {
    id: "gcp-service-account-json",
    severity: "block",
    category: "secret",
    regex: /"type"\s*:\s*"service_account"[\s\S]{0,1000}"private_key"\s*:\s*"/,
    examples: {
      positive: [
        '{"type":"service_account","project_id":"my-project","private_key_id":"000000","private_key":"----BEGIN FAKE KEY-----\nFAKE\n-----END FAKE KEY-----"}',
      ],
      negative: [
        '{"type":"service_account","project_id":"my-project"}',
      ],
    },
    description: "GCP service account JSON key (type=service_account with private_key nearby)",
  },

  {
    id: "stripe-live-secret",
    severity: "block",
    category: "secret",
    regex: /sk_live_[0-9a-zA-Z]{24,}/,
    examples: {
      positive: ['sk_live_' + '0a1b2c3d4e5f6g7h8i9j0k1l'],
      negative: ['sk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'],
    },
    description: "Stripe live secret key (sk_live_)",
  },

  {
    id: "stripe-live-publishable",
    severity: "block",
    category: "secret",
    regex: /pk_live_[0-9a-zA-Z]{24,}/,
    examples: {
      positive: ['pk_live_' + '0a1b2c3d4e5f6g7h8i9j0k1l'],
      negative: ['pk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'],
    },
    description: "Stripe live publishable key (pk_live_)",
  },

  {
    id: "slack-webhook-url",
    severity: "block",
    category: "secret",
    regex: /https?:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]{20,}/,
    examples: {
      positive: ['https://' + 'hooks.slack.com' + '/services/T00/B00/XXXX/YYYY/ZZZZ'],
      negative: ['https://hooks.slack.com/not-a-webhook'],
    },
    description: "Slack incoming webhook URL",
  },

  {
    id: "slack-legacy-token",
    severity: "block",
    category: "secret",
    regex: /xox[abps]-[0-9a-zA-Z-]{20,}/,
    examples: {
      positive: ['xoxb-' + 'X'.repeat(39)],
      negative: ['xoxz-not-a-token'],
    },
    description: "Slack legacy Bot / App / User token (xox[abps]-)",
  },

  {
    id: "generic-api-key",
    severity: "block",
    category: "secret",
    regex:
      /(?:key|token|secret|password|passwd|pwd|passphrase|auth_token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-+=\/]{32,}['"]?/i,
    examples: {
      positive: [
        'API_KEY=' + 'X'.repeat(34),
        'secret = "' + 'X'.repeat(34) + '"',
      ],
      negative: [
        'key=short',
        'the_secret_is_love_and_kindness',
      ],
    },
    description:
      "Generic API key / secret / token / password assignment with ≥ 32-char value in context of key-related vocabulary",
  },

  {
    id: "private-key",
    severity: "block",
    category: "secret",
    regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/,
    examples: {
      positive: ["-----BEGIN RSA PRIVATE KEY-----"],
      negative: ["-----BEGIN CERTIFICATE-----"],
    },
    description: "Private key block (RSA / EC / DSA / OpenSSH / PGP)",
  },

  {
    id: "jwt-token",
    severity: "block",
    category: "secret",
    regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    examples: {
      positive: ['eyJ0ZXN0LXNlY3Rpb24ifQ.eyJmaWVsZCI6InZhbHVlIn0.' + 'X'.repeat(43)],
      negative: ['eyJ.too.short'],
    },
    description: "JSON Web Token (JWT) — three dot-separated base64url segments starting with eyJ",
  },

  {
    id: "email-phone-pii",
    severity: "block",
    category: "pii",
    regex:
      /[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}|\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{4,9}/,
    examples: {
      positive: ["user@example.com", "+1-555-123-4567"],
      negative: ["user@localhost", "short"],
    },
    description:
      "Email address or phone number heuristic (PII)",
  },

  // ── block-strict severity (only active with strict=true) ─────────

  {
    id: "postal-address",
    severity: "block-strict",
    category: "pii",
    regex:
      /\b\d{1,5}\s+[A-Za-z0-9\s.'-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Highway|Hwy|Terrace|Ter|Parkway|Pkwy|Square|Sq|View|Vw|Walk|Wk|Row)\b/i,
    examples: {
      positive: ["1600 Pennsylvania Avenue NW"],
      negative: ["42 Wall Street"], // "Wall Street" isn't a matching suffix with the regex
    },
    description:
      "Postal address heuristic (number + street name + suffix) — best-effort, block-strict only",
  },

  {
    id: "us-ssn",
    severity: "block-strict",
    category: "pii",
    regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    examples: {
      positive: ['987-65-' + '4321'],
      negative: ["000-00-0000"], // invalid group numbers
    },
    description: "US Social Security Number (XXX-XX-XXXX) with valid group validation",
  },

  {
    id: "credit-card-shape",
    severity: "block-strict",
    category: "pii",
    regex:
      /\b(?:\d{4}[- \t]?){3,4}\d{4}\b|\b\d{4}[- \t]?\d{6}[- \t]?\d{5}\b/,
    examples: {
      positive: ['4' + '1'.repeat(15), '4111' + ' 1111 1111 1111'],
      negative: ['1234 5678 9012'], // too short
    },
    description:
      "Credit/debit card number shape (16-digit or 15-digit Amex) — block-strict only",
  },

  {
    id: "gps-precise",
    severity: "block-strict",
    category: "pii",
    regex: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/,
    examples: {
      positive: ["37.7749,-122.4194"],
      negative: ["37.77,-122.42"], // only 2 decimal places
    },
    description:
      "Precise GPS coordinates (≥ 4 decimal places) — block-strict only",
  },
]);

// ─── Scan Function ───────────────────────────────────────────────────────────

/**
 * Scan text for secret/PII matches against registered patterns.
 *
 * @param {string} text — The text content to scan
 * @param {object} [opts]
 * @param {boolean} [opts.strict=false] — When true, also check block-strict patterns
 * @returns {ScanMatch[]} Array of matched results
 */
export function scan(text, { strict = false } = {}) {
  /** @type {ScanMatch[]} */
  const results = [];

  // Guard against null / undefined text
  if (typeof text !== "string" || text.length === 0) return results;

  const activePatterns = strict
    ? PATTERNS
    : PATTERNS.filter((p) => p.severity === "block");

  for (const pattern of activePatterns) {
    // Clone regex with global flag to iterate all matches
    const flags =
      pattern.regex.flags + (pattern.regex.global ? "" : "g");
    const regex = new RegExp(pattern.regex.source, flags);

    let match;
    while ((match = regex.exec(text)) !== null) {
      // Compute 1-indexed line and column
      const textBefore = text.slice(0, match.index);
      const lines = textBefore.split("\n");
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;

      // Build snippet: 20 chars before, the match, 20 chars after
      const snippetStart = Math.max(0, match.index - 20);
      const snippetEnd = Math.min(
        text.length,
        match.index + match[0].length + 20,
      );
      const snippet = text
        .slice(snippetStart, snippetEnd)
        .replace(/\n/g, " ")
        .trim();

      results.push({
        patternId: pattern.id,
        line,
        column,
        snippet,
      });
    }
  }

  return results;
}
