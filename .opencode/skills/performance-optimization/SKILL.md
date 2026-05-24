---
name: performance-optimization
description: Measure-first performance workflow with Core Web Vitals targets, profiling, bundle analysis, and React/memo optimization patterns.
license: MIT
compatibility: opencode
metadata:
  audience: fe
  workflow: optimization
---

## When to use this skill

Load this skill when optimizing page load times, reducing bundle size, improving runtime responsiveness, or diagnosing performance regressions. Always use before applying premature optimizations.

## Overview

Performance optimization follows a strict measure-first approach. Never optimize without profiling first — you'll likely optimize the wrong thing. This skill covers the performance workflow, targets, and common optimization patterns.

## Core Web Vitals Targets

| Metric | Target | What It Measures |
|--------|--------|-----------------|
| LCP (Largest Contentful Paint) | < 2.5s | Loading performance |
| CLS (Cumulative Layout Shift) | < 0.1 | Visual stability |
| INP (Interaction to Next Paint) | < 200ms | Interactivity responsiveness |
| TTFB (Time to First Byte) | < 800ms | Server response time |
| FCP (First Contentful Paint) | < 1.8s | First content rendered |

## The Performance Workflow

```
Measure → Identify → Optimize → Verify → Ship
```

### Step 1: Measure
Always start with a baseline measurement:
- **Bundle analysis:** `npx vite-bundle-analyzer` or `npx source-map-explorer`
- **Runtime profiling:** Browser DevTools Performance tab, React Profiler
- **Core Web Vitals:** Lighthouse, Web Vitals library, PageSpeed Insights
- **Network:** DevTools Network tab for waterfall analysis

### Step 2: Identify
Pinpoint the specific bottleneck:
- Bundle too large? → Analyze bundle composition
- Slow render? → Profile component re-renders
- Layout shift? → Check for missing dimensions on images/embeds
- Slow interactions? → Check event handler performance

### Step 3: Optimize
Apply the targeted fix (see patterns below).

### Step 4: Verify
Re-measure with the same tool and conditions. Confirm improvement.

### Step 5: Ship
Only ship if the optimization is verified. Unverified optimizations are just complexity.

## Optimization Patterns

### Bundle Size
- **Code splitting:** `React.lazy()` + `Suspense` for route-level splitting
- **Tree shaking:** Avoid side-effect imports, use named exports
- **Dependency audit:** Regularly check bundle contribution of each dependency
- **Image optimization:** Use modern formats (WebP, AVIF), lazy loading, proper sizing

### React Rendering
- **`React.memo`:** Use only on components that re-render with the same props and are expensive to render. Profile first.
- **`useMemo`:** Use for expensive computations. Do NOT use for trivial calculations or to "stabilize" props unnecessarily.
- **`useCallback`:** Use when passing callbacks to memoized children. Do NOT wrap every function.
- **`key` props:** Use stable, unique keys (not array indices) for list items.

### General Patterns
- **Virtualize long lists:** Use `react-window` or `@tanstack/virtual` for 100+ items
- **Debounce rapid inputs:** Search inputs, resize handlers, scroll events
- **Avoid forced layouts:** Batch DOM reads/writes, avoid layout thrashing
- **Lazy load below-fold content:** Intersection Observer for images and components

## What NOT to Optimize

- **Premature optimization:** Don't optimize code that runs once or is rarely executed
- **Micro-optimizations:** Replacing `forEach` with `for` loops usually isn't worth it
- **Bundle size at the cost of readability:** A 1KB library that saves 50 lines of clear code is often fine
- **Optimizing for synthetic benchmarks:** Real user conditions matter more than Lighthouse scores

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll add memo to all components to be safe" | `memo` has overhead. Use it only where profiling shows benefit. |
| "I know what the bottleneck is without measuring" | You're almost certainly wrong. Measure first. |
| "This optimization might help" | If you can't measure it, you can't ship it. |

## Red Flags

- Optimizing without a baseline measurement
- `useMemo`/`useCallback` wrapped around every value/function
- `React.memo` on components with trivial render cost
- No bundle analysis before shipping

## Verification

- [ ] Baseline measurement taken before optimization
- [ ] Optimization targeted at identified bottleneck
- [ ] Post-optimization measurement confirms improvement
- [ ] All tests pass after optimization
- [ ] No readability regression from optimization
