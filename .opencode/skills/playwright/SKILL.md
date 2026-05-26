---
name: playwright
description: End-to-end testing with Playwright for QA verification
license: MIT
compatibility: opencode
metadata:
  audience: qa
  workflow: testing
---

## When to use this skill

Load this skill when writing or running end-to-end tests — full user
flow verification, cross-cutting concerns (persistence, reload), or
automated accessibility audits. QA uses this during verification phase
and for regression testing.

## Overview

Playwright is the E2E test runner for this project. Tests simulate real
user interactions across the integrated application, verifying that all
layers (UI, state, persistence) work together correctly. Tests are
organized by tag hierarchy, run in CI with sharding for speed, and
capture traces for failure debugging.

---

## Process

### Test Scope

- Full user flows: create → label → complete → delete → refresh
- Cross-cutting concerns: persistence across page reloads, localStorage round-trips
- Accessibility: axe-core integration for automated a11y checks
- Regression: every acceptance test from the feature spec

### Page Object Model Template

Each page or major component gets a Page Object that encapsulates
selectors and actions:

```typescript
// src/e2e/pages/TodoPage.ts
import { Page, Locator } from '@playwright/test';

export class TodoPage {
  readonly page: Page;
  readonly newTodoInput: Locator;
  readonly todoList: Locator;
  readonly hideCompletedToggle: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newTodoInput = page.getByPlaceholder('Add a new todo...');
    this.todoList = page.getByRole('list', { name: /todos/i });
    this.hideCompletedToggle = page.getByRole('switch', { name: /hide completed/i });
    this.emptyState = page.getByText(/no todos yet/i);
  }

  async goto() {
    await this.page.goto('/');
  }

  async addTodo(title: string) {
    await this.newTodoInput.fill(title);
    await this.newTodoInput.press('Enter');
  }

  async toggleTodo(title: string) {
    await this.page.getByRole('checkbox', { name: title }).click();
  }

  async addLabel(todoTitle: string, label: string) {
    await this.page
      .getByRole('listitem')
      .filter({ hasText: todoTitle })
      .getByRole('button', { name: /add label/i })
      .click();
    await this.page
      .getByRole('textbox', { name: /new label/i })
      .fill(label);
    await this.page
      .getByRole('textbox', { name: /new label/i })
      .press('Enter');
  }

  async removeLabel(todoTitle: string, label: string) {
    await this.page
      .getByRole('listitem')
      .filter({ hasText: todoTitle })
      .getByRole('button', { name: `Remove ${label}` })
      .click();
  }

  async deleteTodo(title: string) {
    await this.page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('button', { name: /delete/i })
      .click();
  }
}
```

### Test Isolation Strategy

Every test must start from a clean, predictable state:

```typescript
import { test, expect } from '@playwright/test';
import { TodoPage } from './pages/TodoPage';

test.beforeEach(async ({ page }) => {
  // 1. Clear localStorage to guarantee no residual state from previous tests
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  // 2. Reload so the app initializes with empty state
  await page.reload();

  // 3. (Optional) Seed specific test data via localStorage
  // await page.evaluate((todos) => {
  //   localStorage.setItem('app-tasks', JSON.stringify(seedData));
  // }, seedData);
  // await page.reload();
});
```

**Rules:**
- Never share fixture data between tests (`test.describe` isolation is not enough)
- Each test creates the specific data it needs (using the Page Object methods)
- Avoid hard-coded localStorage blobs — use the UI to create state when possible
- For performance-sensitive tests, seed data directly via `page.evaluate`

### Accessibility Audit Integration

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('todo page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Add a new todo...').fill('Test todo');
  await page.getByPlaceholder('Add a new todo...').press('Enter');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('main')
    .analyze();

  // Filter to only critical/serious violations
  const violations = results.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );

  expect(violations).toEqual([]);
});
```

### Screenshot-on-Failure Workflow

Configure automatic screenshot capture in `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure', // optional, increases storage
  },
  // ...
});
```

For custom failure screenshots within a test:

```typescript
test('complex flow', async ({ page }, testInfo) => {
  // ... test steps ...
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.testId}.png`,
      fullPage: true,
    });
  }
});
```

### Test Tagging Hierarchy

```
@smoke         → Core happy paths (canary for deployment)
  @regression  → Full regression suite (runs on every PR)
    @accessibility → Axe-core a11y checks
```

```typescript
// Tag usage examples:
test('create a todo and verify persistence @smoke', async ({ page }) => { ... });
test('complete a todo @smoke @regression', async ({ page }) => { ... });
test('add and remove labels @regression', async ({ page }) => { ... });
test('todo list has no a11y violations @accessibility', async ({ page }) => { ... });

// Run specific tags:
// npx playwright test --grep @smoke
// npx playwright test --grep @regression
// npx playwright test --grep-invert @smoke    # everything except smoke
```

### CI Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,        // retry failed tests in CI
  workers: process.env.CI ? 4 : undefined, // fixed workers in CI
  shard: process.env.CI ? { current: process.env.SHARD_INDEX, total: 4 } : undefined,

  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  // reporter configuration for different environments
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['blob']]    // CI: HTML + Blob
    : [['html', { open: 'on-failure' }]],          // Local: HTML on failure
});
```

**CI workflow integration:**

```yaml
# .github/workflows/ci.yml (fragment)
test-e2e:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install chromium
    - run: npx playwright test --shard=${{ matrix.shard }}/4
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report-shard-${{ matrix.shard }}
        path: playwright-report/
```

### Reporting

| Report type | When to use | Viewing |
|-------------|-------------|---------|
| **HTML** | Local development, CI artifact | `npx playwright show-report` opens browser |
| **Blob** | CI only — lightweight, merges across shards | Merge with `npx playwright merge-reports` then view HTML |
| **JSON** | CI pipeline — machine-readable | Pipe to custom dashboard or notifications |
| **JUnit** | CI pipeline — integrates with JUnit-compatible tools | Supported via `@playwright/test` built-in reporters |

---

## Common Rationalizations

| Rationalization | Why it's dangerous | What to do instead |
|----------------|-------------------|-------------------|
| "E2E tests are too slow — unit tests are enough" | Unit tests can't verify browser APIs, persistence, or cross-component integration | Tag slow flows as `@regression` and run them in CI; keep `@smoke` fast |
| "I don't need Page Objects — my tests are short" | Tests with inline selectors are brittle; one selector change means updating every test | Extract even simple Page Objects — the ROI shows on the first refactor |
| "Screenshots on failure take too much space" | A few KB per failure is a tiny price for instant debugging | Enable only `screenshot: 'only-on-failure'`; purge after review |
| "I'll fix flaky tests later" | Flaky tests destroy trust in the test suite — everyone starts ignoring failures | Fix flakiness immediately or mark as `@flaky` and track with an issue |
| "Accessibility checks can be manual" | Manual a11y audits are time-consuming and inconsistent; automated checks catch ~40% of violations | Add axe-core as a CI step — it's fast and catches the most common violations |

## Red Flags

- ⛔ Tests share state (e.g., same localStorage data) without clearing in `beforeEach`
- ⛔ Tests use `page.waitFor(5000)` instead of waiting for specific conditions
- ⛔ Hard-coded URLs or selectors that are duplicated across test files
- ⛔ No tags on tests (all tests run on every invocation)
- ⛔ `@smoke` tests that take longer than 30 seconds total
- ⛔ No trace capture configured — failures are hard to debug
- ⛔ Tests only run locally and are not part of CI
- ⛔ Skipped tests without a linked issue explaining why

## Verification Checklist

- [ ] All critical user flows covered by `@smoke` tests
- [ ] Tests run against a clean state (localStorage cleared in `beforeEach`)
- [ ] Page Objects encapsulate selectors and actions for each page/component
- [ ] Axe-core accessibility audit integrated and running in CI
- [ ] Screenshot and trace capture enabled on failure
- [ ] Tests tagged with appropriate hierarchy (`@smoke`, `@regression`, `@accessibility`)
- [ ] CI configuration includes sharding and retries
- [ ] No `page.waitFor(timeout)` — all waits are condition-based (`waitForSelector`, `toBeVisible`)
- [ ] HTML report is generated and accessible as a CI artifact
- [ ] Test suite runs in ≤ 5 minutes for `@smoke`, ≤ 15 minutes for full `@regression`
- [ ] All previously flaky tests have a documented root cause or issue link
- [ ] Every test has a clear, descriptive name that explains the scenario
