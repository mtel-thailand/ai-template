# Sanitization checklist — OSS publication audit

This document records the sanitization sweep performed under
[Issue #60](https://github.com/<your-org>/<your-repo>/issues/60) to prepare
this repository for OSS publication. It is the source-of-truth for adopter
forks and future re-audits.

Companion ADR: [`0007-single-shared-github-pat.md`](../adr/0007-single-shared-github-pat.md).

---

## Canonical-identity resolution chain (load-bearing)

Agents must NEVER guess the canonical `owner/repo` from email, session
context, or hardcoded strings. Identity resolves in this order:

1. **`.env`** — read `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_REPO_URL`.
2. **`.git/config`** — fall back to parsing `remote.origin.url`.
3. **Fail loudly** — if neither is set, ask the user. Never guess.

`.env.example` ships with placeholders (`<your-org>`, `<your-repo>`). A
fresh clone will not run agent tooling until `.env` is populated with real
values. This is intentional: the template refuses to operate against the
wrong repository.

Implementation reference: see the "Canonical repo identity" section of
[`AGENTS.md`](../../AGENTS.md).

---

## ADR-historical-reference exemption policy

The repo grep-clean for `mtel-thailand` / `mtel_thailand` / `ai-todo`
**preserves** references in the following surfaces as provenance:

| Surface | Why it is exempt |
|---|---|
| `CHANGELOG.md` historical entries | Records what was released under the prior org name; rewriting falsifies history. |
| `/docs/adr/*.md` | ADRs document decisions made at a point in time. Provenance links (e.g. `github.com/mtel-thailand/ai-template/issues/...`) are evidence, not branding. |
| `/docs/research/*.md` | Research archives are snapshots and must remain reproducible. |
| Issue body / comments | GitHub-side artifacts; not sanitized at the repository layer. |

Every **other** surface is sanitized. Adopters who fork the template should
not need to edit historical documents; they own everything else.

---

## Per-leak-surface attestation

| Surface | Status | Verified by | Notes |
|---|---|---|---|
| `embeddings.lock` | ✓ Confirmed clean by @security at #59 design gate | @security | SHA-256 lock for ONNX weights only; no identity, no secrets, no PII. |
| `sqlite-vec.lock` | ✓ Confirmed clean by @security at #59 design gate | @security | Per-platform SHA-256 locks for the `sqlite-vec` extension. No identity, no secrets, no PII. |
| Test fixtures (`tests/memory/fixtures/*`) | ✓ Confirmed clean by @security at #59 design gate | @security | Deterministic synthetic data only. No real names, no real credentials, no PII. |
| `LICENSE` | ✓ Generalized in this PR | @devops | Copyright reassigned to "The ai-template Authors" (Go/TensorFlow/Chromium convention). |
| `.env.example` | ✓ Generalized in this PR | @devops | Collapsed 10 per-role PATs → 1 shared `GITHUB_PAT`. Placeholders for owner/repo. |
| `AGENTS.md` § Canonical repo identity | ✓ Generalized in this PR | @devops | Reframed to teach the resolution chain instead of pinning a specific org/repo. |
| `README.md` / `docs/index.md` | ✓ Renamed in this PR | @devops | Stale `ai-todo` heading replaced with `ai-template`. |
| `.opencode/skills/` (9 hits per @ai audit) | ✓ Cleaned in this PR | @devops, audit by @ai | 3 URL/branding hits → placeholders; 6 `ai-todo-todos` localStorage residue → `app-tasks`. |
| `scripts/memory-lint.mjs` (issue tracker URL) | ✓ Cleaned in this PR | @devops | Hardcoded `github.com/mtel-thailand/...` URL replaced with reference to canonical `GITHUB_REPO_URL`. |
| `.gitignore` (maintainer-OS fingerprint) | ✓ Hardened in this PR | @devops | Added explicit `**/.DS_Store`, `**/Thumbs.db`, `**/.idea/` globs. See note below. |

### Note on `.DS_Store` files

At implementation time, `git ls-files | grep -i ds_store` returned no
tracked entries — eight `.DS_Store` files were present in the working tree
but already ignored by the bare `.DS_Store` pattern. No `git rm --cached`
was needed. `.gitignore` was tightened defensively with explicit `**/`
globs to make intent unambiguous.

If a future audit finds tracked `.DS_Store` files, run:

```bash
git ls-files | grep -i ds_store | xargs git rm --cached
git commit -m "chore: remove tracked .DS_Store files"
```

### Note on `**/.vscode/`

The brief asked for `**/.vscode/` to be added to `.gitignore`. This was
**not** applied — it would shadow the existing `!.vscode/extensions.json`
allowlist (`extensions.json` is the one file we intentionally publish so
adopters get the recommended-extensions prompt on first open). Top-level
`.vscode/` is still ignored via the existing `.vscode/*` rule. Nested
`.vscode/` directories at non-root paths are not common in this repo; if
they become a problem, file a follow-up.

---

## Owner-customization steps (adopter checklist)

When forking this template to start a new project:

1. **`.env`** — copy `.env.example` to `.env` and set:
   - `GITHUB_PAT` (with `repo`, `project`, `read:org` scopes)
   - `GITHUB_OWNER` (your GitHub user or org)
   - `GITHUB_REPO` (your repository name)
   - `GITHUB_REPO_URL` (full URL)
2. **`LICENSE`** — optionally amend or supplement the existing copyright
   line. The default `"The ai-template Authors"` legitimately credits prior
   template contributors who hold copyright on the template code; you MAY
   add a line for your own attribution if your fork adds substantive work.
3. **`README.md`** — replace the template description with your project's
   purpose, prerequisites, and quick-start.
4. **`docs/index.md`** — replace the template landing page with your
   project's docs landing page. Keep the structure if you want GitHub
   Pages to keep working out of the box.
5. **`docs/architecture.md`** — update the design decisions table for your
   project's chosen stack.
6. **`.opencode/skills/github-pages/SKILL.md`** — the `<your-org>` /
   `<your-repo>` placeholders in the Pages URL are pulled from your `.env`
   values at runtime; no edit needed if you keep this skill in use.
7. **First commit** — push to your fork and verify CI green-lights once
   you've added the project's `package.json` (see Issue #66 for the
   placeholder-scripts follow-up).

---

## Out of scope

The following surfaces were explicitly **not** touched by Issue #60. They
are tracked under separate tickets:

- `SECURITY.md` bash-permission policy rewrite → **#61** (consistency wave)
- `CODE_OF_CONDUCT.md` reporting contact → **#68** (community wave)
- `src/` / `tests/` cleanup (dead-code removal) → **#65**
- Root `package.json` placeholder scripts → **#66**
- Memory subsystem enable/disable decision → **#64**

The audit re-runs in #61 and #68 should treat this checklist as the
baseline.

---

## Re-audit procedure

To re-run this audit (recommended at every major version bump):

```bash
# Repo grep — should match only the exempted surfaces above
git grep -in 'mtel-thailand\|mtel_thailand\|ai-todo' \
  -- ':!CHANGELOG.md' ':!docs/adr/*' ':!docs/research/*' \
     ':!docs/audits/sanitization-checklist.md'

# Tracked maintainer-OS fingerprint files — should be empty
git ls-files | grep -iE '\.ds_store$|thumbs\.db$|\.idea/'

# .env not committed — should print nothing
git ls-files | grep -E '^\.env$'
```

A non-empty result on any of these queries indicates a regression that must
be remediated before the next release.
