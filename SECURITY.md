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
Agent bash permissions are restricted to: `npm run *`, `npm test*`, `npx *`, `git *`.
Do not expand these without a reviewed ADR.
