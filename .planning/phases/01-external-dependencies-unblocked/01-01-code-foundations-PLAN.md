---
plan: "01-01-code-foundations"
wave: 1
depends_on: []
files_modified:
  - src/databases/postgres.py
  - src/services/whatsapp_bot.py
  - src/api/routes/webhooks.py
  - .env.example
  - docker/staging-minimal.env
  - docs/runbooks/phase1-external-deps.md
autonomous: true
requirements:
  - OPS-01
  - INFRA-01
---

# Plan 01-01: Code Foundations for External Services

## Objective

Apply all code changes required to make the codebase ready for the external services activated in this phase: Supavisor transaction pooler (Supabase Pro), WhatsApp API version alignment, .env.example documentation, and create the ops tracking runbook. All changes are backward-compatible and safe to merge before the external services are live.

---

## Tasks

<task id="T1" name="Add statement_cache_size=0 to asyncpg pool kwargs">
  <read_first>
    - src/databases/postgres.py (lines 100–115: read _POOL_KWARGS dict before editing; lines 170–180: see how kwargs are consumed by _asyncpg_pool_connect_kwargs)
  </read_first>
  <action>
    In src/databases/postgres.py, add "statement_cache_size": 0 as the fifth key to the _POOL_KWARGS dict (after "command_timeout": 60). The exact target state of the dict is:
    {
        "min_size": 5,
        "max_size": 25,
        "max_inactive_connection_lifetime": 300,
        "command_timeout": 60,
        "statement_cache_size": 0,
    }
    Add an inline comment: # Required for Supavisor transaction mode (port 6543)
    Do not change any other line in this file.
  </action>
  <acceptance_criteria>
    - src/databases/postgres.py contains the string "statement_cache_size": 0
    - `python -m ruff check src/databases/postgres.py` exits 0
    - `python -m mypy src/databases/postgres.py` exits 0 (or shows only pre-existing errors unrelated to this change)
  </acceptance_criteria>
</task>

<task id="T2" name="Update WhatsApp Graph API version in whatsapp_bot.py from v18.0 to v21.0">
  <read_first>
    - src/services/whatsapp_bot.py (line 78: self.api_url assignment; line 309: status_url assignment — both must be updated)
  </read_first>
  <action>
    In src/services/whatsapp_bot.py, replace both occurrences of "v18.0" in Graph API URL f-strings with "v21.0".
    Line 78 target: self.api_url = f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
    Line 309 target: status_url = f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
    Do not modify any other code in this file (send_notification method, retry logic, or error handling are unchanged).
  </action>
  <acceptance_criteria>
    - src/services/whatsapp_bot.py contains no occurrences of "v17.0" or "v18.0"
    - src/services/whatsapp_bot.py contains exactly 2 occurrences of "v21.0" (at the api_url and status_url assignments)
    - `python -m ruff check src/services/whatsapp_bot.py` exits 0
  </acceptance_criteria>
</task>

<task id="T3" name="Update WhatsApp Graph API version in webhooks.py from v17.0 to v21.0">
  <read_first>
    - src/api/routes/webhooks.py (lines 263–279: read _send_whatsapp_reply function; line 279: the url f-string to update; read the @retry decorator and httpx error handling nearby to confirm they are NOT touched)
  </read_first>
  <action>
    In src/api/routes/webhooks.py, replace "v17.0" in the url f-string inside _send_whatsapp_reply (line 279) with "v21.0".
    Target line: url = f"https://graph.facebook.com/v21.0/{settings.WHATSAPP_PHONE_ID}/messages"
    Do not modify the @retry decorator, _whatsapp_transient function, httpx.HTTPStatusError handler, or httpx.RequestError handler.
  </action>
  <acceptance_criteria>
    - src/api/routes/webhooks.py contains no occurrence of "v17.0"
    - src/api/routes/webhooks.py contains "v21.0" in the _send_whatsapp_reply url f-string
    - `python -m ruff check src/api/routes/webhooks.py` exits 0
  </acceptance_criteria>
</task>

<task id="T4" name="Update .env.example with Supavisor, WhatsApp, and Stripe live-key documentation">
  <read_first>
    - .env.example (lines 26–35: existing Supabase block; lines 106–109: existing WhatsApp block; lines 144–149: existing Stripe block — read these sections before editing to match surrounding style)
  </read_first>
  <action>
    Make three targeted edits to .env.example:

    1. In the Supabase block (around lines 26–35), replace the commented pooler line:
       FROM: # DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
       TO:
       # Supabase Transaction Pooler (recommended for production — Supavisor, port 6543):
       # DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
       # Note: transaction mode requires statement_cache_size=0 in asyncpg pool (already set in src/databases/postgres.py)

    2. In the WhatsApp block (around lines 106–109), expand the comment header:
       FROM: # WhatsApp Business API
       TO:
       # WhatsApp Business API — obtain from Meta Business Manager after account verification
       # Phone ID: numeric ID from WhatsApp Manager → Phone Numbers (not the E.164 phone number)
       # API Token: Bearer token from Meta App → WhatsApp → Configuration

    3. In the Stripe block (around lines 144–149), add live-key placeholder comments after the existing webhook secret line:
       After: STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
       ADD:
       # Contractor membership price (live mode — obtain after Stripe live mode KYC):
       # STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID=price_live_...
       # Live-mode keys (replace sk_test_ / pk_test_ above with these after KYC):
       # STRIPE_SECRET_KEY=sk_live_...
       # STRIPE_PUBLISHABLE_KEY=pk_live_...
       # STRIPE_WEBHOOK_SECRET=whsec_live_...
  </action>
  <acceptance_criteria>
    - .env.example contains the string "6543/postgres" in the Supabase section
    - .env.example contains "statement_cache_size=0" as a reference note in the Supabase section
    - .env.example contains "Meta Business Manager" in the WhatsApp section comment
    - .env.example contains "price_live_..." as a comment in the Stripe section
    - .env.example contains "sk_live_..." as a comment in the Stripe section
  </acceptance_criteria>
</task>

<task id="T5" name="Add clarifying comment to docker/staging-minimal.env DATABASE_URL line">
  <read_first>
    - docker/staging-minimal.env (line 24: DATABASE_URL for local Docker Postgres)
  </read_first>
  <action>
    In docker/staging-minimal.env, add a comment on the line immediately above the DATABASE_URL line (line 24):
    # Local Docker Postgres — direct port 5432. Supabase Supavisor uses port 6543 (see .env.example).
    The DATABASE_URL value itself is unchanged: postgresql://postgres:local-dev-postgres-not-for-production@postgres:5432/groupio
  </action>
  <acceptance_criteria>
    - docker/staging-minimal.env contains the comment "Local Docker Postgres — direct port 5432"
    - The DATABASE_URL value in docker/staging-minimal.env still ends with "@postgres:5432/groupio"
  </acceptance_criteria>
</task>

<task id="T6" name="Create docs/runbooks/phase1-external-deps.md ops tracking runbook">
  <read_first>
    - docs/RUNBOOK.md (lines 1–55: read for H1/H2/table structure pattern)
    - docs/ASYNC_EVENTS_RUNBOOK.md (lines 1–15: read for submission-tracker table style)
  </read_first>
  <action>
    Create docs/runbooks/ directory if it does not exist, then create docs/runbooks/phase1-external-deps.md with the following structure:

    # Phase 1: External Dependencies Runbook

    Track submission dates, ticket IDs, and follow-up actions for all Phase 1 external processes.

    ## Submission Tracker

    | Item | Submitted | Ref / Ticket ID | Status | Follow-up Due |
    |------|-----------|-----------------|--------|---------------|
    | Meta Business Verification | — | — | Pending | — |
    | WhatsApp template: groupio_offer_expiry (he) | — | — | Pending | — |
    | WhatsApp template: groupio_offer_expiry (en) | — | — | Pending | — |
    | WhatsApp template: groupio_payment_reminder (he) | — | — | Pending | — |
    | WhatsApp template: groupio_payment_reminder (en) | — | — | Pending | — |
    | WhatsApp template: groupio_payment_confirmation (he) | — | — | Pending | — |
    | WhatsApp template: groupio_payment_confirmation (en) | — | — | Pending | — |
    | WhatsApp template: groupio_offer_joined (he) | — | — | Pending | — |
    | WhatsApp template: groupio_offer_joined (en) | — | — | Pending | — |
    | WhatsApp template: groupio_contractor_matched (he) | — | — | Pending | — |
    | WhatsApp template: groupio_contractor_matched (en) | — | — | Pending | — |
    | Supabase Pro upgrade | — | — | Pending | — |
    | Domain groupio.co.il registration | — | — | Pending | — |
    | Vercel domain configuration | — | — | Pending | — |
    | Stripe entity path decision | — | — | Blocked (TBD) | — |
    | Stripe KYC initiation | — | — | Blocked (entity TBD) | — |

    ## Success Criteria

    | Req | Criteria | Verification Command |
    |-----|----------|---------------------|
    | OPS-01 | All 5 templates visible in Meta Business Manager (he + en) | Manual: business.facebook.com → WhatsApp Manager → Message Templates |
    | OPS-01 | Submission confirmation emails received for all 10 template variants | Check email for Meta ticket IDs |
    | INFRA-01 | Supabase billing shows Pro plan; no inactivity pause setting | Manual: app.supabase.com → Settings → Billing |
    | INFRA-01 | FastAPI connects to Supabase via port 6543 without prepared-statement errors | `pytest tests/unit/ -x` |
    | Domain | groupio.co.il resolves with valid SSL | `curl -I https://groupio.co.il` → expect HTTP 200 and valid cert |
    | Domain | SSL certificate valid and not expired | `openssl s_client -connect groupio.co.il:443 -servername groupio.co.il < /dev/null 2>&1 \| grep "Verify return code: 0"` |
    | Stripe | Live-mode KYC initiated | Stripe Dashboard → Activations shows KYC in progress or completed |

    ## Escalation Contacts

    | Service | Support URL |
    |---------|-------------|
    | Meta Business | business.facebook.com/help |
    | Stripe | support.stripe.com |
    | ISOC-IL registrar | Per chosen registrar's support portal |
    | Supabase | supabase.com/support |

    ## Open Questions

    - [ ] Stripe entity path: Does the company have a US LLC, EU entity, or other Stripe-eligible entity? (blocks KYC)
    - [ ] Admin app routing under D-02 (path-based, no subdomains): where does apps/admin live on groupio.co.il?
    - [ ] deploy.yml line 163 checks `https://api.groupio.co.il/api/v1/health/live` — confirm whether api.groupio.co.il subdomain is still needed for the backend VPS despite D-02.
  </action>
  <acceptance_criteria>
    - docs/runbooks/phase1-external-deps.md exists
    - File contains "## Submission Tracker" header
    - File contains all 10 WhatsApp template rows (5 templates × he + en)
    - File contains "## Success Criteria" header with OPS-01 and INFRA-01 rows
    - File contains `curl -I https://groupio.co.il` as a verification command
  </acceptance_criteria>
</task>

---

## must_haves

- `statement_cache_size`: 0 is present in `_POOL_KWARGS` in src/databases/postgres.py
- Both `whatsapp_bot.py` and `webhooks.py` use Graph API v21.0 (no v17.0 or v18.0 remaining)
- `.env.example` documents Supavisor port 6543, WhatsApp API Token source, and Stripe live-key placeholders
- `docs/runbooks/phase1-external-deps.md` exists and contains all 10 template submission rows
- `python -m ruff check src/` exits 0 after all changes

---

<threat_model>
## Threat Model (ASVS L1)

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Committing real API credentials to .env.example | HIGH | .env.example uses placeholder strings only (sk_test_your_..., your-whatsapp-api-token). Real values must never be committed. |
| WhatsApp API version downgrade | LOW | v21.0 is the target; ruff/mypy catch syntax errors but not version regressions. Review the diff before merging. |
| Breaking asyncpg pool with statement_cache_size=0 | MEDIUM | Backward compatible — this key is ignored by direct Postgres connections and required for Supavisor. Run pytest tests/unit/ -x after change to confirm pool initializes. |
| Ops runbook exposing PII | LOW | Runbook rows contain only ticket IDs and dates (no personal data). Template message bodies are drafted without real user data. |
</threat_model>
