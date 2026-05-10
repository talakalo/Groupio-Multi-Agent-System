# Roadmap — Groupio City MVP Launch Readiness

## Overview
10 phases | 27 requirements | Goal: The first real transaction — a resident pays for a contractor service through escrow, the work gets done, the contractor gets paid — across 10 active Israeli apartment buildings.

---

## Phases

### Phase 1: External Dependencies Unblocked
**Goal:** Kick off every external process that has a multi-week approval or procurement lead time so nothing blocks launch at the finish line.
**Requirements:** OPS-01, INFRA-01
**Plans:** 5 plans
- [ ] 01-01-PLAN.md — Code changes: asyncpg statement_cache_size=0 for Supavisor, WhatsApp Graph API to v21.0 (3 sites), .env.example updates (Supavisor URL, Stripe live keys, payout delay), staging-minimal.env clarification.
- [ ] 01-02-PLAN.md — Draft and write all 10 WhatsApp template reference files (5 templates × Hebrew + English) plus submission README under docs/whatsapp-templates/.
- [ ] 01-03-PLAN.md — Create docs/runbooks/phase1-ops.md scaffold with Submission Tracker and full Supabase Pro upgrade section (placeholders for Stripe and Domain).
- [ ] 01-04-PLAN.md — Append Stripe Israel KYC section to phase1-ops.md (entity-path blocker, document checklists, env-var rotation, D-12 deferral to Phase 5).
- [ ] 01-05-PLAN.md — Append Domain & DNS section to phase1-ops.md (ISOC-IL registration, exact DNS records 76.76.21.21 + cname.vercel-dns.com, D-02 routing clarification, admin rewrite, SSL verification).

**Success criteria:**
1. Meta template submission confirmation email received with ticket IDs for all 5 templates.
2. groupio.co.il resolves and returns a valid SSL certificate (verifiable via `curl -I https://groupio.co.il`).
3. Supabase project dashboard shows "Pro" plan with PgBouncer enabled; DB does not pause after 7 days.
4. Stripe Dashboard shows a verified Israeli payout account capable of ILS payouts.

---

### Phase 2: Security Foundations
**Goal:** Harden the two most critical security vulnerabilities — RLS superuser bypass and webhook idempotency — before any real user data enters the system.
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04
**Plans:**
1. Create `groupio_app` restricted PostgreSQL role; update asyncpg pool to connect as that role; add `SET LOCAL app.current_user_id` per-request middleware so all 37 RLS policies are enforced.
2. Add RLS policies to `payment_splits`, `invitations`, and `conversation_logs` (deferred in migration 033); generate and apply Alembic migration.
3. Scope `buildings_manager` RLS to managed buildings only: audit all policies where buildings_manager is granted flat access and replace with building-scoped filters; regression test as buildings_manager role.
4. Add `UNIQUE` constraint on `payments.transaction_id`; make Stripe webhook idempotency key INSERT and payment status UPDATE atomic inside a single DB transaction (`INSERT … ON CONFLICT DO NOTHING`).
5. Implement server-side JWT invalidation on role change and account suspension: store a `jti` blocklist in Redis with TTL matching token expiry; check blocklist in auth middleware.

**Success criteria:**
1. Integration test connecting as `groupio_app` role and querying another building's offers returns 0 rows (RLS enforced, not superuser).
2. `payment_splits` queried as a resident returns only that resident's own rows — verifiable in psql session with `SET app.current_user_id`.
3. Replaying the same `payment_intent.succeeded` webhook twice results in exactly one `succeeded` payment record and one escrow debit — no duplicate.
4. Suspending a user and reusing their JWT within the same token TTL window returns `401 Unauthorized`.
5. buildings_manager API calls return only residents and offers from their assigned building, not system-wide data.

---

### Phase 3: Infrastructure & Secrets
**Goal:** Wire production infrastructure — secrets management, multi-worker WebSocket broadcasting, and CDN — so the platform can run reliably at scale.
**Requirements:** INFRA-02, INFRA-03, INFRA-04
**Plans:**
1. Set up Doppler project with all 170+ environment variables; replace any `.env` files in production containers with `doppler run --` injection; update CI/CD to pull from Doppler at deploy time.
2. Refactor `WebSocketConnectionManager` to use Redis Pub/Sub fan-out: on broadcast, publish to a Redis channel; each Uvicorn worker subscribes and forwards to its local connections.
3. Configure Cloudflare CDN for `groupio.co.il` and `api.groupio.co.il`: set caching rules for static assets, enable proxying for WebSocket upgrade, activate WAF for `/api/webhooks/*`.
4. Automate daily Qdrant volume snapshots to object storage (Cloudflare R2 or Hetzner Object Storage); add snapshot staleness alert to Alertmanager.
5. Activate `redis_exporter`, `node_exporter`, and `postgres_exporter` in Docker Compose; wire all three to Prometheus scrape config; confirm dashboards render in Grafana.

**Success criteria:**
1. No `.env` file exists inside any running production container — confirmed via `docker exec <container> env | grep SECRET` showing values from Doppler.
2. WebSocket broadcast sent from one Uvicorn worker reaches a client connected to a different worker — verifiable by connecting two browser tabs to different worker instances and broadcasting from one.
3. Grafana dashboards show live `redis_`, `node_`, and `pg_` metrics with no "No data" panels.
4. Qdrant snapshot job runs on schedule and a completed snapshot timestamp appears in object storage within 24 hours of setup.

---

### Phase 4: Auth & Identity
**Goal:** Implement phone OTP as the primary authentication method and Israeli ID validation so residents and contractors can be onboarded with identity trust native to Israel.
**Requirements:** AUTH-01, AUTH-02, AUTH-03
**Plans:**
1. Integrate Supabase Phone Auth (or Twilio/Inforu SMS) for phone OTP flow; update registration and login pages in `apps/web` to show phone-first UI with email as fallback; add `next-intl` Hebrew strings for all OTP screens.
2. Implement Teudat Zehut checksum validation (Luhn-variant algorithm) in the contractor registration Pydantic model; block account creation on invalid checksum; surface Hebrew error message.
3. Implement buildings_manager registration admin-approval workflow: BM submits application with building address proof; admin sees approval queue in `apps/admin`; approved BM gets account with scoped building assignment.
4. Add anti-impersonation check for Va'ad Bayit: require admin to verify building address against submitted document before approving BM; log approval action to `audit_logs`.
5. Update Playwright E2E specs to cover phone OTP login for resident and contractor roles, and BM admin-approval flow.

**Success criteria:**
1. A resident can complete registration using only a phone number + OTP code — no email required.
2. Submitting an invalid Teudat Zehut number during contractor registration returns a Hebrew field-level error and blocks form submission.
3. A buildings_manager account can only be created after an admin approves the application in the admin dashboard — self-registration is rejected.
4. Playwright `auth.spec.ts` passes for phone OTP login and BM approval flows in both Hebrew and English locales.

---

### Phase 5: Payment Hardening
**Goal:** Fix all known payment integrity bugs and complete the end-to-end escrow flow so money moves safely from resident to contractor.
**Requirements:** PAY-01, PAY-02, PAY-03, PAY-04, SEC-03 (already addressed in Phase 2; PAY flows depend on it)
**Plans:**
1. Fix the escrow release guard: add a DB-level check that all `offer_participants` have `payment_status = paid` before transitioning escrow from `collecting` to `held`; use `SELECT FOR UPDATE` on the offer row during payment initiation to prevent expiry-race double-charge.
2. Gate the payment agent: set `PAYMENT_AGENT_MODE=gated` in production/staging config; require explicit user confirmation step before issuing any Stripe refund; add keyword-context check so Hebrew "ביטול" in unrelated context does not trigger refund.
3. Fix VAT rounding: change `tax_amount` calculation to `total - subtotal` (not `subtotal * 0.18`) to ensure `subtotal + tax_amount == total` for all ILS amounts; add unit tests covering edge amounts (e.g., 99 NIS, 333 NIS).
4. Add `vat_status` field (`osek_patur` / `osek_morsche`) to contractor model and Pydantic schema; invoice generation checks VAT status and omits VAT line for `osek_patur` contractors; generate VAT-compliant Hebrew PDF invoice.
5. Implement installment payments (תשלומים): for offers above ₪1,000, allow resident to split into 2–12 installments via Stripe PaymentIntent with `payment_method_options.card.installments`; surface installment selector in checkout UI.
6. Run full Stripe test-mode E2E: resident pays → escrow hold → offer completes → contractor payout; verify `audit_logs` has an entry for each state transition.

**Success criteria:**
1. Stripe test-mode run of the full escrow lifecycle completes without errors and all 5 audit log entries (authorized, captured, collected, held, released) are present in DB.
2. Replaying the same webhook twice produces no duplicate payment record (regression of SEC-03 fix).
3. `subtotal + tax_amount = total` passes for 100 randomized ILS amounts in the VAT unit test suite.
4. Payment agent ignores "ביטול" appearing in a non-payment chat message — no refund triggered.
5. An `osek_patur` contractor's invoice PDF has no VAT line; an `osek_morsche` invoice has the correct 18% VAT breakdown.
6. Installment selector appears in checkout for an offer priced at ₪1,500 and Stripe logs a PaymentIntent with `installments` enabled.

---

### Phase 6: AI Agent Hardening
**Goal:** Isolate agent failures from each other and fix caching bugs so the LangGraph agent system is safe to run in production with live users.
**Requirements:** AGENT-01, AGENT-02, AGENT-03, AGENT-04
**Plans:**
1. Replace the global circuit breaker singleton with per-agent circuit breaker instances: each of the 11 agents gets its own `CircuitBreaker` object in `src/agents/`; one agent's 5 consecutive LLM failures open only that agent's circuit.
2. Fix vetting agent cache invalidation: add `document_hash` (or `updated_at`) to the cache key for contractor vetting decisions; invalidate (or bypass) cache on document upload event so fresh vetting runs.
3. Bound `actions_taken` in `AgentState`: implement a sliding window capping the list at 50 entries, or replace with a summarization step when length exceeds threshold; add unit test verifying the list never exceeds cap in a long conversation.
4. Add building-level contractor exclusion filter to matching agent's Qdrant query: pass `building_id` as a filter so contractors already matched to that building are excluded from new recommendations.
5. Add per-agent circuit breaker status to Prometheus metrics endpoint; add Grafana alert rule for any agent circuit open for >5 minutes.

**Success criteria:**
1. Simulating 5 consecutive LLM timeouts for the pricing agent opens only the pricing circuit — the payment agent and support agent remain `CLOSED` and functional.
2. Uploading a new contractor document and immediately triggering vetting returns a fresh decision, not a cached one — verifiable via `vetting_cache_miss` counter in logs.
3. A 200-turn simulated conversation's `AgentState.actions_taken` list has ≤50 entries — confirmed in unit test output.
4. Matching agent Qdrant query logs show `building_id` filter applied for every matching request.
5. Grafana shows per-agent circuit breaker status panel with all 11 agents visible and individually statused.

---

### Phase 7: Resident & Contractor UX
**Goal:** Complete the resident onboarding journey, contractor self-signup, and fix all UI completeness gaps so both primary user types can transact without friction.
**Requirements:** UX-01, UX-02, UX-03, UX-04, OPS-02
**Plans:**
1. Replace all 34 raw `fetch()` calls in `apps/web` with `@groupio/api-client` calls; audit with `grep -r "fetch(" apps/web/app` and track replacements to zero.
2. Fix Stripe PaymentElement RTL: set `appearance.rules` and `locale: 'he'` in the Elements `<Elements>` provider; verify card input fields align correctly in Hebrew locale.
3. Add Shabbat/holiday-aware scheduling: integrate `pyluach` (Python) + Hebcal API; wrap offer expiry scheduler and notification dispatcher to skip sends during Shabbat (Friday sunset–Saturday night) and major Jewish holidays.
4. Implement the 14-day consumer cancellation right (Chok Hamakher Mehuga): resident can cancel within 14 days of joining; on cancellation, recalculate tier and issue refund if tier drops; surface cancellation UI with Hebrew legal notice.
5. Complete the resident onboarding flow: invite code → account creation (phone OTP) → building join → offer browse; ensure all screens pass RTL layout check in Playwright Hebrew project.
6. Complete contractor self-signup + membership checkout: Stripe subscription flow for contractor membership; show membership status badge in contractor dashboard.

**Success criteria:**
1. `grep -r "fetch(" apps/web/app` returns 0 results (all replaced with api-client).
2. Stripe PaymentElement in Hebrew locale displays with RTL card field alignment — verifiable via Playwright screenshot in Hebrew project.
3. An offer expiring at Friday 18:00 local time is automatically deferred to Saturday night — confirmed in scheduler unit test with mocked Shabbat times.
4. A resident cancelling within 14 days receives a refund and the tier counter decrements — verifiable in Stripe test dashboard and offer participant count.
5. A new contractor can complete self-signup, submit documents, and activate a Stripe membership subscription without admin intervention for the checkout step itself.

---

### Phase 8: Building Manager & Admin Ops
**Goal:** Ensure building managers can onboard buildings and residents, and admins have the operational tools needed to handle escalations, payouts, and user management at launch.
**Requirements:** OPS-04, AUTH-03 (admin approval workflow — built in Phase 4; admin side verified here)
**Plans:**
1. Building manager onboarding flow: BM creates building profile (address, unit count, city), generates invite codes per building, views resident roster and acceptance rates in `apps/admin`.
2. Admin escalation queue: surface open escalations from `escalations` table in admin dashboard with status filters (open, in_review, resolved); allow admin to hold escrow, issue partial release, or escalate to super_admin.
3. Admin payout approval workflow: list pending contractor payouts; admin reviews invoice and trust score; one-click approve triggers payout processing pipeline; log approval to `audit_logs`.
4. User suspension flow: admin can suspend/unseat any user or contractor; suspended users get `401` on next request (relies on Phase 2 JWT blocklist); contractor suspension hides active offers.
5. Validate Alembic migration safety: add pre-run script that reads `ENVIRONMENT` env var and aborts if `target = production` and `--dry-run` flag not passed; prevents accidental dev migrations on prod.

**Success criteria:**
1. A buildings_manager can create a building, generate invite codes, and view a roster of joined residents — all within `apps/admin` UI.
2. An admin can approve a contractor payout from the admin dashboard; the payout transitions to `processing` and an `audit_logs` entry is written.
3. Running `alembic upgrade head` without `--allow-prod` flag on a container with `ENVIRONMENT=production` aborts with a clear error message.
4. A suspended contractor's active offers become invisible to residents within one request cycle after suspension.

---

### Phase 9: Legal, Compliance & Monitoring
**Goal:** Satisfy Israeli legal requirements, complete production monitoring, and ensure the platform is observable and auditable before going live.
**Requirements:** INFRA-04 (monitoring completion), OPS-01 (WhatsApp template status check)
**Plans:**
1. Hebrew Terms of Service and Privacy Policy: draft with Israeli counsel review; include Chok Hamakher Mehuga 14-day cancellation right, Chok Haganat HaPrivacy 2023 compliance, invoice requirements (osek morsche number); surface as modal on first login.
2. Wire Sentry DSN for both `apps/web` and `apps/admin` (frontend) and FastAPI (backend); confirm error events appear in Sentry dashboard from a triggered test exception.
3. Configure Alertmanager PagerDuty/Slack routes for the 9 existing alert rules (PaymentWebhookFailed, HighErrorRate, LLMLatencyHigh, DatabasePoolExhausted, etc.); add alert for outbox events stale >15 minutes.
4. Write operational runbooks in `docs/runbooks/`: escalation handling, refund processing, contractor dispute, Stripe webhook failure recovery, DB failover; store in repo.
5. Verify WhatsApp template approval status; confirm all 5 templates are approved and send a test message via WhatsApp Business API to a real phone number.

**Success criteria:**
1. ToS and Privacy Policy pages are live on groupio.co.il and linked from the registration flow; Hebrew text is correctly RTL-rendered.
2. A deliberately triggered 500 error in FastAPI appears in Sentry within 60 seconds with full stack trace and user context.
3. Alertmanager fires a test alert that reaches the configured Slack channel — end-to-end alert pipeline validated.
4. All 5 WhatsApp message templates show "Approved" status in Meta Business Manager; a test `payment_confirmation` template message is received on a test phone.
5. Runbooks directory exists in repo with at least 4 runbook files; each has an "Escalation" and "Recovery" section.

---

### Phase 10: Staging Smoke Tests & Launch Gate
**Goal:** Validate the entire system end-to-end on a staging environment identical to production, confirm all 27 requirements are met, and clear the launch gate.
**Requirements:** OPS-03, PAY-01 (final E2E re-validation), SEC-01 through SEC-04 (regression), INFRA-01 through INFRA-04 (smoke), AUTH-01 through AUTH-03 (smoke), UX-01 through UX-04 (smoke), AGENT-01 through AGENT-04 (smoke), OPS-02 through OPS-04
**Plans:**
1. Provision staging environment: deploy Docker Compose stack to Hetzner VPS staging slot with Doppler staging secrets; run `alembic upgrade head` with prod-guard script; seed test buildings and users.
2. Playwright E2E smoke suite — resident role: phone OTP login, join building via invite code, browse offers, add to offer, complete Stripe test-mode payment, receive WhatsApp confirmation.
3. Playwright E2E smoke suite — contractor role: self-signup, document upload, offer creation with tier pricing, view participants, trigger offer completion, receive payout.
4. Playwright E2E smoke suite — buildings_manager, admin, super_admin roles: BM invites resident, admin approves payout, super_admin changes system config; all role-guarded routes reject wrong roles.
5. Load test with k6 or Locust: simulate 50 concurrent residents joining 3 buildings simultaneously; verify DB pool stays under 25 connections, P95 response time <500ms, no WebSocket broadcast drops.
6. Final requirements audit: step through all 27 REQ-IDs against staging observations; mark each as verified; gate launch on 100% green.

**Success criteria:**
1. Playwright smoke suite passes for all 5 roles in both English and Hebrew locales on staging — 0 failures in CI.
2. Full escrow lifecycle (resident pay → escrow hold → offer complete → contractor payout) completes on staging in Stripe test mode with all audit log entries present.
3. Load test report shows P95 response time <500ms and zero 5xx errors under 50-concurrent-user load.
4. All 27 v1 requirements show "verified" status in the final requirements audit checklist.
5. No critical or high Sentry errors appear during the 1-hour smoke-test window on staging.
