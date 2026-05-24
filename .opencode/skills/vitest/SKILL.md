---
name: vitest
description: Unit testing with Vitest for FE and BE code
license: MIT
compatibility: opencode
metadata:
  audience: fe, be
  workflow: testing
---

## When to use this skill

Load this skill when writing or running unit tests — component tests
with Testing Library, hook tests, or backend service/logic tests.
Also load when troubleshooting a failing test, adding test coverage,
or setting up test infrastructure.

## Overview

Vitest is the test runner for this project. FE uses it with Testing Library
for component and hook tests. BE uses it for unit/integration tests of
services and logic. Tests are organized co-located with source files,
use realistic DOM interactions, and run in watch mode during development
or CI mode for merges.

---

## Process

### localStorage Mock Helper

Since this project relies on `localStorage` for persistence, tests must
mock it to avoid polluting the real browser storage or Node.js globals.

Use this standard mock helper:

```typescript
// src/test-utils/localStorageMock.ts

/**
 * Creates a fully mocked localStorage with the Storage interface.
 * Call in `beforeEach` / `afterEach` of any test that touches localStorage.
 */
export function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    get length() { return store.size; },
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
  };
}
```

Apply in tests:

```typescript
import { createLocalStorageMock } from '../test-utils/localStorageMock';

beforeEach(() => {
  const mock = createLocalStorageMock();
  vi.stubGlobal('localStorage', mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

For convenience, a reusable setup file:

```typescript
// src/test-utils/setup.ts
import { createLocalStorageMock } from './localStorageMock';

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

Register it in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test-utils/setup.ts'],
  },
});
```

### Component Test Template (Testing Library)

```typescript
// src/components/TodoItem.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodoItem } from './TodoItem';

const defaultTodo = {
  id: '1',
  title: 'Buy milk',
  completed: false,
  labels: ['groceries'],
};

describe('TodoItem', () => {
  it('renders the todo title and toggle checkbox', () => {
    render(<TodoItem todo={defaultTodo} onToggle={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Buy milk')).toBeVisible();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onToggle when checkbox is clicked', async () => {
    const onToggle = vi.fn();
    render(<TodoItem todo={defaultTodo} onToggle={onToggle} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  it('shows completed state', () => {
    render(
      <TodoItem
        todo={{ ...defaultTodo, completed: true }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(<TodoItem todo={defaultTodo} onToggle={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('1');
  });
});
```

### Hook Test Template (renderHook)

```typescript
// src/hooks/useTodos.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTodos } from './useTodos';

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTodos', () => {
  it('starts with an empty list', () => {
    const { result } = renderHook(() => useTodos());
    expect(result.current.todos).toEqual([]);
  });

  it('adds a todo', () => {
    const { result } = renderHook(() => useTodos());

    act(() => {
      result.current.addTodo('Buy milk');
    });

    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0].title).toBe('Buy milk');
    expect(result.current.todos[0].completed).toBe(false);
  });

  it('toggles a todo completion state', () => {
    const { result } = renderHook(() => useTodos());

    act(() => {
      result.current.addTodo('Buy milk');
    });

    const todoId = result.current.todos[0].id;

    act(() => {
      result.current.toggleTodo(todoId);
    });

    expect(result.current.todos[0].completed).toBe(true);

    act(() => {
      result.current.toggleTodo(todoId);
    });

    expect(result.current.todos[0].completed).toBe(false);
  });

  it('persists todos to localStorage', () => {
    const { result } = renderHook(() => useTodos());

    act(() => {
      result.current.addTodo('Buy milk');
    });

    const stored = JSON.parse(localStorage.getItem('ai-todo-todos')!);
    expect(stored.todos).toHaveLength(1);
    expect(stored.version).toBe(1);
  });
});
```

### Coverage Thresholds Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/e2e/**',
        'src/types/**',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

Run coverage with:
```bash
npx vitest --coverage
```

Coverage reports are generated in `coverage/` (HTML, LCOV, and text summary).

### Watch Mode vs CI Mode Workflow

| Mode | Command | Behavior | When to use |
|------|---------|----------|-------------|
| **Watch** | `npx vitest` | Re-runs tests on file changes; uses interactive UI | Development — every save re-runs affected tests |
| **UI** | `npx vitest --ui` | Opens Vitest UI in browser for filtering, re-running, and debugging | Development — visual test runner |
| **CI** | `npx vitest run` | Runs once, exits with non-zero on failure | CI pipeline, pre-commit hook |
| **Coverage** | `npx vitest --coverage` | Runs once with coverage reporting | Before merge, CI |
| **Changed** | `npx vitest --changed` | Only runs tests for files changed since last commit | Quick local check |

**Optimized CI workflow:**
```bash
npx vitest run --reporter=verbose --reporter=junit --outputFile=junit.xml
```

### Test File Organization Pattern

```
src/
├── components/
│   ├── TodoItem.tsx
│   └── __tests__/
│       └── TodoItem.test.tsx       ← co-located in __tests__/ subdir
├── hooks/
│   ├── useTodos.ts
│   └── __tests__/
│       └── useTodos.test.ts
├── lib/
│   ├── storage.ts
│   └── __tests__/
│       └── storage.test.ts
├── test-utils/
│   ├── localStorageMock.ts         ← reusable mock helpers
│   ├── setup.ts                    ← global setup (auto-loaded)
│   └── test-utils.tsx              ← custom render with providers
```

**Naming conventions:**
- Test files: `*.test.ts` or `*.test.tsx` (not `.spec.ts`)
- Test utils: camelCase, placed in `src/test-utils/`
- Test data factories: `factories.ts` next to test if needed

### Debugging Failing Tests

When a test fails and the error message isn't enough:

```bash
# 1. Get more detail with verbose reporter
npx vitest --reporter=verbose --reporter=json

# 2. Isolate the failing test
npx vitest run src/hooks/__tests__/useTodos.test.ts

# 3. Run only one test case (using .only filter)
npx vitest --testNamePattern="adds a todo"

# 4. Increase test timeout (default 5000ms)
npx vitest --test-timeout=10000

# 5. Run with UI for visual debugging
npx vitest --ui

# 6. Check for un-mocked globals (localStorage, fetch)
#    Add this to the test to verify:
console.log('localStorage before:', globalThis.localStorage);

# 7. Re-run with --reporter=verbose to see each assertion
npx vitest run --reporter=verbose

# 8. If timing-sensitive, add more specific assertions
expect(todos.length).toBe(1);
expect(todos[0].title).toBe('Buy milk');
```

**Common failure patterns and fixes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `localStorage is not defined` | Mock not applied | Add `vi.stubGlobal('localStorage', mock)` in `beforeEach` |
| `Cannot find module` | Wrong import path | Check file name matches `__tests__/` location |
| `TestingLibraryElementError: Unable to find role` | Wrong query | Use `screen.logTestingPlaygroundURL()` to see rendered output |
| Test passes alone but fails in a suite | Shared state | Reset mocks and state in `afterEach` |
| Async test times out | Missing `await` | Check all user interactions are awaited (`await userEvent.click(...)`) |

---

## Common Rationalizations

| Rationalization | Why it's dangerous | What to do instead |
|----------------|-------------------|-------------------|
| "I don't need to test the hook — the component test covers it" | Component tests don't verify hook return values or internal state changes directly | Write focused hook tests with `renderHook` for 100% hook coverage |
| "I'll skip the mock — localStorage works in jsdom" | The real localStorage persists across tests, causing flaky failures | Always mock localStorage; use the standard helper |
| "Coverage thresholds are too strict for a small project" | Low coverage now sets a precedent; coverage debt is hard to pay down later | Start with 80% thresholds; adjust down only with team agreement |
| "I can test all the state through UI clicks" | Complex state flows are much faster to test at the hook level | Use renderHook for state logic; use component tests only for rendering and interaction |
| "I'll write tests after the feature is done" | Tests written after the fact often miss edge cases and are harder to write | Write tests alongside implementation (TDD-light) — even a skeleton test helps |

## Red Flags

- ⛔ No `afterEach` cleanup — tests leak mocks, timers, or globals
- ⛔ `localStorage` is used without a mock in any test file
- ⛔ Tests use `screen.debug()` committed to the test file (debug output in tests)
- ⛔ Test assertions are too vague — `expect(result).toBeDefined()` without specific value checks
- ⛔ `describe` blocks that are nested more than 2 levels deep
- ⛔ Skipped tests (`it.skip`) without a linked issue explaining why
- ⛔ Coverage below 70% in any category without a documented exception
- ⛔ Tests that depend on real timers without `vi.useFakeTimers()` for time-sensitive logic

## Verification Checklist

- [ ] All hooks have unit tests covering add, toggle, delete, addLabel, removeLabel
- [ ] All components render basic states (default, empty, error, with data)
- [ ] localStorage mock is applied in `beforeEach` and cleaned in `afterEach`
- [ ] User interactions use `@testing-library/user-event` (not `fireEvent`)
- [ ] Tests query by role/text/label, not by class name or test ID (semantic queries)
- [ ] Coverage thresholds met: statements ≥ 80%, branches ≥ 70%, functions ≥ 80%, lines ≥ 80%
- [ ] Test suite runs cleanly with `npx vitest run` (no flaky failures)
- [ ] No `it.skip` or `describe.skip` without a linked issue
- [ ] Test files are co-located in `__tests__/` next to the source file
- [ ] Mock helpers are shared (not duplicated) across test files
- [ ] Console errors/warnings from React are caught and asserted (or suppressed explicitly)
- [ ] Async operations are properly awaited (no unhandled promise rejections in tests)
