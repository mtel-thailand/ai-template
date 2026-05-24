# Troubleshooting

## opencode won't start

**Symptom:** `start.sh` exits with an error about GITHUB_PAT.
**Fix:** Ensure `.env` exists and contains `GITHUB_PAT=ghp_...`. The start script reads this file before launching opencode.

## MCP tools not available

**Symptom:** Agents report GitHub tools unavailable.
**Fix:**
1. Check GITHUB_PAT is set: `echo $GITHUB_PAT`
2. Verify scopes: token needs `repo`, `project`, `read:org`
3. Restart opencode — config is not hot-reloaded

## After editing opencode.json, changes aren't taking effect

opencode does not hot-reload config. Quit and restart after any change to:
- `.opencode/opencode.json`
- Any agent file in `.opencode/agents/`
- `.opencode/SOUL.md` or `AGENTS.md`

## CI is failing

CI validates template structure. Required files:
- `README.md`
- `LICENSE`
- `.env.example`
- `AGENTS.md`
- `.opencode/opencode.json`

If any of these are missing, CI will fail with `MISSING: <filename>`.

## Agent is doing work without a ticket

This violates rule 4 of the workflow contract. Tell the agent:
> "Stop. Create an issue first. No code without a ticket."

The agent should open an issue and wait for your confirmation before continuing.

## docs/ content looks like template boilerplate

It is. Replace `docs/index.md`, `docs/architecture.md`, and related files
with your actual project documentation before inviting the wider team.

## PR was merged without review

This should not be possible if branch protection is enabled on main.
To enable: Settings → Branches → Branch protection rules → Require a pull request before merging.
