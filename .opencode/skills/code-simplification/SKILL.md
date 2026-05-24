---
name: code-simplification
description: Patterns and principles for reducing code complexity. Covers Chesterton's Fence, Rule of 500, and specific reduction techniques.
license: MIT
compatibility: opencode
metadata:
  audience: fe, be
  workflow: refactoring
---

## When to use this skill

Load this skill when refactoring complex code, reviewing a PR with hard-to-follow logic, or when a function or file has grown beyond comfortable size. Use before adding new complexity to existing code.

## Overview

Simplification is not about writing less code — it's about writing code that's easier to understand, change, and debug. This skill covers the core principles and specific patterns for reducing complexity.

## Core Principles

### Chesterton's Fence
**Never remove or change something until you understand why it's there.**

Before simplifying any code:
1. **Read** the code and understand its purpose
2. **Check** the git history — what bug fix or requirement led to this code?
3. **Document** your understanding
4. **Then** simplify

The most dangerous simplification is one that removes necessary complexity you didn't understand.

### Rule of 500
**Split any file over 500 lines into smaller, focused files.**

500 lines is the warning threshold, not a hard limit. The goal is focused files with single responsibility:
- A component file over 500 lines → extract sub-components
- A hook file over 500 lines → split into multiple hooks
- A utility file over 500 lines → split by domain

## Complexity Reduction Patterns

### Replace Conditionals with Data
Instead of chains of `if/else` or `switch`, use lookup tables:

```typescript
// Before
function getStatusText(status: string): string {
  if (status === 'active') return 'Active';
  if (status === 'completed') return 'Completed';
  if (status === 'archived') return 'Archived';
  return 'Unknown';
}

// After
const STATUS_TEXTS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};
function getStatusText(status: string): string {
  return STATUS_TEXTS[status] ?? 'Unknown';
}
```

### Early Returns
Reduce nesting by handling edge cases first:

```typescript
// Before
function processTodo(todo) {
  if (todo) {
    if (todo.completed) {
      // 20 lines of logic
    }
  }
}

// After
function processTodo(todo) {
  if (!todo) return;
  if (!todo.completed) return;
  // 20 lines of logic at top level
}
```

### Extract Functions
Break long functions into smaller named functions:

```typescript
// Before
function handleSubmit(event) {
  event.preventDefault();
  // validate inputs (15 lines)
  // sanitize data (10 lines)
  // save to storage (10 lines)
  // update UI (10 lines)
  // show notification (5 lines)
}

// After
function handleSubmit(event: FormEvent) {
  event.preventDefault();
  const todo = validateAndSanitize(formData);
  if (!todo) return;
  saveTodo(todo);
  updateTodoList(todo);
  showSuccessNotification();
}
```

### Remove Dead Code
Delete code that is:
- **Unused:** No callers anywhere in the codebase
- **Commented out:** Version control already has it
- **Unreachable:** Guarded by a condition that's always false
- **Duplicated:** Same logic exists elsewhere

### Combine Related State
Multiple `useState` calls that change together should be a single object:

```typescript
// Before
const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [priority, setPriority] = useState('medium');

// After
const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
```

## What NOT to Simplify

- **Hot paths:** Performance-sensitive code may need to be "ugly" for speed
- **Generated code:** Don't manually simplify what a tool produces
- **Third-party adaptations:** Leave vendor-specific workarounds intact (with comments)

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I don't understand this code so I'll rewrite it" | That's violating Chesterton's Fence. Understand it first. |
| "This file is 800 lines but it's fine because it's all related" | No file is too complex to split. 500+ lines always benefits from extraction. |
| "I'll just add a comment instead of simplifying" | Comments explain, but simple code doesn't need explanation. |

## Red Flags

- Files over 500 lines without a strong justification
- Nested conditionals 3+ levels deep
- Functions over 50 lines
- Copy-pasted code blocks
- Comments explaining *what* instead of *why* (extract instead)

## Verification

- [ ] File sizes under 500 lines
- [ ] No function exceeds ~50 lines
- [ ] No nesting beyond 2-3 levels
- [ ] Dead code removed
- [ ] Each file has a single, clear responsibility
- [ ] Tests pass after simplification
