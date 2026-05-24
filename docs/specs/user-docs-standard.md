# User Documentation Standard

> **Audience:** Docs Writer, BE, FE, QA
> **Purpose:** Define the quality standard for all user-facing documentation — in-app copy, onboarding, error messages, release notes, and help articles.

## Role: Docs Writer

The Docs Writer is a lightweight sub-role that shares the `gh_design` MCP server (no dedicated server needed). Any agent can act as Docs Writer when the task calls for it, but the **responsibility is owned** — it cannot be skipped.

### When the Docs Writer is Triggered

Any PR that:
- Adds or changes a user-facing feature
- Adds or changes an error message
- Adds or changes a form label, button text, or tooltip
- Introduces a new onboarding step
- Ships a release

The PR author MUST either:
1. Act as Docs Writer (if qualified), or
2. Explicitly tag the Docs Writer role in a comment requesting documentation review

### Docs Writer Owns

- User-facing documentation (help articles, README, feature guides)
- In-app copy (error messages, labels, tooltips, empty states, success messages, validation messages)
- Onboarding content (tooltips, walkthroughs, welcome messages)
- Release notes (changelog entries in user-facing language)
- Error message quality (every error must tell the user what went wrong, why, and what to do next)

## In-App Copy Standard

### Error Messages

**The rule:** Every error message MUST state:
1. What went wrong (in plain language, not jargon)
2. Why it might have happened (give the user context)
3. What the user can do next (actionable recovery)

**Good:** "Could not save your todo. Your browser's local storage may be full. Try clearing some completed todos or freeing up space in your browser settings."  
**Bad:** "Something went wrong."  
**Why:** "Something went wrong" tells the user nothing. They don't know if they should retry, reload, or give up.

**Good:** "Unable to add label. Labels must be 30 characters or fewer."  
**Bad:** "Validation error."  
**Why:** "Validation error" is developer jargon. The user doesn't know what "validation" means or what they did wrong.

**Good (network):** "Could not load your todos. Please check your internet connection and try again."  
**Bad (network):** "Network error: 503."  
**Why:** HTTP status codes mean nothing to end users.

### Empty States

Every empty state MUST:
1. Explain what this area is for (context)
2. Tell the user why it's empty (not just "nothing here")
3. Provide a clear call-to-action (what to do next)

**Good:** "You haven't created any todos yet. Tap the input above to add your first todo."  
**Bad:** "No todos."

**Good:** "All caught up! No tasks due today. Use the input above to add a new todo."  
**Bad:** "Nothing."

### Buttons and Links

- Use verb + noun pattern: "Add todo", "Delete label", "Save changes"
- Never technical labels: "Submit", "Execute", "Process"
- Never "Click here" — the element itself should be self-describing

### Confirmations

- State what WILL happen: "This will permanently delete 'Buy milk'."
- Offer an undo if possible: otherwise use "Delete" / "Cancel"
- Never ask "Are you sure?" — that shifts responsibility to the user

## Onboarding Content Requirement

Every new feature MUST have at least ONE of the following before it ships:

1. **Tooltip on first use** — appears on the first interaction with the new element, explains what it does
2. **Empty-state message** — if the feature's initial state is empty, the empty-state text should explain what the feature is and how to start using it
3. **Help link** — a "Learn more" link next to the feature that opens a help article

### Onboarding Content Standard

- Tooltips: ≤ 2 sentences. No jargon. One action per tooltip.
- Empty states: ≤ 3 sentences. Context + reason + CTA.
- Help links: Must open a feature-specific help article (not a generic FAQ).

## Release Notes Format

```markdown
## [v0.1.0] - 2026-05-24

### ✨ New Features
- **Add labels to todos:** You can now add color-coded labels to any todo to organise your tasks by category. Click the "+ add" button on any todo to get started. (#10)
- **Hide completed todos:** Use the toggle at the top of the list to hide completed items and focus on what's left. (#8)

### 🐛 Bug Fixes
- Fixed an issue where app crashed on startup if local storage contained corrupt data
- Fixed label input accepting empty whitespace

### 🔒 Security
- Input sanitization added to label text fields

### 📖 Documentation
- New help article: "Organising todos with labels"

### Known Issues
- Labels cannot be filtered by clicking (coming in a future update)
```

### Rules
- Write in user-facing language — no commit hashes, no technical references
- Link to the Issue number for each change
- Group by category: ✨ New Features, 🐛 Bug Fixes, 🔒 Security, 📖 Documentation
- One bullet per user-facing change
- Known Issues section for what didn't make it into this release

## Help Doc Structure

Every help article covers ONE feature. Template:

```markdown
# [Feature Name]

## What is this?
1-2 sentences describing what the feature does and why a user would use it.

## How to use it
1. Step-by-step numbered instructions
2. Each step starts with an action verb
3. If relevant, include: "You'll know it worked when..."
4. If relevant, include: "If something goes wrong..."

## Tips
- Pro-tip 1
- Pro-tip 2

## Related
- Link to related feature
- Link to FAQ
```

### Help Doc Rules
- One article per major feature
- Steps are numbered, not bulleted
- Screenshots (when added) include descriptive alt text
- Article is updated within one sprint of the feature shipping
- Articles live in `/docs/help/` alongside the codebase

## Verification Checklist

Before a user-facing PR merges:
- [ ] Every error message follows the "what + why + next" pattern
- [ ] Every empty state explains context + provides CTA
- [ ] Every button uses verb + noun format
- [ ] New features have at least one onboarding method (tooltip, empty state, or help link)
- [ ] Release notes (if this is a release PR) follow the format above
- [ ] Help article exists for any new feature OR an Issue is filed to create it within the next sprint
- [ ] No "Something went wrong" or "Are you sure?" patterns remain
