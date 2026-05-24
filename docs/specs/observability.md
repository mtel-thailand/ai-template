# Observability Specification

> **Audience:** DevOps (observability owner), BE, FE
> **Purpose:** Define the minimum instrumentation standard so every feature ships with telemetry, error logging, and performance monitoring.

## Ownership

Observability is owned by **DevOps**. The DevOps agent is responsible for:

1. Defining the event tracking schema for the project
2. Ensuring every feature has the required events before shipping
3. Setting up error logging infrastructure
4. Configuring performance monitoring (Lighthouse CI, RUM)
5. Maintaining dashboards (if applicable)
6. Reviewing telemetry in PRs that add or change user-facing features

## What Is a "Trackable Event"

A trackable event is any user-initiated action that changes application state or navigates between views. Every trackable event MUST emit a structured payload with at least these fields:

```typescript
interface TrackableEvent {
  /** Unique name for this event type. Reverse-domain recommended: feature.action */
  event_name: string
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string
  /** Unique session identifier (generated on app load, persisted in memory) */
  session_id: string
  /** User identifier or anonymous identifier */
  user_id: string | null
  /** Anonymous identifier if user is not authenticated */
  anonymous_id: string | null
  /** Which feature area this event belongs to */
  feature_area: string
  /** Whether the action succeeded, failed, or was aborted */
  outcome: 'success' | 'failure' | 'cancelled'
}
```

### Event Naming Convention
Format: `<feature>:<action>` in present tense, snake_case

| Good | Bad |
|------|-----|
| `todo:created` | `Todo Created` (spaces) |
| `label:added` | `addLabel` (camelCase) |
| `filter:toggled_completed` | `FILTER_COMPLETED` (SCREAMING) |
| `error:occurred` | `error` (too vague) |

## Required Events for Every Application

These events MUST be implemented before any application can ship:

| Event | Trigger | Payload Fields |
|-------|---------|----------------|
| `app:loaded` | Application mounts for the first time | `{ load_time_ms, is_new_session }` |
| `feature:used` | User interacts with any feature | `{ feature_name, interaction_type }` |
| `error:occurred` | Any caught or unhandled exception | `{ error_message, error_stack, route, user_agent }` |
| `user:onboarded` | User completes onboarding (or first action) | `{ onboarding_step, time_to_complete_s }` |

### Feature-Level Events (examples)

| Event | When |
|-------|------|
| `todo:created` | User adds a new todo |
| `todo:completed` | User checks a todo as done |
| `todo:deleted` | User deletes a todo |
| `todo:uncompleted` | User unchecks a todo |
| `label:added` | User adds a label to a todo |
| `label:removed` | User removes a label from a todo |
| `filter:toggled_completed` | User toggles "hide completed" |
| `filter:applied_label` | User clicks a label to filter (v1.1+) |

## Error Logging Standard

### Client-Side (SPA / Browser)

```
Unhandled exceptions MUST be caught at the root application boundary
and logged with:

1. Full stack trace
2. User agent string (navigator.userAgent)
3. Current route / URL
4. Timestamp (ISO 8601)
5. Session ID
6. Previous action(s) that led to the error (breadcrumbs)
```

Implementation:

```typescript
window.addEventListener('error', (event) => {
  logError({
    type: 'unhandled',
    message: event.message,
    stack: event.error?.stack,
    route: window.location.pathname,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  })
})

window.addEventListener('unhandledrejection', (event) => {
  logError({
    type: 'unhandled_promise',
    message: event.reason?.message ?? String(event.reason),
    stack: event.reason?.stack,
    route: window.location.pathname,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  })
})
```

### Client-Side Logging Targets
- **Development**: Console only (console.error with structured format)
- **Production**: Send to a logging service (Sentry, LogRocket, Datadog RUM, or a custom endpoint)
- **If no logging service configured**: Store last 50 errors in localStorage for retrieval

### Server-Side (Fullstack Apps)
- All API 5xx responses must be logged server-side
- All authentication failures must be logged with timestamp, IP, and attempted user
- Log level mapping: 4xx = WARN, 5xx = ERROR, unhandled = FATAL

## Client-Side Only vs Fullstack Monitoring

### Client-Side Only App (SPA + localStorage)

| What to Monitor | How |
|-----------------|-----|
| App load time | `performance.timing` or Navigation API |
| Error rate | Error event listener + storage |
| Feature usage | Manual event tracking (console.log in dev, API call or beacon in prod) |
| Bundle size | Lighthouse CI |
| Render performance | React DevTools Profiler (ad hoc) |

### Fullstack App (API + Database)

| What to Monitor | How |
|-----------------|-----|
| API response times | Middleware that logs duration per endpoint |
| Error rate by endpoint | Centralised error handler |
| Database query performance | ORM query logging / slow query log |
| Cache hit ratio | If using Redis/Memcached |
| CPU / Memory | Cloud provider metrics |
| Uptime | Health check endpoint + monitoring (Pingdom, UptimeRobot) |
| Real user monitoring | Lighthouse CI, Web Vitals library, RUM service |

## Verification Checklist

Before a PR merges:
- [ ] All new user interactions have corresponding event tracking
- [ ] Events follow the naming convention (`feature:action`)
- [ ] Error boundary catches unhandled exceptions at the root
- [ ] Error payload includes stack trace, route, user agent, session ID
- [ ] Feature-level events are documented in the PR or Issue
- [ ] If fullstack: API error logging middleware is in place
- [ ] If production: logging service is configured (or Issue filed to configure it)
