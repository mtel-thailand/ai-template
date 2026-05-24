---
name: ux-skill
description: How to write a UX spec including user flows, screen inventory, component states, accessibility requirements, and handoff checklist.
license: MIT
compatibility: opencode
metadata:
  audience: ux
  workflow: design
---

## When to use this skill

Load this skill when designing a user-facing feature — new screen, new component, revised flow, or any interaction change. Essential for the UX designer during the Design phase. Do NOT use for backend-only changes or infrastructure work.

## Overview

The UX spec is the single source of truth for how the feature looks, feels, and behaves. It bridges the gap between the PO's acceptance criteria and the FE's implementation. A complete UX spec means the FE can implement without asking "what should this look like when X happens?" The design gate stays closed until every component state is defined.

## Required Sections

Every UX spec MUST contain these sections:

### 1. User Flow
A step-by-step numbered list of the user's journey through the feature. Each step includes: what the user does, what the system does, and what state the screen is in.

Format:
```
Step 1: User opens the app
  → System shows the todo list (empty state if first visit)
Step 2: User types "Buy milk" and presses Enter
  → System adds the todo, clears the input, shows the new item at the top of the list with active state
  → List counter updates from "0 items" to "1 item"
```

### 2. Screen Inventory
List every distinct screen or view the feature touches, including:
- Screen name (e.g. "Main Todo List")
- URL or route (e.g. `/`)
- Purpose (one sentence)
- Relationship to other screens (parent/child/peer)

### 3. Component States
For every interactive element, define ALL of these states that apply:

| State | When | Visual | Behaviour |
|-------|------|--------|-----------|
| Default | Element rendered, no interaction | Description or reference | N/A |
| Hover | Pointer over element | Description or reference | N/A |
| Focus | Keyboard focus | Description or reference | Keyboard action |
| Active / Pressed | Mouse down / touch start | Description or reference | N/A |
| Loading | Async operation in progress | Description or reference | Disable interaction |
| Empty | No data to display | Description or reference | CTA or message |
| Error | Operation failed | Description or reference | Retry option |
| Success | Operation completed | Description or reference | Timeout or dismiss |
| Disabled | Action not available | Description or reference | No interaction |

Minimum required states per element type:
- **Buttons**: default, hover, focus, active, disabled, loading
- **Input fields**: default, focus, filled, error, disabled
- **Lists**: populated, empty, loading, error
- **Toggles / switches**: on, off, disabled
- **Links**: default, hover, focus, visited

### 4. Accessibility Requirements
For each interactive element, cite the specific WCAG 2.1 AA success criteria by number:

| Element | WCAG SC | Requirement |
|---------|---------|-------------|
| Add button | 2.4.4 | Link purpose in context: aria-label="Add todo" |
| Delete button | 2.5.3 | Label in name: visible label matches accessible name |
| Label remove X | 2.4.4 | aria-label="Remove {label} from {title}" |
| Color-only info | 1.4.1 | Never use color alone to convey state |
| Focus indicator | 2.4.7 | Visible focus ring on all interactive elements |
| Error messages | 4.1.3 | aria-describedby on the input linked to the error |
| Keyboard navigation | 2.1.1 | All functions available from keyboard |

### 5. Copy Guidelines
- Error messages: State what went wrong + why + what the user can do next
- Empty states: Explain what this area is for + CTA to start
- Buttons: Verb + noun (e.g. "Add todo", not "Submit")
- Confirmations: Never "Are you sure?" — state what will happen + undo option if applicable

## Wireframe Fidelity Standard

Wireframes are required before the design gate opens. Acceptable formats (any of these):

1. **Annotated ASCII art** — text-based diagrams showing layout, spacing, and element placement with numbered callouts
2. **Markdown tables** — component inventory with visual description column
3. **Hand-drawn sketches** — photo/scan with annotations (acceptable for early-stage)
4. **Low-fi Figma / Balsamiq** — grayscale, no visual design polish needed

NOT acceptable:
- Verbal descriptions alone
- "It will look like X app" without specifics
- Final visual design before flow and states are approved

## Handoff Checklist (FE Confirms Before Implementation)

The FE must confirm all of these before starting implementation:

- [ ] Every interactive element has all required states defined
- [ ] Empty state has content and CTA
- [ ] Error state has message and recovery action
- [ ] Loading state has visual indicator
- [ ] Focus order matches visual order
- [ ] All text content is final (or marked [TBD] with a decision deadline)
- [ ] WCAG success criteria are called out by number for each component
- [ ] Color contrast ratios meet WCAG AA (4.5:1 normal, 3:1 large text)
- [ ] Touch targets are at least 44x44px
- [ ] Keyboard navigation flow is documented
- [ ] Screen reader announcements are specified for dynamic content

## Worked Example: Good UX Spec for Label Input

**Component:** LabelAdder
**User Flow Step:** "User clicks + to add a label to a todo"
**States:**

| State | Visual | Behaviour |
|-------|--------|-----------|
| Default (collapsed) | "+ add" button (text-xs, text-gray-400, hover:text-gray-600) | Click to expand |
| Expanded | `<input type="text" placeholder="Add label..." autofocus>` with `<datalist>` of existing labels | Enter/comma adds. Escape closes. Click outside closes. |
| Typing | Same as expanded, with input value visible | Filtering datalist suggestions by typed text |
| Error (max reached) | Silently ignored — input stays open, label not added | N/A — no error shown |
| Empty submission | Silently ignored — input stays open | N/A |

**Accessibility:**
- 2.4.7: Focus ring on input when expanded
- 4.1.2: aria-label="Add label to {todo title}" on the + button
- 2.1.1: Enter to add, Escape to close
- 1.4.1: No color-only indicators

**Copy:**
- Add button: "+ add" (not "+")
- Placeholder: "Add label..."
- No error messages for guardrail violations (silent ignore)

## Worked Example: Bad UX Spec

**Component:** Label stuff
**States:** It should look nice and work well.
**Accessibility:** Make it accessible.
**Copy:** TBD

### Why This is Bad
- No component naming — "Label stuff" is not actionable
- "Look nice and work well" is not a spec
- "Make it accessible" without citing WCAG criteria is not an accessibility requirement
- "TBD" copy means the FE cannot implement the text
- No state breakdown means the FE will guess what happens on error, loading, empty

## Common Failure Modes

| Failure Mode | Symptom | Fix |
|-------------|---------|-----|
| **Missing states** | FE implements default but not error/loading/empty | Use the state matrix — check every element against all 9 states |
| **Vague copy** | "Error message here" | Write the exact error text. It's copy, not a placeholder. |
| **WCAG without numbers** | "Make it keyboard accessible" | Cite specific SC: "2.1.1: All functions available from keyboard" |
| **Visual-only spec** | "The button is blue" without describing behaviour | Every visual change needs a corresponding behaviour note |
| **Skipping empty state** | "The empty state is obvious" | No — define the message, illustration, and CTA |
| **Flow without screens** | Describes steps but not screen layout | Pair the flow with a screen inventory |
| **No handoff** | FE starts coding and immediately has questions | Complete the handoff checklist before design gate opens |

## Verification Checklist

Before the design gate opens:
- [ ] User flow is documented as step-by-step numbered list
- [ ] Screen inventory lists every distinct view
- [ ] Every interactive element has all applicable states defined
- [ ] WCAG 2.1 AA criteria are cited by number for each component
- [ ] Copy is final (no [TBD] except by explicit deadline agreement)
- [ ] Wireframe exists in an acceptable format
- [ ] FE has confirmed the handoff checklist
