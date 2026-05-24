---
name: context-engineering
description: Optimizes agent context setup. Use when starting a new session, when agent output quality degrades, or when switching between tasks.
license: MIT
compatibility: opencode
metadata:
  audience: ai
  workflow: workflow
---

## When to use this skill

Load this skill when starting a new coding session, when agent output quality declines (wrong patterns, hallucinated APIs, ignoring conventions), or when switching between different parts of the codebase.

## Overview

Feed agents the right information at the right time. Context is the single biggest lever for agent output quality — too little and the agent hallucinates, too much and it loses focus.

## The Context Hierarchy

```
1. Rules Files (CLAUDE.md, AGENTS.md) ← Always loaded, project-wide
2. Spec / Architecture Docs           ← Loaded per feature/session
3. Relevant Source Files              ← Loaded per task
4. Error Output / Test Results        ← Loaded per iteration
5. Conversation History               ← Accumulates, compacts
```

## Context Packing Strategies

### The Brain Dump (Session Start)
```
PROJECT CONTEXT:
- We're building [X] using [tech stack]
- The relevant spec section is: [spec excerpt]
- Key constraints: [list]
- Files involved: [list with brief descriptions]
```

### The Selective Include (Per Task)
```
TASK: Add label removal to todo items
RELEVANT FILES:
- src/hooks/useTodos.ts (the hook to modify)
- src/components/TodoItem.tsx (component render)
- src/components/LabelBadge.tsx (existing label pattern)
```

## Confusion Management

When context conflicts or requirements are incomplete, surface it:
```
CONFUSION:
The spec says X, but existing code does Y.
Options: A) Follow spec B) Follow existing code C) Ask
→ Which approach should I take?
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The agent should figure out conventions" | Write a rules file. 10 minutes saves hours. |
| "More context is always better" | Focused context outperforms large context. |
| "I'll just correct it when it goes wrong" | Prevention is cheaper than correction. |

## Red Flags

- Agent output doesn't match project conventions
- Agent invents APIs that don't exist
- Agent quality degrades as conversation gets longer
- No rules file exists in the project

## Verification

- [ ] Rules file exists and covers stack, commands, conventions, boundaries
- [ ] Agent output follows patterns shown in rules file
- [ ] Context refreshed when switching between major tasks
