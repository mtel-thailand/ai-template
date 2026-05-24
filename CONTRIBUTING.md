# Contributing to this template

## Who contributes what

| Role | Contributes |
|------|-------------|
| PM | Sequencing, board management, gate enforcement |
| PO | Ticket descriptions, acceptance criteria |
| SA | Architecture decisions (ADRs in docs/architecture/) |
| UX | Flow diagrams, layout specs (docs/ux/) |
| BE/FE | Implementation — only after design gate passes |
| QA | Test plans, acceptance tests |
| SRE | Reliability/security requirements |
| DevOps | CI/CD, Docker, GitHub Pages |
| AI | Agent config, opencode.json, skills, MCP |

## Workflow in 6 steps

1. Open an issue (no issue = no code)
2. Get design gate sign-off on the issue
3. Branch: `feature/<issue#>-<slug>` from main
4. Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
5. Open a PR referencing the issue (`Closes #N`)
6. Get review + green CI before merging

## Never

- Push directly to main
- Merge without a reviewed PR
- Create a branch without a ticket
- Write code before the design gate passes

## Docs-first

Every PR that changes behaviour must update `/docs/` unless labeled `docs-skip`.
ADRs are required for architectural decisions.
