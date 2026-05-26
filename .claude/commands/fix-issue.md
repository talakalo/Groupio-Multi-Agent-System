---
description: Traces and fixes a reported issue. Usage: /fix-issue <description of the problem>
---

You need to investigate and fix this issue: **$ARGUMENTS**

## Investigation process

### Step 1 — Understand the problem
- What is the expected behavior?
- What is the actual behavior?
- Which role(s) experience this issue?
- Which layer is likely responsible (UI, API, service, DB, RLS)?

### Step 2 — Trace the code path
Follow the full stack from UI to DB:
1. Find the relevant UI component in `apps/web/` or `apps/admin/`
2. Find the API call (check `packages/api-client` and the React Query hook)
3. Find the FastAPI route in `src/api/routes/`
4. Find the service in `src/services/`
5. Find the DB query in `src/databases/postgres.py`
6. Check if RLS could be blocking something

### Step 3 — Identify root cause
State clearly: what is the root cause and in which file/line?

### Step 4 — Implement the minimal fix
- Fix only what is broken — no refactoring, no scope creep
- If the fix touches payment or escrow logic, apply extra caution and check lifecycle rules
- If the fix changes a DB query, verify RLS is still enforced

### Step 5 — Write a test
- Write a test that would have caught this bug
- Playwright spec if it's a UI/flow bug
- Vitest unit test if it's a component/hook bug
- pytest test if it's a backend service bug

## Output

1. Root cause analysis (2-3 sentences)
2. Files changed and what changed in each
3. The fix (actual code)
4. The test that proves the fix works
5. Any related issues to watch for
