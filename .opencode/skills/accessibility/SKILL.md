---
name: accessibility
description: WCAG AA patterns, ARIA roles, keyboard navigation, and contrast requirements
license: MIT
compatibility: opencode
metadata:
  audience: fe, ux, qa
  workflow: design, implementation, testing
---

## When to use this skill

Load this skill when designing or implementing user-facing UI that must
meet WCAG AA conformance — building interactive controls, managing focus,
writing ARIA attributes, or auditing for accessibility violations.
Relevant for UX (design spec), FE (implementation), and QA (verification).

## Overview

Accessibility is a first-class concern. Every UI feature must be
navigable and understandable by keyboard-only users, screen reader users,
and users with low vision. We target **WCAG 2.1 AA** conformance,
organized around the four **POUR** principles: Perceivable, Operable,
Understandable, Robust.

---

## Process

### WCAG 2.1 AA — POUR Principles

#### Perceivable — users must be able to perceive the UI

| Guideline | Project application |
|-----------|-------------------|
| **1.1.1 Non-text Content** | Icons (delete, add, toggle) must have `aria-label` or visible text |
| **1.3.1 Info and Relationships** | Todo list items wrapped in `<li>` inside `<ul>`; labels associated via `htmlFor` |
| **1.4.1 Use of Color** | Status is never conveyed by color alone — completed items also have a checkmark |
| **1.4.3 Contrast (Minimum)** | Text contrast ≥ 4.5:1; large text (≥18px bold or ≥24px) ≥ 3:1 |
| **1.4.4 Resize Text** | All text can zoom to 200% without loss of content or functionality |
| **1.4.11 Non-text Contrast** | Focus indicators, borders, and UI components ≥ 3:1 against adjacent colors |

#### Operable — users must be able to operate the UI

| Guideline | Project application |
|-----------|-------------------|
| **2.1.1 Keyboard** | Tab moves between todos; Enter/Space activates; Escape closes LabelAdder |
| **2.4.3 Focus Order** | Tab order follows visual order: AddTodo → toggle → title → labels → delete |
| **2.4.7 Focus Visible** | `focus-visible:ring-2` on all interactive elements |
| **2.5.8 Target Size (min)** | Touch targets ≥ 44×44 px (checkbox, delete button, label pills) |

#### Understandable — users must be able to understand the UI

| Guideline | Project application |
|-----------|-------------------|
| **3.2.1 On Focus** | Focusing a control does not trigger a context change (no auto-submit) |
| **3.2.2 On Input** | Changing a form value does not auto-submit without warning |
| **3.3.1 Error Identification** | Input validation errors described in text (e.g., "Label already exists") |

#### Robust — the UI must work with current and future user agents

| Guideline | Project application |
|-----------|-------------------|
| **4.1.2 Name, Role, Value** | Custom controls (LabelBadge × button) have appropriate `role` and `aria-label` |
| **4.1.3 Status Messages** | "3 completed hidden" uses `aria-live="polite"` or `role="status"` |

### Focus Management Flow

When opening/closing UI elements, focus must be managed predictably:

```
Open LabelAdder (expandable "+" input)
  → Save current focus target (the "Add label" button)
  → Focus the new text input
  → User types and submits or presses Escape

Close LabelAdder (submit or Escape)
  → Return focus to the "Add label" button that triggered it
  → This ensures the user can continue tabbing from where they left off

Modal / Overlay (if added)
  → On open: trap focus inside the modal (first focusable element)
  → Tab loops within modal; Shift+Tab cycles backwards
  → Escape closes the modal
  → On close: return focus to the element that opened it
```

Implementation pattern:

```typescript
const [isOpen, setIsOpen] = useState(false);
const triggerRef = useRef<HTMLButtonElement>(null);
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  if (isOpen) {
    inputRef.current?.focus();
  } else {
    triggerRef.current?.focus();
  }
}, [isOpen]);
```

### Screen Reader Testing Workflow

#### VoiceOver (macOS)

| Command | Action |
|---------|--------|
| `Cmd + F5` | Toggle VoiceOver on/off |
| `Ctrl + Option + Right/Left` | Navigate to next/previous element |
| `Ctrl + Option + U` | Open rotor for headings, links, form controls |
| `Ctrl + Option + Space` | Activate the focused element |
| `Ctrl + Option + Shift + Down` | Enter a container (list, table) |
| `Ctrl + Option + Shift + Up` | Exit a container |

#### NVDA (Windows)

| Command | Action |
|---------|--------|
| `Insert + F7` | Open element list (headings, links, landmarks) |
| `Insert + Space` | Toggle browse mode / focus mode |
| `Tab` | Navigate to next focusable element |
| `H` | Cycle through headings |
| `B` | Cycle through buttons |
| `D` | Cycle through landmarks |

#### Test checklist for each feature

1. Navigate the entire feature using only `Tab` and `Shift+Tab` — verify logical order
2. Activate every control with `Enter` / `Space`
3. With VoiceOver/NVDA on, verify that each control announces its role, name, and state
4. Verify that `aria-live` regions announce dynamic updates (e.g., "Todo added", "Label removed")
5. Zoom the browser to 200% — verify no content is clipped or overlaps

### Color Contrast Calculation Process

When reviewing a design or implementing a new color:

```typescript
// Relative luminance formula (WCAG 2.1)
function relativeLuminance(hex: string): number {
  const [r, g, b] = hex.match(/\w\w/g)!.map(c => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio formula
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Usage
const ratio = contrastRatio('#333333', '#FFFFFF'); // text on background
// Passes AA if ratio >= 4.5 for normal text, >= 3 for large text
```

**Quick reference for common pairs:**

| Background | Text | Ratio | Passes AA? | Passes AAA? |
|------------|------|-------|------------|-------------|
| #FFFFFF | #333333 | 10.1:1 | ✅ | ✅ |
| #FFFFFF | #767676 | 3.9:1 | ❌ (normal) / ✅ (large) | ❌ |
| #F3F4F6 | #1F2937 | 11.5:1 | ✅ | ✅ |
| #3B82F6 | #FFFFFF | 3.2:1 | ❌ (normal) / ✅ (large) | ❌ |

### ARIA Live Region Decision Tree

```
Content dynamically updates on the page?
│
├─ Is the update triggered by a user action
│  that the user is already focused on?
│  (e.g., typing in a search field that shows results)
│  └─ YES → `aria-live="polite"` (don't interrupt the current task)
│
├─ Is the update time-sensitive or critical?
│  (e.g., error banner, "session expiring" warning)
│  └─ YES → `aria-live="assertive"` (interrupt immediately)
│
├─ Is the update purely decorative or non-essential?
│  (e.g., a rotating tip, a counter that is visible on screen)
│  └─ YES → `aria-live="off"` or no live region (screen reader reads
│            it when the user navigates to that area)
│
├─ Is the update a status message that doesn't require interaction?
│  (e.g., "3 completed hidden", "Todo saved")
│  └─ Use `role="status"` (which implies `aria-live="polite"`)
│
└─ When in doubt: prefer `polite` over `assertive`
   Using `assertive` too often degrades the experience for screen
   reader users — they hear the update even if they're in the middle
   of reading something else.
```

Project-specific mapping:

| Message | Region type | Rationale |
|---------|-------------|-----------|
| "3 completed hidden" | `role="status"` | Informs user of list state change |
| "Todo added" | `aria-live="polite"` | Confirmation after user action |
| "Label removed" | `aria-live="polite"` | Confirmation after user action |
| "Error loading todos" | `aria-live="assertive"` | Requires user attention |

### Automated A11y Audit in CI

Add an accessibility audit step to the CI workflow:

```yaml
# .github/workflows/ci.yml (fragment)
- name: Accessibility audit
  run: |
    npx playwright test --grep @accessibility --reporter=html
    npx axe-html-reporter ./playwright-report/accessibility.html
```

Alternatively, integrate with `playwright-test` using the `@axe-core/playwright` package:

```typescript
import { injectAxe, checkA11y } from 'axe-playwright';

test('todo list has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await injectAxe(page);
  await checkA11y(page, null, {
    includedImpacts: ['critical', 'serious'],
  });
});
```

---

## Common Rationalizations

| Rationalization | Why it's dangerous | What to do instead |
|----------------|-------------------|-------------------|
| "We can add accessibility later" | Retrofitting a11y is 3–10× more expensive than building it in from the start | Include a11y acceptance criteria in every feature issue |
| "Screen readers are a tiny minority" | ~15% of the global population has some disability; accessibility improvements benefit everyone | Follow POUR principles — they also improve SEO, UX, and DX |
| "It looks fine on my screen" | Many users increase font size, use high-contrast mode, or have color blindness | Test at 200% zoom, with forced colors, and with a color blindness simulator |
| "Keyboard navigation isn't needed — everyone uses a mouse" | Motor disabilities, power users, and anyone with a broken mouse rely on keyboard navigation | Verify every feature is fully operable without a mouse |
| "ARIA attributes make everything accessible" | Incorrect ARIA is worse than no ARIA — it can confuse screen readers | Prefer semantic HTML; use ARIA only when semantics are insufficient |

## Red Flags

- ⛔ Color alone used to convey status (e.g., red text for "urgent" without an icon or text label)
- ⛔ Interactive elements (`<div>` click handler) without `role`, `tabindex`, or keyboard handler
- ⛔ Focus order that jumps around the page (check with Tab key)
- ⛔ No visible focus indicator on interactive elements
- ⛔ `aria-live` set to `assertive` for non-critical updates (e.g., "Todo added")
- ⛔ Image/icon buttons without `aria-label` or visible text
- ⛔ Touch targets smaller than 44×44 px
- ⛔ Contrast ratio below 4.5:1 for normal text (verify with a color contrast checker)
- ⛔ `prefers-reduced-motion` not respected if CSS animations/transitions are used

## Verification Checklist

- [ ] All interactive elements reachable and operable via keyboard (Tab, Enter, Space, Escape)
- [ ] Visible focus indicator on every interactive element (`focus-visible:ring-2`)
- [ ] Screen reader test: all controls announce role, name, and state correctly
- [ ] `aria-live` regions tested for correct timing (polite vs assertive) and content
- [ ] Color contrast checked for all text/background combinations (≥ 4.5:1 normal, ≥ 3:1 large)
- [ ] Touch targets measure ≥ 44×44 px (checkbox, button, badge remove ×)
- [ ] Page zoomed to 200% — no content clipped, overlapping, or hidden
- [ ] Color is never the sole conveyor of information (check for color-only status indicators)
- [ ] Focus management verified: open/close widgets return focus to triggering element
- [ ] Axe-core audit passes with 0 critical/serious violations
- [ ] No empty links or buttons (check for `aria-label` or visible text on icon-only controls)
- [ ] `prefers-reduced-motion` respected if animations are present
- [ ] Form inputs have associated labels (using `htmlFor` or `aria-labelledby`)

## Target

WCAG 2.1 AA conformance for all user-facing features.
