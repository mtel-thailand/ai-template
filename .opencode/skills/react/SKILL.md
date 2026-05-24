---
name: react
description: React 19 patterns, hooks, and conventions for this project
license: MIT
compatibility: opencode
metadata:
  audience: fe
  workflow: implementation
---

## When to use this skill

Load this skill when you are creating or modifying a React component,
hook, or JSX template in this project. It covers component conventions,
hook usage patterns, and JSX style specific to this codebase. Not needed
for non-UI work (backend, config, docs).

## Framework

This project uses React 19 with TypeScript. No external state library — React hooks + localStorage.

## Next.js Context

This project uses **Next.js** with the **App Router** (`app/` directory). Key differences from a pure React app:

- **File-based routing**: pages in `app/**/page.tsx`, layouts in `app/**/layout.tsx`
- **Server Components by default**: components in `app/` are Server Components unless marked `"use client"`
- **Data fetching**: prefer `async` Server Components with `fetch()` over `useEffect`
- **`"use client"` directive**: add only when interactivity, hooks, or browser APIs are needed
- **Metadata**: export `metadata` or `generateMetadata()` from page/layout files
- **Next.js tooling**: use `next.config.ts` for config, `next/image` for images

Client Components (marked `"use client"`) follow all the React 19 patterns documented below. Server Components do not support hooks, event handlers, or browser APIs.

See the `nextjs` skill for detailed App Router guidance.

## Component conventions

- Functional components only, no class components
- Props typed via inline `interface` above the component
- Export named functions, not default exports (except `App`)
- Keep components focused and small; extract reusable pieces

## Hooks

- Use `useState` for local UI state (toggles, inputs, filters)
- Use `useMemo` / `useCallback` for derived data and stable callbacks
- Use `useEffect` only for side effects (persistence, sync)
- Custom hooks go in `src/hooks/` and return plain objects

## JSX patterns

- Use `className` with Tailwind utilities (no CSS modules or styled-components)
- Conditional classes via template literals or clsx
- Event handlers defined as inner functions with `function` keyword (not arrow in JSX props)
- Forms use `onSubmit` on the `<form>` element, not onClick on buttons
- Accessible: labels, roles, aria attributes, keyboard handlers

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "useEffect is the right place for all side effects" | Derived state belongs in `useMemo`; effects are for synchronizing with external systems (e.g., persistence, subscriptions). |
| "Default exports are cleaner" | Named exports give better tree-shaking, IDE support (rename refactoring), and explicit imports. Only `App` may use default export. |
| "Custom hooks should return JSX" | Hooks return values (state, functions, objects); components return JSX. Mixing them violates the rules of hooks. |
| "I'll put all state in a single `useState` call" | Split state into multiple `useState` calls — avoids unnecessary re-renders and makes updates clearer. |

## Red Flags

- Mutating state directly instead of using the setter function from `useState`
- Using `useEffect` to derive state that could be computed with `useMemo`
- Large components (>200 lines) that should be split into smaller pieces
- Missing `"use client"` directive when using hooks or browser APIs in a Next.js app
- Catching errors silently in `useEffect` without user feedback

## Verification

- [ ] Every component is a named function export (no default exports except `App`)
- [ ] All props have an inline `interface ComponentNameProps` type definition
- [ ] No direct state mutation — state is only updated via setter functions
- [ ] Event handlers use `function` keyword inside the component, not arrow functions in JSX props
- [ ] Forms use `onSubmit` on the `<form>` element, not `onClick` on buttons
