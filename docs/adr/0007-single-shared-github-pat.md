# ADR-0007: Single shared `GITHUB_PAT` for all agent MCP servers

**Status:** Accepted
**Date:** 2026-05-26

## Context

Earlier iterations of this template's `.env.example` listed ten per-role PAT
variables (`GH_PAT_PM`, `GH_PAT_DESIGN`, `GH_PAT_BE`, `GH_PAT_FE`,
`GH_PAT_REVIEWER`, `GH_PAT_QA`, `GH_PAT_SEC`, `GH_PAT_SRE`, `GH_PAT_DEVOPS`,
`GH_PAT_RESEARCH`) on the assumption that each agent would run an independent
MCP server with its own credential. Issue #60 (epic #59 — open-source
readiness) corrects `.env.example` to list only `GITHUB_PAT`, matching what
the runtime actually consumes via `{env:GITHUB_PAT}` substitution in
`.opencode/opencode.json`.

ADR-0005 already removed the per-role MCP server split, but did not record
the corresponding credential decision. Without this ADR, a future contributor
reading the corrected `.env.example` could plausibly re-introduce the
ten-PAT model believing it to be the original design intent. This ADR
retroactively captures the credential decision so the corrected state is
self-documenting.

## Decision

Use a single shared `GITHUB_PAT` environment variable, consumed by every
per-agent MCP server entry via `{env:GITHUB_PAT}` substitution in
`.opencode/opencode.json`. Role-scoped tool access is enforced at the
`X-MCP-Toolsets` header level (per ADR-0005), not at the PAT level — each
agent block declares which toolsets it may invoke, but all blocks share the
same authentication credential.

The single token MUST be scoped to the minimum permissions the squad
requires: `repo`, `project`, and `read:org`. Operators are expected to
rotate the token on the cadence dictated by their organization's secret
hygiene policy and to prefer short-lived PATs where supported.

## Consequences

**Positive:**

- One token to provision, store, rotate, and audit — trivial first-run
  setup for new contributors cloning the template.
- Single source of truth in `.env`; no risk of partial configuration
  (e.g., five PATs set, five missing) silently disabling specific agents.
- Eliminates ten env-var stanzas of boilerplate from `.env.example` and
  associated documentation.

**Negative:**

- All agents share the same blast radius if the PAT is compromised.
  Mitigated by (a) least-privilege scope on the single token, (b)
  short-lived PATs, and (c) the role-scoped toolset enforcement from
  ADR-0005, which limits *what* each agent can request even with the
  shared credential.
- Cannot enforce per-role audit trails via GitHub's API attribution — all
  writes appear in the audit log as the PAT owner, not the agent that
  initiated them. Per-agent provenance must be reconstructed from local
  opencode session logs.

## Alternatives considered

- **(a) Per-role PATs (one per agent).** Provides per-role audit attribution
  on GitHub and tighter blast-radius isolation. Rejected: operational burden
  (ten tokens to provision and rotate) is disproportionate to the marginal
  audit benefit for a template that ships with a single human operator in
  the loop. Session-scoped opencode logs already provide per-agent
  attribution locally.
- **(b) Fine-grained PATs per agent.** GitHub's fine-grained PATs would
  allow narrower per-token scoping than classic PATs. Deferred: fine-grained
  PATs lack `project` scope as of writing, which the PM agent requires for
  `gh_pm_projects_*` tools. Revisit when GitHub closes that gap.
- **(c) GitHub App with installation tokens.** Strongest isolation and
  audit story. Rejected for the template default: requires per-installation
  setup that contradicts the template's "clone and go" promise.

## References

- Parent epic: https://github.com/mtel-thailand/ai-template/issues/59
- Issue: https://github.com/mtel-thailand/ai-template/issues/60
- ADR-0005: per-role MCP server removal (related decision).
- Tech Lead T2 sign-off:
  https://github.com/mtel-thailand/ai-template/issues/60#issuecomment-4538785955
- PM consolidated conditions:
  https://github.com/mtel-thailand/ai-template/issues/60#issuecomment-4538801608
