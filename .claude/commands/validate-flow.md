---
description: Validates a specific user flow end-to-end — UI, API, DB, RLS, and edge cases. Usage: /validate-flow <flow name>
---

Validate the following flow end-to-end: **$ARGUMENTS**

## Validation checklist

For the flow described above, trace every layer of the stack:

### 1. UI Layer (`apps/web/` or `apps/admin/`)
- [ ] Page/component exists for this flow
- [ ] Correct role guard (only the right role can access)
- [ ] Loading state handled
- [ ] Error state handled
- [ ] Hebrew RTL layout works
- [ ] Uses `next-intl` for strings (no hardcoded text)
- [ ] Uses React Query for data fetching

### 2. API Layer (`src/api/routes/`)
- [ ] Endpoint exists for each action in the flow
- [ ] Pydantic input validation on request body
- [ ] Auth middleware applied
- [ ] Role guard matches the role that should perform this action
- [ ] Returns appropriate HTTP status codes
- [ ] Error messages don't expose internals

### 3. Service Layer (`src/services/`)
- [ ] Business logic is in a service, not the route handler
- [ ] Async patterns used correctly
- [ ] No `SELECT *` queries

### 4. Database Layer
- [ ] Tables involved in this flow have RLS enabled
- [ ] RLS policies correctly restrict access by role
- [ ] FK relationships are correct
- [ ] No orphan data risk from this flow

### 5. Edge Cases
- [ ] What happens if a required resource doesn't exist? (404 handling)
- [ ] What happens on concurrent actions? (two residents joining simultaneously)
- [ ] What happens if payment fails mid-flow?
- [ ] What happens if the user has the wrong role?

### 6. Tests
- [ ] Playwright E2E test covers this flow
- [ ] Both English and Hebrew Playwright projects would pass
- [ ] Python unit/integration test covers the service logic

## Output format

```
## FLOW VALIDATION: [flow name]

### Result: PASS | FAIL | PARTIAL

### Layer-by-layer status
UI:       PASS | FAIL — [details]
API:      PASS | FAIL — [details]
Service:  PASS | FAIL — [details]
Database: PASS | FAIL — [details]
RLS:      PASS | FAIL — [details]
Tests:    PASS | FAIL — [details]

### Issues found
[file path + line number + description for each issue]

### Fix plan
[ordered list of what to fix, starting with blockers]
```
