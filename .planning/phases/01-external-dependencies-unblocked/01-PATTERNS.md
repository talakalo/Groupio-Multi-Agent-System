# Phase 1: External Dependencies Unblocked - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 6
**Analogs found:** 5 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/databases/postgres.py` | config (pool kwargs) | request-response | self (lines 105–110) | exact — one-line addition |
| `src/services/whatsapp_bot.py` | service (API client) | request-response | self (line 78) | exact — version string update |
| `src/api/routes/webhooks.py` | route (webhook handler) | event-driven | self (line 279) + `src/services/whatsapp_bot.py` (line 78) | exact — version string sync |
| `.env.example` | config (env documentation) | n/a | self (lines 28–35, 106–109, 144–149) | exact — additive documentation |
| `docker/staging-minimal.env` | config (docker env) | n/a | self (line 24) | exact — one-line update |
| `docs/runbooks/phase1-external-deps.md` | documentation (ops runbook) | n/a | `docs/ASYNC_EVENTS_RUNBOOK.md`, `docs/RUNBOOK.md` | role-match |

---

## Pattern Assignments

### `src/databases/postgres.py` (config, pool kwargs)

**Analog:** Self — the `_POOL_KWARGS` dict at lines 105–110.

**Existing pattern to modify** (lines 105–110):
```python
_POOL_KWARGS = {
    "min_size": 5,
    "max_size": 25,
    "max_inactive_connection_lifetime": 300,
    "command_timeout": 60,
}
```

**Target pattern — add `statement_cache_size: 0` as 5th key:**
```python
_POOL_KWARGS = {
    "min_size": 5,
    "max_size": 25,
    "max_inactive_connection_lifetime": 300,
    "command_timeout": 60,
    "statement_cache_size": 0,  # Required for Supavisor transaction mode (port 6543)
}
```

**How `_POOL_KWARGS` is consumed** (lines 172–176, shown for planner context — do not re-read):
The dict is spread inside `_asyncpg_pool_connect_kwargs()` which is called by `_asyncpg_pool_from_database_url()`. The new key passes through unchanged to `asyncpg.create_pool()`, which accepts it natively.

**No other changes needed in this file.** The helper functions, column lists, and connection logic are unchanged.

---

### `src/services/whatsapp_bot.py` (service, API client)

**Analog:** Self — the `api_url` assignment at line 78.

**Existing pattern** (line 78):
```python
self.api_url = f"https://graph.facebook.com/v18.0/{settings.WHATSAPP_PHONE_ID}/messages"
```

**Also at line 309** (status URL, same class):
```python
status_url = f"https://graph.facebook.com/v18.0/{settings.WHATSAPP_PHONE_ID}/messages"
```

**Target pattern — update both occurrences from `v18.0` to `v21.0`:**
```python
self.api_url = f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
```
```python
status_url = f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
```

**Template send method pattern** (already correct, no change needed).
The existing `send_notification` method signature at line ~437 already accepts `template_name`, `template_params`, and `language` — it is ready for the 5 approved templates without modification.

---

### `src/api/routes/webhooks.py` (route, event-driven)

**Analog:** Self (line 279) — must be brought in sync with `src/services/whatsapp_bot.py`.

**Existing pattern** (lines 263–279, the `_send_whatsapp_reply` function):
```python
async def _send_whatsapp_reply(phone: str, text: str) -> None:
    settings = get_settings()

    if not settings.WHATSAPP_API_TOKEN or not settings.WHATSAPP_PHONE_ID:
        logger.info(
            "WhatsApp reply (dev — no credentials): to=%s text=%s",
            phone,
            text[:100],
        )
        return

    url = f"https://graph.facebook.com/v17.0/{settings.WHATSAPP_PHONE_ID}/messages"
```

**Target pattern — update `v17.0` to `v21.0`:**
```python
    url = f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
```

**Retry and error-handling patterns** (lines 238–306) are already correct — do not alter the `@retry` decorator, `_whatsapp_transient` function, or the `httpx.HTTPStatusError` / `httpx.RequestError` catch blocks. Only the version string in the `url` f-string changes.

---

### `.env.example` (config, env documentation)

**Analog:** Self — existing Supabase block (lines 26–35), WhatsApp block (lines 106–109), and Stripe block (lines 144–149).

**Existing Supabase block pattern** (lines 26–35):
```bash
# Database (for Alembic migrations)
# Local PostgreSQL (default):
DATABASE_URL=postgresql://postgres:change-me-db-password@localhost:5432/groupio
# Supabase: get from Dashboard → Project Settings → Database → Connection string
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Supabase (optional – only needed if using hosted Supabase)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-supabase-publishable-key
SUPABASE_DB_PASSWORD=your-supabase-db-password
```

**Target pattern — replace the commented pooler line and add the `statement_cache_size` note:**
```bash
# Database (for Alembic migrations)
# Local PostgreSQL (default):
DATABASE_URL=postgresql://postgres:change-me-db-password@localhost:5432/groupio
# Supabase Transaction Pooler (recommended for production — Supavisor, port 6543):
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
# Note: transaction mode requires statement_cache_size=0 in asyncpg pool (already set in src/databases/postgres.py)

# Supabase (optional – only needed if using hosted Supabase)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-supabase-publishable-key
SUPABASE_DB_PASSWORD=your-supabase-db-password
```

**Existing WhatsApp block pattern** (lines 106–109):
```bash
# WhatsApp Business API
WHATSAPP_API_TOKEN=your-whatsapp-api-token
WHATSAPP_PHONE_ID=your-whatsapp-phone-id
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret
```

**Target pattern — expand inline comments:**
```bash
# WhatsApp Business API — obtain from Meta Business Manager after account verification
# Phone ID: numeric ID from WhatsApp Manager → Phone Numbers (not the E.164 phone number)
# API Token: Bearer token from Meta App → WhatsApp → Configuration
WHATSAPP_API_TOKEN=your-whatsapp-api-token
WHATSAPP_PHONE_ID=your-whatsapp-phone-id
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret
```

**Existing Stripe block pattern** (lines 144–149):
```bash
# Stripe credentials (required when PAYMENT_PROVIDER=stripe)
# Obtain from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
# Webhook signing secret — from Stripe Dashboard → Webhooks → Signing secret
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
```

**Target pattern — add live-key placeholders as comments after existing test-key lines:**
```bash
# Stripe credentials (required when PAYMENT_PROVIDER=stripe)
# Obtain from: https://dashboard.stripe.com/apikeys
# Test mode (local/CI — never use in production):
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
# Webhook signing secret — from Stripe Dashboard → Webhooks → Signing secret
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
# Contractor membership price (live mode — obtain after Stripe live mode KYC):
# STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID=price_live_...
# Live-mode key names (replace sk_test_ / pk_test_ above with these after KYC):
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_PUBLISHABLE_KEY=pk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_live_...
```

---

### `docker/staging-minimal.env` (config, docker env)

**Analog:** Self — `DATABASE_URL` line 24.

**Existing pattern** (line 24):
```bash
DATABASE_URL=postgresql://postgres:local-dev-postgres-not-for-production@postgres:5432/groupio
```

**No change needed for the staging-minimal.env `DATABASE_URL`.** This file uses the local Docker PostgreSQL container (hostname `postgres`, port 5432), not Supabase. The port 6543 change applies only when `DATABASE_URL` points at Supabase's Supavisor pooler. The planner should add a comment clarifying this.

**Add a comment above line 24:**
```bash
# Local Docker Postgres — uses direct port 5432. Supabase Supavisor uses port 6543 (see .env.example).
DATABASE_URL=postgresql://postgres:local-dev-postgres-not-for-production@postgres:5432/groupio
```

---

### `docs/runbooks/phase1-external-deps.md` (documentation, ops runbook)

**Analog:** `docs/ASYNC_EVENTS_RUNBOOK.md` (role-match) and `docs/RUNBOOK.md` (role-match).

**Structure pattern from `docs/ASYNC_EVENTS_RUNBOOK.md`** (lines 1–15):
- H1 title with domain context sentence
- `## Feature flags` → adapt to `## Submission Status` table with ticket IDs
- Checklist-style tables with clear state columns

**Structure pattern from `docs/RUNBOOK.md`** (lines 1–55):
- H2 section per concern
- Markdown tables for service/status
- Code blocks for commands

**Target structure for `docs/runbooks/phase1-external-deps.md`:**
```markdown
# Phase 1: External Dependencies Runbook

## Submission Tracker

| Item | Submitted | Ref / Ticket ID | Status | Follow-up Due |
|------|-----------|-----------------|--------|---------------|
| Meta Business Verification | — | — | Pending | — |
| WhatsApp template: groupio_offer_expiry (he) | — | — | Pending | — |
| ...5 templates x 2 languages... | | | | |
| Supabase Pro upgrade | — | — | Pending | — |
| Domain groupio.co.il registration | — | — | Pending | — |
| Stripe KYC initiation | — | — | Blocked (entity path TBD) | — |

## Success Criteria

| Req | Criteria | Verification |
|-----|----------|--------------|
| OPS-01 | All 5 templates visible in Meta Business Manager | Manual: business.facebook.com |
| INFRA-01 | Supabase billing shows Pro plan | Manual: app.supabase.com → Settings → Billing |
| INFRA-01 | FastAPI connects via port 6543 without error | `pytest tests/unit/ -x` |
| Domain | groupio.co.il resolves with valid SSL | `curl -I https://groupio.co.il` returns 200 |
| Stripe | Live-mode KYC initiated | Stripe Dashboard → Activations |

## Escalation Contacts

- Meta Business Support: business.facebook.com/help
- Stripe Support: support.stripe.com
- ISOC-IL registrar: per chosen registrar's support portal
- Supabase Support: supabase.com/support
```

**File location:** `docs/runbooks/phase1-external-deps.md` — note: the `docs/runbooks/` subdirectory does not yet exist; planner must create it.

---

## Shared Patterns

### Env Var Documentation Convention
**Source:** `.env.example` (throughout)
**Apply to:** All `.env.example` additions in this phase

The project's convention is:
1. Group vars under a `# SectionName` comment header
2. Inline comment above each var explains where to obtain it
3. Sensitive keys use `your-...-here` placeholder format, never real values
4. Commented-out alternatives (e.g., different DB URL variants) use `# KEY=...` prefix

```bash
# Section heading (describes service or subsystem)
# Obtain from: [URL or instruction]
# Optional note about when this var is used
VAR_NAME=placeholder-value-here
```

### WhatsApp API URL Construction Convention
**Source:** `src/services/whatsapp_bot.py` line 78, `src/api/routes/webhooks.py` line 279
**Apply to:** Both `whatsapp_bot.py` and `webhooks.py` version string updates

Both files build the Graph API URL as an f-string using `settings.WHATSAPP_PHONE_ID`. They must use the same version string. After this phase the canonical pattern is:
```python
f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
```

### Ops Runbook Structure Convention
**Source:** `docs/ASYNC_EVENTS_RUNBOOK.md`, `docs/RUNBOOK.md`
**Apply to:** `docs/runbooks/phase1-external-deps.md`

All runbooks in this project follow: H1 title, H2 section per concern, markdown tables for status/config, code blocks for commands. No narrative prose paragraphs without an associated action or table.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/runbooks/phase1-external-deps.md` | documentation | n/a | No ops submission-tracking runbook exists. Closest analogs (`ASYNC_EVENTS_RUNBOOK.md`, `RUNBOOK.md`) cover operational procedures, not external vendor submission tracking. Use the shared patterns above. |

---

## Metadata

**Analog search scope:** `src/databases/`, `src/services/`, `src/api/routes/`, `docs/`, `.env.example`, `docker/staging-minimal.env`
**Files scanned:** 8 (postgres.py, whatsapp_bot.py, webhooks.py, .env.example, staging-minimal.env, RUNBOOK.md, ASYNC_EVENTS_RUNBOOK.md, OPERATIONS.md)
**Pattern extraction date:** 2026-05-06
