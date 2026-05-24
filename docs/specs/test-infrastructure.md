# Test Infrastructure Specification

> **Audience:** BE, FE, QA, DevOps
> **Purpose:** Define a consistent, executable test scaffold that every project uses from day one.

## Test Framework Choices

| Layer | Framework | Rationale |
|-------|-----------|-----------|
| Unit tests | **Vitest** | Native TypeScript + ESM support. Reuses Vite config (transform pipeline). Jest-compatible API. Watch mode is instant (HMR). 2-5x faster than Jest for TypeScript projects. |
| Component/Integration | **Vitest + Testing Library** | Testing Library enforces testing behaviour over implementation. Vitest's JSDOM integration is seamless. Avoids Enzyme (deprecated) and React Test Renderer (implementation-coupled). |
| E2E | **Playwright** | Cross-browser (Chromium, Firefox, WebKit). Auto-wait, network interception, visual regression. Faster and more reliable than Cypress. Can test on mobile viewports. |
| Accessibility | **axe-core** (via `@axe-core/playwright`) | Industry standard. Checks WCAG 2.1 AA criteria programmatically. Integrates directly into Playwright E2E tests. |

**Why NOT Jest:** Slower startup (ts-jest), ESM support still experimental, requires separate config from Vite.

**Why NOT Cypress:** Single-browser focus (Chrome-family), slower execution, heavier CI footprint, less reliable auto-wait.

## Required Folder Structure

```
project-root/
├── src/
│   ├── __tests__/                    # Unit tests (mirrors src structure)
│   │   ├── components/
│   │   │   ├── TodoItem.test.tsx
│   │   │   └── LabelBadge.test.tsx
│   │   ├── hooks/
│   │   │   └── useTodos.test.ts
│   │   └── utils/
│   │       └── format-date.test.ts
│   ├── __mocks__/                    # Manual mocks (Vitest)
│   │   └── localStorage.ts
│   └── [source files]
├── e2e/                              # E2E tests (Playwright)
│   ├── fixtures/                     # Test data / factories
│   │   └── todos.ts
│   ├── specs/                        # Test spec files
│   │   ├── todo-crud.spec.ts
│   │   └── labels.spec.ts
│   ├── auth.setup.ts                 # Auth setup (if applicable)
│   └── playwright.config.ts
├── test-utils/                       # Shared test utilities
│   ├── render.tsx                    # Custom render with providers
│   ├── helpers.ts
│   └── mocks.ts
├── vitest.config.ts                  # Vitest configuration
└── coverage/                         # Coverage output (gitignored)
```

### Rationale for Co-location
- Tests live next to source (under `__tests__/`) for discoverability
- E2E tests are separated because they test the complete app, not individual units
- Fixtures live in `e2e/fixtures/` to be shared across E2E specs
- `test-utils/` is a top-level directory because multiple test layers share it

## Naming Conventions

### Test Files
- Unit/integration tests: `<name>.test.ts` or `<name>.test.tsx` (mirrors source file name)
- E2E tests: `<feature-name>.spec.ts`
- Test utilities: `<name>.ts` (no test suffix)

### Test Descriptions (Vitest)
- Outer `describe`: PascalCase component or camelCase function name
- Inner `describe`: behaviour category ("states", "interactions", "edge cases")
- `it` / `test`: sentence in present tense, starting with "should"

```typescript
// Good
describe('TodoItem', () => {
  describe('states', () => {
    it('should show the title text', () => { ... })
    it('should show a checked checkbox when completed', () => { ... })
  })
  describe('interactions', () => {
    it('should call onToggle when checkbox is clicked', () => { ... })
    it('should call onDelete when delete button is clicked', () => { ... })
  })
})

// Bad
describe('todo', () => {
  it('works', () => { ... })
  it('tests toggle', () => { ... })
})
```

### Test IDs
- Use `data-testid` attributes for DOM queries (more resilient than CSS selectors)
- Format: `kebab-case`, prefixed with component name: `todo-item-checkbox`, `label-remove-urgent`

## Minimum Smoke Test

Before ANY feature work begins, this smoke test MUST pass:

```typescript
// src/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('App smoke test', () => {
  it('should render without crashing', async () => {
    const { default: App } = await import('../App')
    // If using React Testing Library:
    // render(<App />)
    // expect(screen.getByText('Add Todo')).toBeTruthy()
    expect(App).toBeDefined()
  })
})
```

And for E2E:

```typescript
// e2e/specs/smoke.spec.ts
import { test, expect } from '@playwright/test'

test('root route returns 200', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
})

test('app renders without crashing', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('text=Add Todo')).toBeVisible()
})
```

## CI Integration

| CI Step | Test Suite | Command | Failure Threshold |
|---------|-----------|---------|-------------------|
| Unit tests | `src/**/*.test.{ts,tsx}` | `vitest run --coverage` | Any failure; coverage < 80% |
| E2E tests | `e2e/**/*.spec.ts` | `playwright test` | Any failure |
| Accessibility | axe-core via Playwright | Part of E2E | Any critical/serious violation |

### CI Configuration Example

```yaml
# Extract from .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npx vitest run --coverage
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - run: npm run build
```

## Verification Checklist

Before the design gate opens:
- [ ] Vitest configured in `vitest.config.ts` (or `vite.config.ts`)
- [ ] Playwright configured in `e2e/playwright.config.ts`
- [ ] Smoke test exists and passes
- [ ] Folder structure matches the spec above
- [ ] CI configuration includes unit + E2E steps
- [ ] Coverage threshold configured (≥ 80%)
- [ ] `data-testid` naming convention documented for FE
