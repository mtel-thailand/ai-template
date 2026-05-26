# Security policy

## Secrets
- Never commit secrets, tokens, or credentials
- All secrets live in `.env` (gitignored)
- Use `.env.example` to document required variables
- GITHUB_PAT is the only credential this template needs at runtime

## Reporting a vulnerability
If you find a security issue in this template, open a GitHub issue with the label `security`.
Do not include sensitive details in the issue body — use GitHub's private vulnerability reporting instead.

## MCP server security
Each agent role has a scoped MCP server with only the GitHub tools it needs.
Do not grant agents tools beyond their defined role scope.
Full MCP tool list is in `.opencode/opencode.json`.

## Permissions
Agent bash access is **scoped per role** under the principle of least privilege. Headline rules:

- `git push *` is **denied for every role** — remote writes require explicit user authorization.
- `git push --force *`, `git remote add *`, and `git config --global *` are denied globally.
- Only `@devops`, `@ai`, `@be`, `@fe`, `@tech-lead`, and `@reviewer` have any bash entitlement. Other roles (PM, PO, QA, Security, SRE, Researcher) have no bash access and fall through to the global deny-by-default.

The full per-role matrix lives in [`docs/architecture.md#per-role-bash-permission-model`](docs/architecture.md#per-role-bash-permission-model) and the authoritative encoding is in `.opencode/opencode.json`. Design rationale and the policy decision are recorded in [ADR-0001](docs/adr/0001-grant-git-access.md).

Do not expand these permissions without a new reviewed ADR.
