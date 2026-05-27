---
plan: "01-02-supabase-pro-upgrade"
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements:
  - INFRA-01
---

# Plan 01-02: Supabase Pro Upgrade & Supavisor Switchover

## Objective

Upgrade the Supabase project from free tier to Pro ($25/month), eliminate the 7-day inactivity pause risk, enable PgBouncer/Supavisor transaction pooler, and update the production DATABASE_URL to port 6543. The code change (statement_cache_size=0) is handled in Plan 01-01 and must be deployed before switching DATABASE_URL in production.

**Autonomous: false** — requires access to app.supabase.com dashboard and production secrets management.

---

## Tasks

<task id="T1" name="Upgrade Supabase project to Pro tier">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 4.1: Upgrade steps and Pro tier features)
    - .env.example (Supabase block — read current DATABASE_URL comment format before updating)
  </read_first>
  <action>
    1. Log in to app.supabase.com → select the Groupio project.
    2. Navigate to Settings → Billing → Upgrade to Pro.
    3. Enter payment details and confirm upgrade.
    4. Verify the dashboard now shows "Pro" plan badge.
    5. Confirm "Pause settings" shows "Never" (no inactivity pause).
    6. Record upgrade date and plan confirmation in docs/runbooks/phase1-external-deps.md Submission Tracker row "Supabase Pro upgrade".
  </action>
  <acceptance_criteria>
    - app.supabase.com → Settings → Billing shows plan = "Pro"
    - "Pause settings" or equivalent shows "Never" / no auto-pause configured
    - Upgrade date recorded in docs/runbooks/phase1-external-deps.md
  </acceptance_criteria>
</task>

<task id="T2" name="Obtain Supavisor transaction pooler connection string">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 4.2: Transaction pooler URL format, port 6543)
  </read_first>
  <action>
    1. In app.supabase.com → Project → Settings → Database → Connection Info.
    2. Select the "Transaction" pooler mode tab (not "Session" or "Direct").
    3. Copy the full connection string — it will have format:
       postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
    4. Confirm port is 6543 (not 5432).
    5. Store this as the new production DATABASE_URL in production secrets (Doppler, or wherever current production secrets are managed).
    Note: Do NOT use the Session pooler (port 5432 on pooler host) — use Transaction mode (port 6543) for FastAPI/asyncpg compatibility.
  </action>
  <acceptance_criteria>
    - Production DATABASE_URL updated to use port 6543 and the pooler host (not db.[ref].supabase.co)
    - DATABASE_URL does not contain "db.[ref].supabase.co:5432" (old direct connection)
  </acceptance_criteria>
</task>

<task id="T3" name="Verify FastAPI connects to Supabase via Supavisor without errors">
  <read_first>
    - src/databases/postgres.py (confirm statement_cache_size=0 is present from Plan 01-01 before testing)
  </read_first>
  <action>
    1. Confirm Plan 01-01 (T1) is deployed — src/databases/postgres.py must have statement_cache_size=0.
    2. In the staging/dev environment with DATABASE_URL pointing at Supabase port 6543:
       Run: pytest tests/unit/ -x
    3. Monitor FastAPI startup logs for asyncpg pool initialization — should show "Created pool" with no prepared-statement errors.
    4. If "prepared statement ... already exists" error appears, the statement_cache_size=0 change is not deployed — do not proceed.
  </action>
  <acceptance_criteria>
    - `pytest tests/unit/ -x` exits 0 with DATABASE_URL pointing at Supabase port 6543
    - No "prepared statement" errors in asyncpg pool logs during test run
    - FastAPI process starts and /api/v1/health/live returns 200
  </acceptance_criteria>
</task>

---

## must_haves

- Supabase project is on Pro tier (no 7-day inactivity pause)
- PgBouncer/Supavisor transaction pooler is the active connection method (port 6543)
- Confirmed no asyncpg prepared-statement errors with new pooler URL

---

<threat_model>
## Threat Model (ASVS L1)

| Threat | Severity | Mitigation |
|--------|----------|------------|
| DATABASE_URL with live credentials committed to git | HIGH | Production DATABASE_URL is stored only in secrets manager (Doppler/env). Never commit the real pooler password to any file. |
| Supavisor breaks asyncpg prepared statements | MEDIUM | Mitigated by statement_cache_size=0 in postgres.py (Plan 01-01 T1). Always deploy code change before switching DATABASE_URL. |
| Downgrade data loss on free tier | LOW | Pro upgrade is immediate; no data loss expected. Ensure upgrade completes before any production traffic if possible. |
| Billing fraud on Supabase account | LOW | Use company payment method; enable 2FA on Supabase account before upgrade. |
</threat_model>
