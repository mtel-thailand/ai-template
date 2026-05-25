# Stack Decision Framework

> **Audience:** Tech Lead — required reading before any architecture recommendation.
> **Purpose:** Standardise the stack selection process so every project starts with a well-reasoned technical foundation.

## The Decision Tree

Before recommending ANY stack, the Tech Lead MUST walk through this decision tree:

```
START HERE
│
├─ Does the app need a server/backend?
│   ├─ NO → Is offline support required?
│   │   ├─ NO → SPA (React, Vue, Svelte) + localStorage/indexedDB
│   │   └─ YES → SPA + Service Worker + IndexedDB + sync engine
│   │
│   └─ YES → What kind of backend?
│       ├─ API-only (separate frontend) → Choose API framework + DB
│       ├─ Fullstack (SSR/hybrid) → Choose fullstack framework
│       └─ BFF (Backend for Frontend) → Lightweight API layer
│
├─ What is the deployment target?
│   ├─ Static hosting (Vercel, Netlify, Cloudflare Pages, S3+CloudFront)
│   ├─ Container (Docker on ECS, GKE, self-hosted)
│   ├─ Serverless (Lambda, Cloud Functions)
│   └─ Edge (Cloudflare Workers, Deno Deploy, Vercel Edge)
│
├─ What is the team size and experience?
│   ├─ Solo developer / small team (≤3)
│   ├─ Medium team (4–10)
│   └─ Large team / enterprise (10+)
│
├─ What is the expected scale at launch and in 6 months?
│   ├─ < 100 DAU — simple architecture is fine
│   ├─ 100–10K DAU — needs moderate planning
│   └─ 10K+ DAU — needs serious consideration of caching, DB, CDN
│
├─ What is the data model complexity?
│   ├─ Simple (≤5 entities, flat relationships) — document DB is fine
│   ├─ Moderate (5-15 entities, relational) — SQL recommended
│   └─ Complex (15+ entities, graph-like) — SQL + ORM or graph DB
│
├─ Is authentication required?
│   ├─ No auth — public app
│   ├─ Simple auth — email/password or magic link
│   └─ Complex auth — OAuth, SSO, RBAC, MFA
│
├─ What is the hosting budget?
│   ├─ $0–$20/month — static hosting + free tier DB
│   ├─ $20–$200/month — managed hosting + DB
│   └─ $200+/month — dedicated infrastructure
│
└─ What are the performance / latency targets?
    ├─ Instant (LCP < 1.5s) — SSG/SSR required, CDN, edge caching
    ├─ Fast (LCP < 2.5s) — SPA with optimised bundles
    └─ Standard (LCP < 4s) — Most architectures suffice
```

The Tech Lead MUST document the answer to EVERY question in the "Initial Stack Selection" ADR (see template below).

## Stack Comparison Table

### Frontend-Only (SPA / Static)

| Criterion | React + Vite | Vue + Vite | Svelte + Vite | Solid + Vite |
|-----------|-------------|------------|---------------|--------------|
| Bundle size (approx) | 40-50 KB gzip | 30-35 KB gzip | 10-15 KB gzip | 8-12 KB gzip |
| Learning curve | Moderate | Low | Low | Moderate |
| Ecosystem size | Largest (Meta) | Large (community) | Medium | Small but growing |
| TypeScript support | Excellent | Good | Good | Excellent |
| SSR/SSG support | Next.js, Remix | Nuxt | SvelteKit | SolidStart |
| State management | Built-in + external | Built-in + Pinia | Built-in (stores) | Built-in (signals) |
| Job market | Largest | Medium | Growing | Niche |
| Best for | Large ecosystems, hiring needs | Teams wanting convention | Performance-critical apps | Cutting-edge performance |

### Fullstack (SSR/Hybrid)

| Criterion | Next.js (React) | Nuxt (Vue) | SvelteKit (Svelte) | Remix (React) |
|-----------|----------------|------------|-------------------|---------------|
| Rendering | SSG, SSR, ISR, RSC | SSG, SSR, Hybrid | SSG, SSR, SPA | SSR only |
| Data fetching | RSC, Server Actions | useAsyncData, Server Routes | load functions | loader/action pattern |
| API routes | Built-in | Built-in (Nitro) | Built-in | Built-in |
| Backend flexibility | Node.js only | Node.js (Nitro) | Node.js | Node.js |
| Deployment | Vercel (optimised), self-host | Vercel, Netlify, node | Vercel, Netlify, node | Fly.io, self-host |
| Learning curve | Steep (App Router) | Moderate | Low | Moderate |
| Best for | React shops, Vercel users | Vue shops | Performance-first teams | Web-standard patterns |

### API-Only Backend

| Criterion | NestJS | FastAPI (Python) | Express | Hono | tRPC |
|-----------|--------|-----------------|---------|------|------|
| Language | TypeScript | Python | JavaScript/TS | TypeScript | TypeScript |
| Architecture | Modular (modules/DI) | Fast (decorators) | Minimal | Minimal, fast | RPC over REST |
| Type safety | Strong | Medium (Pydantic) | Weak | Strong | Strict (end-to-end) |
| Learning curve | Steep | Moderate | Low | Moderate | Moderate |
| ORM support | Prisma, TypeORM, Drizzle | SQLAlchemy, Prisma | Any | Any | Any (via adapter) |
| API style | REST/GraphQL | REST | REST | REST | RPC |
| Best for | Enterprise TypeScript | ML/AI + API | Lightweight APIs | Edge/serverless | TypeScript monolith |

### Databases

| Criterion | SQLite | PostgreSQL | MySQL | MongoDB | Supabase | Firebase |
|-----------|--------|------------|-------|---------|----------|----------|
| Deployment | Embedded / file | Server / managed | Server / managed | Server / managed | Managed Postgres | Managed |
| Data model | Relational | Relational | Relational | Document | Relational | Document |
| Offline | Built-in (file) | Partial | Partial | Partial | No | Yes (Firestore) |
| Scale | Single-user / small | Medium-large | Medium-large | Large | Medium | Large |
| Hosting cost | Included (no server) | $0–$500+ | $0–$500+ | $0–$500+ | $0–$100+ | $0–pay-per-use |
| Real-time | No | Via extensions | No | Change streams | Built-in (Realtime) | Built-in |
| Best for | Local-first, mobile | Fullstack apps | Traditional apps | Flexible schemas | Fullstack + real-time | Rapid prototyping |

## Initial Stack Selection ADR Template

Every new project MUST fill in this template before the design gate opens. The Tech Lead copies this template to `/docs/adr/001-initial-stack-selection.md` and fills in all sections.

```markdown
# ADR-001: Initial Stack Selection

## Status
Accepted

## Context

[Summarise the project vision in 2-3 sentences.]

**Decision Tree Answers:**

1. **Backend required?** [Yes/No] — [explanation]
2. **Offline support?** [Yes/No] — [explanation]
3. **Deployment target:** [Static/Container/Serverless/Edge] — [explanation]
4. **Team size & experience:** [solo/small/medium/large] — [explanation of team's primary skills]
5. **Expected scale:** [DAU now, DAU in 6 months] — [explanation]
6. **Data model complexity:** [Simple/Moderate/Complex] — [explanation]
7. **Auth required?** [None/Simple/Complex] — [explanation]
8. **Hosting budget:** [$ range] — [explanation]
9. **Performance targets:** [Instant/Fast/Standard] — [explanation with LCP targets]

## Decision

**Frontend:** [Framework + build tool]
**Backend (if any):** [Framework + database]
**Testing:** [Vitest/Playwright/Jest]
**Deployment:** [Platform + method]
**Persistent storage:** [Database / localStorage / IndexedDB]

**Rationale:**
[2-3 paragraphs explaining why these choices fit the answers above.]

## Consequences

**What becomes easier:**
- [Specific benefit 1]
- [Specific benefit 2]

**What becomes harder:**
- [Specific trade-off 1]
- [Specific trade-off 2]

**What needs to be done:**
- [ ] Install and configure [framework]
- [ ] Set up [CI/CD tool]
- [ ] Create [package.json scripts]
- [ ] Write [initial tests]

## Alternatives Considered

### Option A: [Stack Name] (chosen)
- Pros: [...]
- Cons: [...]

### Option B: [Stack Name]
- Pros: [...]
- Cons: [...]
- Why rejected: [...]

### Option C: [Stack Name]
- Pros: [...]
- Cons: [...]
- Why rejected: [...]
```

## Verification Checklist

Before the design gate opens:
- [ ] All decision tree questions answered
- [ ] Stack comparison table consulted for each layer (frontend, backend, DB)
- [ ] Initial Stack Selection ADR filed at `/docs/adr/001-initial-stack-selection.md`
- [ ] ADR includes at least 2 alternatives per layer with honest trade-offs
- [ ] Consequences include specific actions (checkbox list)
