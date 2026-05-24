---
name: tailwind-css
description: Tailwind CSS 4 conventions, design tokens, and responsive patterns
license: MIT
compatibility: opencode
metadata:
  audience: fe, ux
  workflow: design, implementation
---

## When to use this skill

Load this skill when designing or implementing UI that uses Tailwind CSS
classes — styling components, choosing colors/spacing, setting up
responsive layouts, or defining design tokens. Not needed for backend,
config, or non-visual changes.

## Setup

This project uses Tailwind CSS 4 via `@tailwindcss/vite` plugin. The entry file `src/index.css` imports `@import "tailwindcss"`.

## Design tokens

- Primary: `blue-600` (buttons, links, focus rings)
- Text: `gray-900` (primary), `gray-400` (secondary/muted), `gray-600` (labels)
- Background: `gray-50` (page), `white` (cards), `gray-100` (badges)
- Borders: `gray-200` (card borders), `gray-300` (inputs)
- Danger: `red-500` (delete actions)
- Success: `blue-600` (checked state)

## Common patterns

- Cards: `bg-white rounded-lg border border-gray-200 shadow-sm`
- Inputs: `border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`
- Buttons: `px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer`
- Container: `max-w-md` centered with `mx-auto` or flex centering
- Focus rings: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`

## Responsive

- Mobile-first. Use `sm:`, `md:`, `lg:` breakpoints as needed
- This app is simple — avoid over-engineering responsive variants
- Touch targets must be at least 44x44px on mobile

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll add custom CSS for this one-off style" | Tailwind utilities handle 95% of cases without custom CSS. Use `@apply` sparingly. |
| "Inline styles are the same as Tailwind utilities" | Tailwind utilities follow design system tokens; inline styles bypass the design system entirely. |
| "I'll use arbitrary values like `w-[123px]` everywhere" | Arbitrary values break consistency. Use theme tokens (`w-12`, `p-4`) unless no token exists. |
| "More breakpoint variants make the design more responsive" | This app is simple — avoid over-engineering responsive variants. Mobile-first with minimal breakpoints. |

## Red Flags

- Adding a `style="..."` attribute when a Tailwind utility class would work
- Using `!important` in custom CSS instead of Tailwind's specificity utilities
- Copy-pasting long utility chains without extracting a shared component or pattern
- Defining custom colors/spacing in `tailwind.config` instead of using the built-in palette

## Verification

- [ ] No custom CSS files or `<style>` blocks — all styling uses Tailwind utilities
- [ ] All colors used are from the project's design token palette (blue-600, gray-*, red-500)
- [ ] Touch targets are at least 44x44px on mobile
- [ ] Focus-visible ring is present on all interactive elements
