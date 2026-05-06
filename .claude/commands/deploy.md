---
description: Pre-deploy checklist — runs typecheck, lint, unit tests, checks migration status, and verifies E2E smoke tests pass before deployment.
---

Run the pre-deploy checklist for Groupio. Do not proceed if any step fails.

## Step 1 — TypeScript type check

```bash
pnpm typecheck
```

If this fails: fix all type errors before continuing.

## Step 2 — Lint

```bash
pnpm lint
```

If this fails: fix all lint errors. Warnings are acceptable, errors are not.

## Step 3 — Frontend unit tests

```bash
pnpm test
```

If this fails: fix failing tests before continuing.

## Step 4 — Backend tests (if backend changed)

```bash
pytest tests/unit/ -x --tb=short
```

If this fails: fix failing tests.

## Step 5 — Migration status

```bash
alembic current
alembic heads
```

If `current` does not match `heads`: run `alembic upgrade head` and verify it succeeds.

## Step 6 — Environment variables

Check that all required env vars from `.env.example` are set in the deployment environment.
Critical vars to verify:
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- `ANTHROPIC_API_KEY`
- `REDIS_URL`
- `JWT_SECRET`

## Step 7 — Smoke E2E test

```bash
pnpm --filter @groupio/web exec playwright test --project=chromium e2e/smoke/
```

If this fails: investigate before deploying.

## Step 8 — Final checklist

- [ ] No `.env` file with real secrets is being committed
- [ ] All migrations applied to target environment DB
- [ ] Stripe webhook endpoint URL configured in Stripe dashboard
- [ ] No `console.log` debug statements left in production code
- [ ] Sentry DSN configured for error tracking

## Output

For each step: PASS | FAIL | SKIPPED (with reason)

If all steps pass: **READY TO DEPLOY**
If any step fails: **NOT READY — fix [list of issues] first**
