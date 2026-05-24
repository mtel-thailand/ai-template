---
name: node
description: Node.js server patterns for backend implementation with NestJS framework
license: MIT
compatibility: opencode
metadata:
  audience: be
  workflow: implementation
---

## When to use this skill

Load this skill when implementing or modifying server-side code — NestJS modules, controllers, services, middleware, guards, or data access layer. Not needed for frontend-only work or config changes.

## Environment

This project runs on Node.js (LTS). TypeScript is compiled via the NestJS build pipeline (which uses `tsc` under the hood). The BE agent should use Node.js LTS features and avoid experimental APIs unless approved.

## Framework

This project uses **NestJS** — an opinionated Node.js framework built with TypeScript, decorators, and dependency injection. See the `nestjs` skill for detailed patterns.

## Structure

```
src/
├── main.ts                   # Bootstrap: NestFactory.create, global pipes/filters
├── app.module.ts             # Root module
├── modules/<feature>/        # Feature modules (controller, service, module)
└── common/                   # Shared guards, interceptors, pipes, filters
```

## Patterns

- **Modular architecture** — each feature is a NestJS module (`@Module({})`)
- **Controllers** handle HTTP — thin, delegate to services
- **Services** contain business logic — `@Injectable()`, injected via constructor
- **Validation** at the boundary with `class-validator` DTOs + global `ValidationPipe`
- **Error handling** via NestJS HTTP exceptions and custom exception filters
- **Auth** via NestJS guards (`@UseGuards()`)

## API Conventions

- RESTful URL patterns (`/api/v1/resource`)
- Consistent error response shape: `{ error: { code, message, details? } }`
- Success responses: `{ data: ... }` envelope
- Pagination: `{ data: [], meta: { page, limit, total } }`
- OpenAPI/Swagger docs via `@nestjs/swagger` decorators

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Node.js 22 supports top-level await everywhere" | Only in ESM modules — check the module system (`"type": "module"` in package.json) before using top-level await. |
| "`process.env` is always safe to read" | Use validated config via `@nestjs/config` with Joi/Zod schema validation. Raw `process.env` reads can miss typos. |
| "I don't need error handling for this API call" | Every API boundary needs try/catch. Unhandled promise rejections crash the Node process. |
| "Console logging is fine for production" | Use structured logging (winston, pino) for production — `console.log` lacks levels, formatting, and searchability. |

## Red Flags

- Using `fs` sync methods in request handlers — blocks the event loop
- Missing `await` on async NestJS service calls — leads to unhandled promise rejections
- DTOs without `class-validator` decorators — leaves the API vulnerable to malformed input
- Hardcoded secrets in source code instead of environment variables or a secrets manager

## Verification

- [ ] All async operations have proper `await` or `.catch()` handling
- [ ] Configuration is validated via `@nestjs/config` with Joi/Zod schema
- [ ] No sync filesystem operations (`readFileSync`, `writeFileSync`) in request handlers
- [ ] All DTOs use `class-validator` decorators for input validation
- [ ] Secrets and API keys are read from environment variables, not hardcoded
