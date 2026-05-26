# Skill orphan audit — 2026-05-26

**Issue:** [#65 — dead-code audit](https://github.com/mtel-thailand/ai-template/issues/65)
**Sub-task:** B (skill orphan audit)
**Author:** `@ai`
**Branch:** `chore/65-dead-code-audit`
**Policy:** Conservative — default-keep. This audit flags candidates only;
no skill is removed in this commit.

---

## Audit method

For each of the 33 skills under `.opencode/skills/<name>/SKILL.md`, the
skill name was searched as a fixed string across the following surfaces:

1. All agent files: `.opencode/agents/*.md` (frontmatter and prose body)
2. All docs: `docs/**`
3. Platform config: `.opencode/opencode.json`, `.opencode/SOUL.md`,
   `.opencode/.gitignore`, `.opencode/start.sh`, `AGENTS.md`
4. Cross-skill references: `.opencode/skills/**/SKILL.md`
   (excluding each skill's own directory)
5. Tooling and CI: `scripts/`, `.github/`, `README.md`, `CHANGELOG.md`

A skill with **zero matches** in surfaces 1–5 is flagged
`potentially-orphaned`. Any single match — even a tangential prose mention —
keeps the skill in `referenced` status, per the conservative policy.

### Exact reproducer

The audit was reproduced with the following commands run from the repo
root:

```bash
# Surfaces 1–3: agents, docs, top-level config
for s in <skill-name>; do
  rg --no-heading -n -F "$s" \
    .opencode/agents/ docs/ \
    .opencode/opencode.json .opencode/SOUL.md .opencode/.gitignore \
    .opencode/start.sh AGENTS.md
done

# Surface 4: cross-skill (excluding self-refs)
for s in <skill-name>; do
  rg --no-heading -n -F "$s" .opencode/skills/ \
    | grep -v "^.opencode/skills/$s/"
done

# Surface 5: scripts, CI, top-level docs
for s in <skill-name>; do
  rg --no-heading -n -F "$s" scripts/ .github/ README.md CHANGELOG.md
done
```

### Caveats

- Matching is by **exact skill-name string**. A skill referenced only by a
  loose paraphrase (e.g. "the security skill" instead of `security`) would
  not be detected; in practice all current references use the canonical
  hyphenated name.
- Generic English words that happen to be a skill name (`node`, `docker`,
  `security`, `react`, `vite`) collected a mix of true skill grants and
  coincidental hits (e.g. `node_modules`, `node -e`, `docker *` bash
  permission, `vite-bundle-visualizer`). Under the conservative policy,
  any reference — incidental or load-bearing — keeps the skill in
  `referenced` status. Whether the skill is actively loaded by any agent
  is **out of scope** for this audit and would require a runtime study.
- Skills granted in agent frontmatter via the YAML/JSON `tools:` /
  `permission:` blocks are detected. Skills loaded implicitly at runtime
  (e.g. by name from the `skill` tool) without ever being written into
  agent or doc files are **indistinguishable from orphans** by this
  static method.

---

## Results

### Summary

| Status | Count |
|---|---:|
| `referenced` | 22 |
| `potentially-orphaned` | 11 |
| **Total skills** | **33** |

### Full table

| Skill | Referenced by | Status |
|---|---|---|
| `accessibility` | `qa.md`, `reviewer.md`, `researcher.md` (skill grants); `tech-lead.md`, `fe.md` (body); `docs/index.md`, `docs/architecture.md` | `referenced` |
| `api-design` | `tech-lead.md`, `researcher.md` (skill grants) | `referenced` |
| `code-review-and-quality` | `tech-lead.md`, `qa.md`, `reviewer.md` (skill grants); `reviewer.md` body section header | `referenced` |
| `code-simplification` | — | `potentially-orphaned` |
| `context-engineering` | — | `potentially-orphaned` |
| `debugging-and-error-recovery` | `.opencode/agents/_workflow.md` (two body references) | `referenced` |
| `devops-skill` | — | `potentially-orphaned` |
| `docker` | `opencode.json` (bash perm), `devops.md`, `researcher.md` (skill grants); `docs/architecture.md`, `docs/adr/0001-grant-git-access.md` | `referenced` |
| `documentation-and-adrs` | `tech-lead.md` (skill grant + body), `po.md` (skill grant) | `referenced` |
| `git-and-npm-hygiene` | `ai.md`, `devops.md`, `tech-lead.md`, `be.md`, `fe.md` (skill grants + body); `docs/specs/git-and-npm-hygiene.md`, `docs/architecture.md` | `referenced` |
| `git-workflow-and-versioning` | — | `potentially-orphaned` |
| `github-actions` | `researcher.md` (skill grant) | `referenced` |
| `github-pages` | — | `potentially-orphaned` |
| `incremental-implementation` | `tech-lead.md` (skill grant) | `referenced` |
| `nestjs` | `tech-lead.md`, `researcher.md`, `reviewer.md` (skill grants) | `referenced` |
| `nextjs` | `researcher.md` (skill grant) | `referenced` |
| `node` | `researcher.md` (skill grant); coincidental hits in `AGENTS.md`, `opencode.json`, `.gitignore`, runbooks (`node -e`, `node_modules`) | `referenced` |
| `performance-optimization` | `security.md`, `sre.md`, `reviewer.md` (skill grants) | `referenced` |
| `planning-and-task-breakdown` | — | `potentially-orphaned` |
| `playwright` | `researcher.md`, `qa.md` (skill grants) | `referenced` |
| `po-skill` | — | `potentially-orphaned` |
| `qa-skill` | — | `potentially-orphaned` |
| `react` | `tech-lead.md`, `researcher.md`, `reviewer.md` (skill grants) | `referenced` |
| `sa-skill` | — | `potentially-orphaned` |
| `security` | `security.md` (skill grant); also extensively referenced across `pm.md`, `devops.md`, `be.md`, `fe.md`, `_workflow.md`, `sre.md`, `researcher.md`, and most docs (largely `@security` agent and security topic references) | `referenced` |
| `shipping-and-launch` | — | `potentially-orphaned` |
| `spec-driven-development` | `tech-lead.md`, `po.md` (skill grants) | `referenced` |
| `sre-skill` | `security.md` body ("OWASP Top 10 — SPA Checklist (from sre-skill)") | `referenced` |
| `tailwind-css` | `researcher.md` (skill grant) | `referenced` |
| `typescript` | `tech-lead.md`, `researcher.md`, `reviewer.md` (skill grants) | `referenced` |
| `ux-skill` | — | `potentially-orphaned` |
| `vite` | `researcher.md` (skill grant); coincidental hit `vite-bundle-visualizer` in `sre.md` | `referenced` |
| `vitest` | `researcher.md`, `qa.md` (skill grants) | `referenced` |

### Potentially-orphaned skills (11)

1. `code-simplification`
2. `context-engineering`
3. `devops-skill`
4. `git-workflow-and-versioning`
5. `github-pages`
6. `planning-and-task-breakdown`
7. `po-skill`
8. `qa-skill`
9. `sa-skill`
10. `shipping-and-launch`
11. `ux-skill`

---

## Judgment notes

- **Role-named skills cluster.** Six of the eleven candidates are
  `*-skill` role-named (`devops-skill`, `po-skill`, `qa-skill`, `sa-skill`,
  `ux-skill`) plus the cross-cutting `sre-skill` (which is the **only**
  `*-skill` that survived because `security.md` cites it once). These
  appear to have been authored as canonical reference packs for each role
  but were never wired into the corresponding agent's frontmatter
  `tools:` / `permission:` block. They may be intended for implicit /
  contextual loading by the role-owner agent.
- **Workflow skills cluster.** Four of the eleven (`code-simplification`,
  `context-engineering`, `planning-and-task-breakdown`,
  `incremental-implementation`-adjacent) are cross-cutting workflow packs.
  `incremental-implementation` survived (one reference in `tech-lead.md`)
  but its siblings did not. The AGENTS.md preamble mentions
  `code-simplification` in the `@ai` agent's preamble narrative, but that
  preamble lives inside the agent's runtime system prompt (not in the
  agent's `.md` file body or frontmatter), so it does not appear in the
  static repo grep.
- **Deployment skills.** `github-pages` and `shipping-and-launch` are
  deployment / launch packs. The DevOps agent does not grant either; the
  `devops-skill` pack itself is also unreferenced.
- **No false-negative cases found.** The cross-skill and tooling sweeps
  produced zero additional hits for any candidate.
- **Possible explanations** (not conclusions): (a) these skills were
  drafted for future agents that have not yet been wired in;
  (b) they were intended as documentation rather than agent-loadable
  packs; (c) they are loaded implicitly via the `skill` tool by name and
  never need a file reference; (d) they are dead. Disambiguating (c) vs
  (d) requires a runtime / behavioural study and is out of scope here.

---

## Recommendation

**No action this commit.** Per the conservative default-keep policy
agreed by `@po` for issue #65, all 33 skills remain in place. This audit
exists as a written log so a future ticket can re-examine the 11
candidates individually.

If any of the 11 are to be removed in the future, each removal should be
its **own follow-up ticket** with:

1. Confirmation that no agent loads the skill implicitly via the `skill`
   tool by name.
2. Tech-Lead and PO sign-off (T2 design gate at minimum).
3. A grace period and announcement so any uncommitted in-flight work that
   depends on the skill can speak up.

Chesterton's Fence applies: the absence of a static reference is not the
same as the absence of a reason for the skill to exist.

---

## References

- Issue #65 — dead-code audit
- PM consolidation comment 4538830090
- `@po` conservative default-keep policy (in #65 thread)
- `@tech-lead` recommended grep method (in #65 thread)
- Workflow contract: `.opencode/agents/_workflow.md`
- Code-simplification skill — Chesterton's Fence principle
