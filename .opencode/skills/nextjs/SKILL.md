---
name: nextjs
description: Next.js App Router patterns including file-based routing, Server Components, data fetching, API routes, and rendering strategies. Use for any Next.js frontend work including pages, layouts, and metadata.
license: MIT
compatibility: opencode
metadata:
  audience: fe
  workflow: implementation
---

## When to use this skill

Load this skill when creating or modifying Next.js pages, layouts, API routes, or any file under the `app/` directory. Also use when making Server Component vs Client Component decisions, configuring Next.js, or debugging Next.js-specific behavior.

## Framework

This project uses Next.js with the **App Router** (`app/` directory). Pages are files in `app/**/page.tsx`, layouts in `app/**/layout.tsx`, and API routes in `app/**/route.ts`.

## Routing

| File Convention | Purpose |
|----------------|---------|
| `app/page.tsx` | Root route `/` |
| `app/layout.tsx` | Root layout — wraps all pages |
| `app/blog/[slug]/page.tsx` | Dynamic route `/blog/:slug` |
| `app/blog/[slug]/layout.tsx` | Layout scoped to blog section |
| `app/api/[...slug]/route.ts` | Catch-all API route |
| `(group)` folder | Route group — no path segment added |
| `_folder` | Private folder — excluded from routing |

## Data Fetching

- **Server Components (default)**: fetch data with `async` component + `fetch()`. Next.js deduplicates and caches automatically.
- **Client Components**: use `"use client"` directive + `useEffect` or a data-fetching library for interactive data loading.
- **Revalidation**: `fetch(url, { next: { revalidate: 60 } })` for ISR (time-based).
- **Dynamic rendering**: `export const dynamic = 'force-dynamic'` at the page level.
- **Loading UI**: `loading.tsx` per route segment — wraps content in Suspense automatically.
- **Error UI**: `error.tsx` per route segment — catches errors and shows fallback. Pair with `error.tsx` files.

## Server vs Client Components

- **Default**: All components in `app/` are Server Components. They run on the server, reduce JS bundle, and can be `async`.
- **Add `"use client"`** only when you need: `useState`, `useEffect`, `useContext`, browser APIs, event handlers, or custom hooks that use these.
- **Keep the directive boundary low** — put `"use client"` in leaf components, not layout or page files, to maximize server rendering.

## Metadata & SEO

- Export a `metadata` object or `generateMetadata()` function from `page.tsx` or `layout.tsx`.
- Template: `export const metadata = { title: 'Page Title', description: '...' }`
- Dynamic: `export async function generateMetadata({ params }: Props): Promise<Metadata> { ... }`

## API Routes

- Files: `app/api/<route>/route.ts`
- Named exports: `export async function GET(request: NextRequest) { ... }`
- Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Return: `NextResponse.json(data)` or `NextResponse.redirect(url)`

## Configuration

- `next.config.ts` at project root — use `import type { NextConfig } from 'next'`
- Environment variables: `NEXT_PUBLIC_*` prefix for client-side, `process.env.*` for server-only

## Image Optimization

- Use `next/image` (`Image` component) for automatic optimization, lazy loading, and responsive images
- Remote images: configure `remotePatterns` in `next.config.ts`
- Local images: import and pass to `<Image>` — dimensions auto-detected

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll add `'use client'` to the whole page" | Keep `'use client'` in leaf components — maximize server rendering by pushing the directive boundary down. |
| "Client Components can't use async data" | Use Server Components for data fetching, pass results as props to client components. |
| "All images should use `<img>` for simplicity" | `next/image` provides automatic optimization, lazy loading, and responsive images — always prefer it. |
| "I'll handle loading with a `useState` flag" | Use `loading.tsx` per route segment — it wraps content in Suspense automatically. |
| "API routes are the best place for heavy computation" | API routes run on the server but block the response. Offload heavy work to background jobs or serverless functions. |

## Red Flags

- Adding `"use client"` to a layout file — layouts should be Server Components wrapping client leaf components
- Using `useEffect` for data fetching when a Server Component could do it
- Importing server-only modules (like `fs`, `prisma`) into a client component
- Missing `alt` text on `next/image` components
- Not using `generateMetadata()` for dynamic pages

## Verification

- [ ] `"use client"` is only in leaf components, never in pages or layouts
- [ ] Data fetching uses Server Components with `async` + `fetch()` where possible
- [ ] Each route segment has `loading.tsx` and `error.tsx` where appropriate
- [ ] All images use `next/image` with proper `alt` attributes
- [ ] `tsc -b` and `npm run build` pass without errors
