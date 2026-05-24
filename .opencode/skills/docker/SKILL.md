---
name: docker
description: Docker containerization patterns for frontend and backend services
license: MIT
compatibility: opencode
metadata:
  audience: devops
  workflow: infrastructure
---

## When to use this skill

Load this skill when containerizing the application — creating or
modifying Dockerfiles, docker-compose files, .dockerignore, or any
container-related infrastructure. Used by DevOps for build/release
pipeline setup.

## Current state

This project does not yet have Docker configuration. These are the patterns to follow when adding it.

## Frontend (static SPA)

- Multi-stage build: `node:22-alpine` for build, `nginx:alpine` for serve
- Build step: `npm ci` → `npm run build`
- Serve with nginx: copy `dist/` to nginx html dir, configure SPA fallback
- Expose port 80

## Backend (future)

- Multi-stage build: `node:22-alpine` for build + runtime
- Build step: `npm ci` → `npm run build`
- Run with `node` (not `nodemon` or ts-node in production)
- Expose application port (e.g. 3000 or 8080)

## Compose (future)

- `docker-compose.yml` at project root for local development
- Services: frontend, backend (future), database (future)
- Use volumes for hot-reload in dev, not in production

## Best practices

- Pin base image SHAs, not tags
- Use `COPY --chown=node:node` for non-root user
- Add health checks
- Don't run containers as root
- `.dockerignore` mirrors `.gitignore` + excludes `node_modules` from COPY

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "`latest` tag is fine for development" | Pin base image SHAs for reproducibility and supply-chain security — tags can change under you. |
| "I'll add everything to one container" | Separate concerns: build container, runtime container, database container. Each process in its own container. |
| "I don't need a `.dockerignore`" | Without it, `COPY . .` includes `node_modules` and other large directories, bloating the build context and cache. |
| "Root is fine inside a container" | Never run containers as root. Use `USER node` or `COPY --chown=node:node` for non-root execution. |

## Red Flags

- Multi-stage builds without using `--from=` to copy only artifacts between stages
- Using `npm install` instead of `npm ci` in production builds — `npm ci` is deterministic and faster
- Exposing ports that aren't documented in the Dockerfile or docker-compose.yml
- Hardcoding environment-specific values (API URLs, secrets) in the Dockerfile

## Verification

- [ ] Dockerfiles use multi-stage builds with a minimal runtime base image
- [ ] Base images are pinned by SHA digest, not tag
- [ ] Containers run as non-root user
- [ ] `.dockerignore` exists and excludes `node_modules`, `.git`, and build artifacts
- [ ] Health checks are configured for all services
