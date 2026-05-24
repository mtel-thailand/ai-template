---
name: nestjs
description: NestJS backend patterns including modules, controllers, services, DTOs, guards, interceptors, pipes, and decorators. Use for all server-side Node.js API work in this project.
license: MIT
compatibility: opencode
metadata:
  audience: be
  workflow: implementation
---

## When to use this skill

Load this skill when creating or modifying NestJS modules, controllers, services, DTOs, guards, or middleware. Use when designing API endpoints, setting up dependency injection, configuring validation pipes, or implementing auth guards.

## Framework

This project uses **NestJS** — an opinionated Node.js framework built with TypeScript, decorators, and dependency injection. It uses Express under the hood by default.

## Module Structure

```
src/
├── main.ts                          # App bootstrap (NestFactory.create)
├── app.module.ts                    # Root module
├── modules/
│   └── <feature>/
│       ├── <feature>.module.ts      # @Module decorator
│       ├── <feature>.controller.ts  # Route handlers
│       ├── <feature>.service.ts     # Business logic
│       ├── dto/                     # Data Transfer Objects
│       │   ├── create-<feature>.dto.ts
│       │   └── update-<feature>.dto.ts
│       └── entities/                # TypeORM entities / schemas
└── common/
    ├── guards/                      # Auth/role guards
    ├── interceptors/                # Logging, timing, transforms
    ├── pipes/                       # Validation, transformation
    ├── filters/                     # Exception filters
    └── decorators/                  # Custom parameter/method decorators
```

## Key Decorators & Patterns

| Decorator | Usage |
|-----------|-------|
| `@Module({ imports, controllers, providers, exports })` | Defines a module |
| `@Controller('prefix')` | Controller with route prefix |
| `@Injectable()` | Service, guard, pipe, or interceptor |
| `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()` | HTTP method handlers |
| `@Param('id')` | Route parameter |
| `@Body()` | Request body |
| `@Query('page')` | Query parameter |
| `@Headers('authorization')` | Header value |
| `@UseGuards(AuthGuard)` | Apply a guard |
| `@UsePipes(ValidationPipe)` | Apply a pipe |

## DTOs & Validation

- DTOs are TypeScript classes with `class-validator` decorators:
  ```typescript
  import { IsString, IsOptional, MinLength } from 'class-validator'
  export class CreateTodoDto {
    @IsString()
    @MinLength(1)
    title: string
  }
  ```
- Register `ValidationPipe` globally in `main.ts`:
  ```typescript
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  ```
- Use `@ApiProperty()` decorator from `@nestjs/swagger` when OpenAPI docs are needed.

## Guards & Authorization

- Guards implement `CanActivate` interface:
  ```typescript
  @Injectable()
  export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean { ... }
  }
  ```
- Apply globally, per controller, or per route handler.

## Error Handling

- Use built-in HTTP exceptions: `NotFoundException`, `BadRequestException`, `UnauthorizedException`, etc.
- Custom exception filters for consistent error response shapes:
  ```typescript
  @Catch(HttpException)
  export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) { ... }
  }
  ```

## Dependency Injection

- NestJS DI is constructor-based:
  ```typescript
  @Injectable()
  export class TodoService {
    constructor(private readonly repo: TodoRepository) {}
  }
  ```
- Modules declare providers and export them for sharing across modules.
- Use `@Global()` decorator sparingly — prefer explicit module imports.

## Testing

- Use `@nestjs/testing` `Test.createTestingModule()` for unit tests
- Mock providers using custom providers or `jest.mock()`
- E2E tests use `supertest` with `app.getHttpServer()`

## Configuration

- Use `@nestjs/config` package with `.env` files
- Access config: `constructor(private configService: ConfigService) {}`
- Validate config schema with Joi or Zod

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Services should call other services directly" | Use module imports and provider injection — keep services decoupled via their module's `exports`. |
| "Validation in the controller is enough" | Validate at every boundary (DTO, service, DB) for defense in depth. A global `ValidationPipe` helps but doesn't cover all cases. |
| "One module for the whole app is simpler" | Feature modules keep concerns separated, improve testability, and prevent circular dependencies. |
| "`@Global()` modules are convenient for shared services" | `@Global()` creates hidden dependencies. Prefer explicit module imports for clarity. |

## Red Flags

- Circular imports between modules — indicates a design flaw; restructure into shared modules
- Controllers with business logic (controllers should be thin — delegate to services)
- Services that instantiate other services directly instead of relying on DI
- Missing `@Injectable()` decorator on a class used as a provider
- Catching all exceptions in a filter without logging

## Verification

- [ ] Every feature follows the module structure: `module.ts`, `controller.ts`, `service.ts`, `dto/`
- [ ] ValidationPipe is registered globally with `whitelist: true` and `forbidNonWhitelisted: true`
- [ ] All providers are declared in their module's `providers` array and exported if needed
- [ ] Services use constructor-based DI — no `new` instantiation of other services
- [ ] Unit tests use `Test.createTestingModule()` with mocked providers
