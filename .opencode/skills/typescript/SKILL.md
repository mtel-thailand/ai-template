---
name: typescript
description: TypeScript 6 conventions, strict mode, and type patterns for this project
license: MIT
compatibility: opencode
metadata:
  audience: fe, be, sa
  workflow: implementation
---

## When to use this skill

Load this skill for any TypeScript-related work — writing types,
debugging type errors, defining interfaces, or configuring tsconfig.
Applicable across all code (FE, BE, shared types). Skip only for
non-TypeScript files (markdown, JSON configs, CSS).

## Configuration

This project uses TypeScript ~6.0.2 with strict mode enabled. The config is in `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json`.

## Type conventions

- Define domain types in `src/types/` — plain interfaces, no classes
- Use `interface` for object shapes (public API), `type` for unions/aliases
- Avoid `any` — prefer `unknown` with type guards
- Use `as` casts sparingly; prefer type narrowing
- Import types with `import type { ... }` syntax

## Patterns

- Component props: inline `interface ComponentNameProps` above the component
- Hook returns: typed inline or via a named return type
- Event handlers: use React event types (`FormEvent`, `MouseEvent`, `KeyboardEvent`)
- Null/undefined handling: use `??` for defaults, optional chaining for access

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll use `any` for now and fix it later" | `any` hides real type errors — use `unknown` with type narrowing instead. |
| "Types should be in a shared `types.ts` file" | Keep types co-located with usage (inline above the component/hook); share only when needed in `src/types/`. |
| "`as` casts are the same as type narrowing" | `as` bypasses the compiler — prefer type guards, discriminated unions, or conditional blocks. |
| "`interface` and `type` are interchangeable" | Use `interface` for object shapes (public API), `type` for unions, aliases, and mapped types. |

## Red Flags

- Using `as any` to silence a type error without understanding the root cause
- Exporting types from a barrel file (`index.ts`) that are only used internally
- Using `!` (non-null assertion) instead of proper null checking
- Defining a type in a shared file that is only used in one component
- Functions with more than 3 optional parameters — consider a params object type

## Verification

- [ ] No `any` types — all `any` usages are replaced with `unknown` or proper types
- [ ] Component props have inline `interface ComponentNameProps` (not a shared type)
- [ ] All imports from other modules use `import type { ... }` for type-only imports
- [ ] `tsc -b` passes with zero errors
