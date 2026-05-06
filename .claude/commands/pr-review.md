---
description: Reviews the current branch diff for code quality, test coverage, security, and payment safety before opening a PR.
---

Review all changes on the current branch compared to main. This is a pre-PR review.

## Step 1 — Get the diff

Run `git diff main...HEAD --stat` to see which files changed, then `git diff main...HEAD` for the full diff.

## Step 2 — Review each changed file

For each changed file, check:

### Code Quality
- No `any` TypeScript types
- No `SELECT *` in Python
- No hardcoded strings (use i18n keys)
- Business logic is in service layer, not routes
- Error handling present
- No dead/commented code

### Security
- No secrets or credentials in code
- New endpoints have auth middleware
- New endpoints have role guards
- Stripe webhooks verify signatures

### Payment Safety (if payments code changed)
- Payment lifecycle not violated
- Escrow release requires proper preconditions
- All transitions log to `audit_logs`

### Tests
- New features have corresponding tests
- Modified features still have passing test coverage
- Edge cases covered

### Migrations
- If DB schema changed: Alembic migration exists
- New tables have RLS policies

### i18n / RTL (if frontend changed)
- New strings use `next-intl` keys
- Layout works in RTL Hebrew

## Step 3 — Check for missing pieces

- UI change without API change (or vice versa)?
- New API endpoint without a Playwright E2E test?
- New DB table without RLS migration?

## Output format

```
## PR Review

### Summary
[2-3 sentences describing what the change does]

### Blockers (must fix before merge)
[list with file:line and description]

### Warnings (should fix)
[list]

### Suggestions (optional)
[list]

### Test coverage
ADEQUATE | INSUFFICIENT — [details]

### Verdict: APPROVE | REQUEST_CHANGES
```
