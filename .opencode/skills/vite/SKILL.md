---
name: vite
description: Vite 8 build tooling configuration and scripts for this project
license: MIT
compatibility: opencode
metadata:
  audience: fe, devops
  workflow: implementation, ci-cd
---

## When to use this skill

Load this skill when working with the build system — modifying
vite.config.ts, troubleshooting build failures, adding/removing
plugins, configuring env vars, or setting up CI build steps. Not
needed for routine component work or backend code.

## Setup

This project uses Vite 8 with the React plugin (`@vitejs/plugin-react`) and Tailwind CSS plugin (`@tailwindcss/vite`).

## Commands

- `npm run dev` — starts dev server with HMR on port 5173
- `npm run build` — runs `tsc -b` then `vite build`
- `npm run preview` — serves production build locally
- `npm run lint` — runs ESLint

## Configuration

- Config file: `vite.config.ts` at project root
- Build output: `dist/` (gitignored)
- Entry point: `index.html` at root (not in `src/`)
- Env vars: Vite-native `import.meta.env` — prefix with `VITE_`

## CI considerations

- Build is fast (~100ms for this project)
- No code splitting needed — single-page app is small
- Output: `index.html` + hashed JS/CSS bundles in `dist/assets/`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I need to add a custom webpack loader" | Vite uses Rollup plugins — check the Vite plugin ecosystem first before writing a custom plugin. |
| "Build errors are always my code's fault" | First check `vite.config.ts`, `tsconfig` paths, and plugin versions — the config is often the culprit. |
| "I'll configure Babel for transforms" | Vite handles TypeScript and modern JS natively via esbuild. Only add Babel if a specific plugin (like `emotion`) requires it. |
| "Environment variables are available during build" | Only `VITE_*` prefixed variables are available. Non-prefixed vars are stripped for security. |

## Red Flags

- Adding Babel plugins without first checking if esbuild can do the same transformation
- Hardcoding API URLs in source code instead of using `import.meta.env.VITE_API_URL`
- Committing `dist/` or the build output to version control
- Modifying `index.html` entry point without understanding Vite's HTML handling
- Using `require()` instead of `import` in ESM context

## Verification

- [ ] All environment variables used in client code are prefixed with `VITE_`
- [ ] `npm run build` completes without errors
- [ ] No custom webpack loaders — Vite/Rollup plugins used instead
- [ ] Preview build (`npm run preview`) works and serves the app correctly
