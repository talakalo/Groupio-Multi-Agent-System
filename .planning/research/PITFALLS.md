# Groupio Launch Pitfalls

> Research-grade risk register for Groupio's city MVP launch.  
> Each pitfall includes: warning signs, prevention strategy, and the phase that must address it.  
> Derived from analysis of the actual codebase (FastAPI + Next.js 15 + Stripe + LangGraph + asyncpg/Supabase RLS).

---

## 1. Payment & Escrow Pitfalls

### 1.1 Stripe Webhook Idempotency Table Bypassed by Service-Role Connections

**What happens:** The `stripe_webhook_events` dedup table (migration 031) is only consulted via `db.try_claim_stripe_webhook_event()`. If the backend ever processes a webhook on a second replica before the first replica commits the claim row -- or if the claim INSERT fails silently -- the same `payment_intent.succeeded` event is processed twice. The result is two `payments` rows with `status=succeeded` for the same Stripe PaymentIntent, and two `audit_logs` entries with `new_status=succeeded` -- but only one charge ever happened. Escrow balances double-count; contractor payout logic may also duplicate.

**Warning signs:** More `succeeded` payments than Stripe dashboard charges. Duplicate `audit_logs` rows with identical `transaction_id` and `new_status`. `stripe_webhook_duplicate_skipped` log line never fires even under Stripe's automatic 3-retry window.

**Prevention:**
- The claim INSERT must use `INSERT ... ON CONFLICT DO NOTHING RETURNING id` inside the same DB transaction that updates `payments` and `invoices`. Currently the INSERT is done separately before the update, leaving a gap.
- Add a `UNIQUE` constraint on `payments.transaction_id` (not just `stripe_webhook_events.id`) as a hard database-level idempotency fence.
- Log and alert on duplicate webhook attempts even when correctly blocked -- they indicate upstream retry loops.
- Test with Stripe CLI's `--repeat` flag: `stripe trigger payment_intent.succeeded --repeat 3`.

**Phase:** Pre-launch integration testing; must be resolved before accepting any live Stripe keys.

---

### 1.2 Escrow State Machine: Missing Guards on `collecting -> held` Transition

**What happens:** The escrow status flow (`collecting -> held -> released`) has no database-level guard that prevents releasing escrow while it is still in `collecting` state. The `determine_payment_type()` function decides escrow vs direct at payment-initiation time, but the subsequent status transitions are enforced only at the application layer. A race between two near-simultaneous admin "release" calls (or a timing bug in the scheduler) can move an escrow from `collecting` directly to `released` before all participants have paid.

**Specific edge case found in codebase:** `src/api/routes/payments.py` calculates `total_price = offer.get("base_price", 0) * participants` using a *snapshot* of participant count at initiation time. If a new participant joins after payment initiation but before escrow release check, the released amount under-counts expected funds.

**Warning signs:** Contractor receives payout before all residents have `succeeded` payments. `escrow_status=released` rows in DB where not all `offer_participants` have a linked `payment.status=succeeded`. Admin dashboard shows "funds released" before offer reaches `completed` state.

**Prevention:**
- Add a DB-level CHECK or a PL/pgSQL trigger: `RAISE EXCEPTION` if transitioning to `released` when `COUNT(payments WHERE offer_id=X AND status='succeeded') < offer.participant_count`.
- Implement optimistic locking on the escrow release: `UPDATE invoices SET escrow_status='held' WHERE id=? AND escrow_status='collecting'` -- reject if 0 rows updated.
- The release endpoint must re-verify offer status is `completed` AND all participant payments are `succeeded` inside a single serializable transaction.
- Never allow the AI payment agent to auto-refund when `escrow_status=held`; always require admin confirmation regardless of `PAYMENT_AGENT_MODE`.

**Phase:** Before accepting group payments with 3+ participants (i.e., before any real group buy closes).

---

### 1.3 Partial Refund Race Condition Across Multiple Participants

**What happens:** When a group offer is cancelled mid-escrow, each participant's `payment_split` must be refunded independently. If two participants request refunds simultaneously (or the scheduler triggers a bulk refund job), the Stripe refund API may be called twice for the same `payment_split.id`. The `PaymentAgent._handle_refund_auto()` method picks `the most recent succeeded payment` -- without locking that row -- meaning two concurrent refund requests for the same user can both select the same payment and both call `provider.refund(transaction_id)`, resulting in double-refund on the same Stripe charge.

**Warning signs:** Stripe refunds dashboard shows refund amounts exceeding original charge. `payments.status=refunded` rows that have two `audit_logs` entries with `action=payment_status_transition, new_status=refunded`.

**Prevention:**
- Before calling `provider.refund()`, execute `UPDATE payments SET status='refund_pending' WHERE id=? AND status='succeeded' RETURNING id`. If 0 rows updated, abort -- another process claimed it.
- Set `PAYMENT_AGENT_MODE=gated` at launch (already supported in codebase). Do not allow the AI payment agent to issue any live refunds autonomously until after 30 days of supervised operation.
- For group offer cancellations, implement a single serialized "bulk refund job" via the RabbitMQ outbox worker, not concurrent API calls.
- Add a `refund_idempotency_key` column to `payments` and pass it to `stripe.Refund.create_async(idempotency_key=...)`.

**Phase:** Before any offer reaches `cancelled` state with real payments.

---

### 1.4 Escrow Config Hot-Cache Staleness During Config Change

**What happens:** `_get_escrow_thresholds()` uses a 5-minute module-level in-process cache (`_ESCROW_THRESHOLDS_TTL = 300`). If an admin changes `escrow_min_participants` from 2 to 5 via the admin dashboard during a surge of group-join activity, new payments for the next 5 minutes will still route to `escrow` using the old threshold. On multi-replica deployments each replica has an independent cache -- one replica may use old config while another uses new config for payments on the same offer.

**Warning signs:** Some payments on the same offer show `payment_type=direct` while others show `payment_type=escrow`. Inconsistent contractor earnings dashboard.

**Prevention:**
- Emit a Redis pub/sub invalidation event when any escrow-related system_settings key is updated; each replica subscribes and flushes its local cache on receipt.
- Alternatively, use Redis as the single cache layer instead of in-process dicts -- all replicas share the same TTL.
- Log the escrow threshold values used at payment initiation time in `audit_logs.metadata` for post-hoc reconstruction.

**Phase:** Multi-replica deployment (likely at or just after MVP launch).

---

### 1.5 ILS Currency Agorot Conversion Rounding Errors

**What happens:** The codebase correctly converts ILS to agorot (`int(round(amount * 100))`) in both `StripePaymentProvider` and `BitPaymentProvider`. However, the VAT calculation in `src/api/routes/payments.py` computes `subtotal = round(total / 1.18, 2)` then `tax_amount = round(subtotal * 0.18, 2)`. For amounts that don't divide evenly, `subtotal + tax_amount != total` -- creating a 1-agorot rounding discrepancy that Israeli tax authority (Mas Hachnasah) invoices must reconcile. Israeli invoice law requires that the breakdown sums exactly.

**Warning signs:** Customer complaints that VAT receipt totals don't add up. Stripe charge amount differs by 1 agora from invoice total. Accountant flags mismatched VAT records.

**Prevention:**
- Compute `tax_amount = total - subtotal` (not `subtotal * 0.18`) to ensure `subtotal + tax_amount = total` exactly.
- Or: compute `subtotal = floor(total / 1.18 * 100) / 100`, then `tax_amount = total - subtotal`.
- Add a unit test asserting `subtotal + tax_amount == amount` for 50 sample price points.

**Phase:** Before issuing any official Israeli tax invoices (rakam/חשבונית מס).

---

### 1.6 `PAYMENT_PROVIDER=mock` Accidentally Used in Production

**What happens:** The codebase blocks `mock` in `production`/`staging` environments, but the environment detection relies on `settings.ENVIRONMENT`. If the production `.env` file sets `ENVIRONMENT=development` (copy-paste error) or if `PAYMENT_PROVIDER` is not set and defaults to `mock`, all payments silently succeed without any charge. No Stripe charge, no escrow, no real money -- but residents believe they have paid and contractors believe funds are held.

**Warning signs:** `MockPayment: charge created` in production logs. Stripe dashboard shows zero new PaymentIntents. Contractor payout requests for offers with zero Stripe funds.

**Prevention:**
- Add a startup health check that calls `stripe.Account.retrieve()` and logs a CRITICAL error if the response does not match the expected live/test mode for the current environment.
- Instrument an alert on `MockPayment: charge created` log pattern -- this should never appear in staging or production.
- The `PAYMENT_PROVIDER` env var should have no default; require explicit set or fail-fast at startup.

**Phase:** Infrastructure setup, before any first real user.

---

## 2. Security & RLS Pitfalls

### 2.1 FastAPI Backend Connects as PostgreSQL Superuser -- RLS Bypassed

**What happens:** Migration 037's comment explicitly states: "The FastAPI backend currently connects as the `postgres` superuser (which bypasses RLS via `owner_bypass_*`), so the gap is latent rather than active." This means all 37 migrations of carefully crafted RLS policies currently do nothing for any API request made through the FastAPI backend. A compromised FastAPI endpoint (e.g., SQL injection, SSRF to internal DB port, or a developer test endpoint left in production) returns all rows from all tenants.

The `groupio_app` role with tenant-scoped policies exists (migration 037) but the connection string still uses the superuser.

**Warning signs:** `SELECT current_user` returns `postgres` in API-originated queries. Any `SET ROLE groupio_app` missing from connection pool initialization. Developer makes a typo in a WHERE clause and sees another building's offers in their response.

**Prevention:**
- **Before launch:** Switch the asyncpg connection pool to connect as `groupio_app`, not `postgres`. Add `SET LOCAL app.current_user_id = '<uuid>'` at the start of each request in middleware (pattern already designed in migration 037).
- Keep a separate `postgres`-owned admin pool used only by admin endpoints that legitimately need cross-tenant access.
- Verify with an integration test: log in as resident A, call `GET /offers` -- assert resident B's building's offers are absent.
- Add the `pg_audit` extension and log any direct `postgres` role queries in production.

**Phase:** Security hardening, before any resident from Building B can see Building A's data.

---

### 2.2 RLS Policies Missing for `payment_splits`, `invitations`, `conversation_logs`

**What happens:** Migration 033 explicitly defers RLS policies for `payment_splits`, `invitations`, and `conversation_logs` with the comment: "join logic is more nuanced; backend service role bypasses RLS for primary API paths." This means any PostgREST-exposed endpoint (Supabase direct client access from the frontend) on these tables returns all rows to all authenticated users. A resident can query another resident's `payment_splits` directly via the Supabase JS client.

**Warning signs:** Frontend uses `supabase.from('payment_splits').select()` without `.eq('user_id', user.id)` filter. Supabase linter reports tables with no SELECT policy.

**Prevention:**
- Write and apply RLS policies for all three deferred tables before launch, even if they are simple `user_id = auth.uid()` policies.
- Run Supabase's RLS linter (`supabase db lint --level=warning`) in CI and treat any "policy missing" as a blocking failure.
- Disable direct PostgREST access to `payment_splits` entirely via `REVOKE SELECT ON payment_splits FROM authenticated` if the app only ever reads these server-side.

**Phase:** Pre-launch security audit.

---

### 2.3 Privilege Escalation via `buildings_manager` RLS Predicate

**What happens:** The `_admin_predicate()` in migration 033 grants admin-level SELECT access to `buildings_manager` role across all tenant data. A `buildings_manager` can currently read `escalations`, `contractor_reviews`, `invoices`, and `contractor_verification_metadata` for contractors across the entire platform -- not scoped to their managed building. This is a privilege escalation path: a malicious buildings_manager (or a compromised buildings_manager account) can enumerate contractor verification documents and invoice totals system-wide.

**Warning signs:** `buildings_manager` role is admin-created but there is no audit log for buildings_manager account creation. No rate limiting on buildings_manager API token usage.

**Prevention:**
- Scope buildings_manager RLS to `WHERE building_id = ANY(SELECT building_id FROM managed_buildings WHERE manager_user_id = auth.uid())` -- not a flat admin bypass.
- Add a `managed_buildings` join table if not present; do not rely on a flat role claim alone.
- Log all buildings_manager logins and cross-building data access attempts.

**Phase:** Before any buildings_manager account is created for a real building.

---

### 2.4 JWT Refresh Token Not Invalidated on Role Change

**What happens:** The Redis refresh token swap script correctly rotates tokens atomically. However, if an admin changes a user's role (e.g., from `resident` to `contractor`, or suspends an account), the existing JWT access token remains valid until its TTL expires. Depending on the access token TTL setting, a suspended contractor could continue to operate for up to the full token lifetime.

**Warning signs:** Suspended contractor still successfully calls `POST /offers` after suspension. Admin reports: "I blocked the user but they kept submitting offers."

**Prevention:**
- Maintain a Redis blocklist (`revoked_tokens:<jti>`) checked on every request for high-privilege or suspension actions.
- Alternatively, use short access token TTL (5–10 minutes maximum) and rely on the refresh cycle for role propagation.
- When admin suspends a user, immediately `DEL` all `conv:<user_id>`, `agent_state:*` and `refresh:<user_id>` Redis keys -- invalidating all active sessions.

**Phase:** Before admin moderation features go live.

---

### 2.5 WhatsApp Webhook Phone Number as User Identity Without Verification

**What happens:** The WhatsApp webhook handler (`src/api/routes/webhooks.py`) uses the phone number from the Meta payload as the user identifier: `building_id = await db.get_building_by_phone(message["phone"])`. If an attacker spoofs a WhatsApp message with a victim's phone number (via a compromised WhatsApp Business account or a Meta API misconfiguration), they gain access to the victim's building context, conversation history, and potentially trigger payment-related agent actions.

The `_verify_whatsapp_signature` correctly verifies HMAC-SHA256 against Meta's secret, but this only proves the message came from Meta -- not from the legitimate phone owner.

**Warning signs:** Phone numbers used to look up users without secondary verification. No rate limiting per phone number on the WhatsApp webhook endpoint. No alert when an unregistered phone number contacts the bot.

**Prevention:**
- The `ENFORCE_EMAIL_VERIFICATION` flag already provides a partial guard -- ensure it is `true` in production.
- Add a one-time PIN (OTP) sent to the phone number before the bot provides any account-level information. The `_send_whatsapp_reply` function is already available.
- Log and alert on any WhatsApp query that accesses payment or offer data from a phone number with no prior verified interaction.
- Implement per-phone rate limiting in Redis (max 10 messages per 10 minutes) separate from the IP rate limiter.

**Phase:** Before any resident interacts with the bot about their payment status.

---

### 2.6 Redis as Auth and Rate-Limit SPOF

**What happens:** The following critical auth operations depend entirely on Redis:
- Refresh token rotation (atomic Lua swap script)
- Login failure counting (`login_fail:<user_id>`)
- IP rate limiting (`auth_ip:<ip>`)
- Scheduler distributed locks (`scheduler:lock:<task>`)
- Agent state (`agent_state:<conversation_id>`)

If Redis becomes unavailable (OOM, network partition, restart), `check_rate_limit()` will throw an exception. Depending on error handling, this could either block all authenticated requests (fail-closed) or bypass all rate limits (fail-open). The `RedisClient.cache_get()` has a 3-retry tenacity policy -- but `check_rate_limit()` via `eval()` does not. Any unhandled `RedisError` in the auth middleware propagates as a 500, making the platform appear down even though PostgreSQL is healthy.

**Warning signs:** Redis restart causes login failure surge as all rate limit counters reset. `auth_ip:` keys disappear during Redis flush, enabling a brute-force window. Scheduler tasks run in parallel on restart because `scheduler:lock:*` keys evaporate.

**Prevention:**
- Wrap `check_rate_limit()` and `check_ip_rate_limit()` in a try/except that logs CRITICAL and **fails closed** (returns `False` / denies the request) rather than failing open.
- Add Redis Sentinel or Redis Cluster to eliminate the single-node SPOF. At minimum, use `maxmemory-policy=noeviction` -- never LRU-evict auth keys.
- Store refresh tokens in PostgreSQL with a Redis cache-aside pattern: Redis miss falls back to DB lookup. This ensures auth survives Redis outage.
- Set `REDIS_PASSWORD` and TLS in production -- the client already supports it.

**Phase:** Infrastructure design, before any live traffic.

---

## 3. UX & Localization Pitfalls

### 3.1 Stripe PaymentElement RTL Rendering Incomplete

**What happens:** `StripeCheckoutForm.tsx` sets `locale: "he"` on the Stripe Elements instance -- which localizes text strings. However, the Stripe PaymentElement iframe renders in its own shadow DOM and does not inherit the parent page's `dir="rtl"` attribute set on `<html>`. Credit card number fields, expiry, and CVC inputs will display as LTR even when the page is in RTL mode. Israeli users will see misaligned input fields: the cursor starts at the left, number groups appear in wrong order, and the overall form looks broken inside the RTL page.

**Warning signs:** QA in Hebrew locale shows left-aligned card inputs inside a right-aligned form. Error messages appear at the wrong end of the input. Card number "4111 1111 1111 1111" appears as "1111 1111 1111 1114" in visual layout.

**Prevention:**
- Pass `appearance.rules['.Input']['direction'] = 'ltr'` and `appearance.rules['.Label']['direction'] = 'rtl'` in the Elements `appearance` config -- Stripe Elements supports this.
- Add the Playwright test spec `apps/web/e2e/` with the Hebrew (`he`) project that navigates to `/checkout?offerId=test` and asserts that the card input placeholder is visible and aligned correctly.
- Visual regression test the checkout page in Hebrew locale specifically.

**Phase:** Frontend QA, before first demo to Israeli residents.

---

### 3.2 Number Formatting: ILS Currency Direction in RTL Context

**What happens:** The checkout page uses `Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" })` which renders amounts as `[U+200F RTL-MARK]₪1,234.56` with the shekel sign on the left (Hebrew convention places the currency symbol before the number). However, `<dd dir="ltr">` is used in `OrderSummary` to force LTR rendering of the formatted number. When the locale changes to `en`, `Intl.NumberFormat` switches to `ILS 1,234.56` format, which then renders LTR-within-RTL incorrectly -- the `dir="ltr"` wrapper is correct for Hebrew but wrong for English.

**Warning signs:** English locale users see `6 5 . 4 3 , 2 1 ₪` (reversed number) or currency symbol at wrong position.

**Prevention:**
- Use `dir="ltr"` only for numeric values, not for the surrounding element. Pass `currencyDisplay: "narrowSymbol"` so the symbol is always `₪` regardless of locale.
- Test the checkout order summary in both `he` and `en` locales in Playwright.
- Consider always formatting monetary values with explicit `dir="ltr"` span wrappers: `<span dir="ltr">₪1,234.56</span>`.

**Phase:** i18n QA, before English-language contractor portal launch.

---

### 3.3 Hebrew Error Messages Hardcoded, Missing from next-intl

**What happens:** Many error messages in the checkout page, webhook handler, and agent responses are hardcoded Hebrew strings in JSX and Python source files. For example: `"לא הצלחנו לזהות את הקבלן"` in `VettingAgent`, `"חשבונך טרם אומת"` in the WhatsApp webhook, and `"מזהה הצעה חסר"` in the checkout page. These bypass `next-intl` entirely, so:
1. The strings cannot be translated for the English locale.
2. They cannot be updated by non-developer content editors.
3. They will appear in Hebrew even when `locale=en` is active.

**Warning signs:** English locale users see Hebrew error messages. i18n key scan (`pnpm intl:extract`) reports many missing keys. Running the English Playwright project shows Hebrew text in error states.

**Prevention:**
- Run `grep -r "'" apps/web/app --include="*.tsx" | grep -v "useTranslations\|t(" | grep -v "//"` to find all hardcoded strings.
- Move all user-visible strings to `messages/he.json` and `messages/en.json`. Use `const t = useTranslations('checkout')` pattern already established in the codebase.
- For WhatsApp bot responses (server-side Python), maintain a `src/i18n/he.json` and `src/i18n/en.json` with Python string lookups.

**Phase:** i18n hardening sprint, before English-speaking contractors use the portal.

---

### 3.4 RTL Layout Regression in Payment Flow on Mobile Safari

**What happens:** The checkout page wraps content in `<div dir="rtl">`. On iOS Safari (the dominant mobile browser in Israel), `flex-row-reverse` combined with `dir="rtl"` creates double-reversal in some Tailwind flex containers. The breadcrumb `ArrowRight` icon with `rtl-flip` class may not render correctly if the global CSS for `rtl-flip` is not properly defined. The `<ShareButton>` component uses `navigator.share()` -- available on iOS Safari but with different behavior for Hebrew text in the share sheet.

**Warning signs:** On iPhone (Hebrew), the breadcrumb arrow points the wrong direction. The "שתפו עם השכנים" share sheet title appears as "!Groupio" in some iOS versions. Payment amount appears on the left side of the order summary on mobile.

**Prevention:**
- Run Playwright mobile tests using `{ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } }` (iPhone 14 dimensions) with `he` locale.
- Define `rtl-flip` in `globals.css` as `[dir="rtl"] .rtl-flip { transform: scaleX(-1); }` -- verify this is present and tested.
- Test the WebShare API with Hebrew content on a real iOS device before launch.

**Phase:** Mobile QA sprint.

---

## 4. AI Agent Production Failure Modes

### 4.1 LLM Cache Serving Stale Contractor Vetting Decisions

**What happens:** `LLMResponseCache` in `src/agents/base.py` caches LLM responses keyed by model + system prompt + messages with a 30-minute TTL. The vetting agent calls `_call_llm_structured()` to analyze contractor documents. If a contractor uploads corrected documents after a first failed vetting, the cache key for "analyze contractor X's documents" may return the previous rejection analysis for up to 30 minutes. The contractor gets rejected based on stale document analysis despite uploading valid documents.

**Warning signs:** Contractor uploads new insurance certificate. Admin sees the vetting report still references the old document. Trust score does not update. `LLM cache hit` log appears in the same window as a new document upload.

**Prevention:**
- The vetting agent's `_analyze_documents()` call must include a document hash or `updated_at` timestamp in the message content -- this busts the cache naturally.
- Add an explicit cache invalidation in the document upload endpoint: `await redis.cache_delete(f"llm_cache:{contractor_vetting_key}")`.
- Consider disabling the LLM cache entirely for the `vetting` agent (set `rag_enabled=False` and `temperature=0.2` already does this for determinism, but cache must also be bypassed).
- Log cache hits for vetting decisions as WARN-level since they are rarely appropriate.

**Phase:** Before the vetting agent processes any live contractor.

---

### 4.2 Circuit Breaker State is In-Process, Shared Across All Agents

**What happens:** `_llm_circuit_breaker` is a module-level singleton in `src/agents/base.py`. All 11 agents share the same circuit breaker. If the `pricing` agent triggers 5 consecutive LLM failures (for example, a malformed pricing prompt causing Claude to return invalid JSON), the circuit breaker opens and **all** agents become unable to make LLM calls -- including the `support` agent that needs to respond to distressed residents and the `payment` agent handling refund queries. The platform appears unresponsive to all WhatsApp interactions.

**Warning signs:** `LLM circuit breaker is open` log from multiple agents simultaneously. Resident support queries go unanswered. Circuit breaker `failure_threshold=5` hits quickly during a temporary Claude API rate-limit window.

**Prevention:**
- Create a per-agent circuit breaker: `self._circuit_breaker = CircuitBreaker(...)` in `BaseAgent.__init__()` rather than a global singleton.
- Implement a fallback response for each agent type: the support agent should respond with a canned "We're experiencing delays, a human will follow up" message when the circuit is open.
- Add a `recovery_timeout` of 120s for production (current 60s may cause premature half-open attempts during sustained Claude API degradation).
- Instrument `circuit_breaker_state_changed` metrics to Prometheus/Datadog.

**Phase:** Before any sustained production traffic.

---

### 4.3 Payment Agent Auto-Refund Triggered by WhatsApp Message Ambiguity

**What happens:** `PaymentAgent._detect_sub_intent()` classifies any message containing `"ביטול"` (cancellation) as `refund_request`, which in `auto` mode immediately calls `provider.refund()` on the most recent succeeded payment. A resident asking "מה הסטטוס של הביטול שביקשתי?" (asking for cancellation status) or "ניתן לבטל חשבון?" (cancel account) will inadvertently trigger a live Stripe refund before any human reviews the request.

The keyword-based intent detection has no context window -- it does not consider prior messages in the conversation.

**Warning signs:** Refunds appearing on Stripe without matching admin approval. Residents report surprise refunds. `PaymentAgent: auto-refund` log entries at unexpected times.

**Prevention:**
- **Force `PAYMENT_AGENT_MODE=gated` for the first 60 days of production.** This is the single most important mitigation.
- Improve intent detection to require co-occurrence of refund keywords AND payment-specific context keywords (offer ID, payment amount, explicit "החזר כסף" phrasing).
- Add a WhatsApp confirmation step: the bot replies "האם אתה בטוח שאתה רוצה החזר כסף? ענה 'כן' לאישור" and only proceeds after explicit confirmation.
- Never auto-refund escrow payments -- always require admin approval regardless of agent mode.

**Phase:** Immediately; resolve before the WhatsApp bot handles any live users.

---

### 4.4 Agent State Overflow: Unbounded `actions_taken` in Long Conversations

**What happens:** The `AgentState` dictionary accumulates all `actions_taken` across the entire conversation lifetime. In the WhatsApp webhook flow, each message appends to `actions_taken`. For a resident who interacts with the bot 50+ times (asking about different offers, payment status, contractors), `actions_taken` grows without bound. This state is serialized to Redis via `save_agent_state()` and passed to every LLM call as part of the context. Very long states will:
1. Exceed Claude's context window, causing API errors.
2. Increase LLM latency and cost significantly.
3. Cause Redis `SET` failures if the value exceeds `maxmemory`.

**Warning signs:** LLM API errors mentioning token limit exceeded. Slow WhatsApp response times correlated with conversation length. Redis `OOM command not allowed` errors for heavy users.

**Prevention:**
- Truncate `actions_taken` to the last N entries (10–20) before passing to LLM. The conversation window for Redis is already limited to 10 messages -- apply the same limit to `actions_taken`.
- Never serialize the full `actions_taken` list to Redis; only store the last action and a summarized context.
- Add a guard in `_build_system_prompt()` to limit `conversation_history` to the last 5 turns.

**Phase:** Before any user can have more than 20 interactions.

---

### 4.5 Vetting Agent Trusts LLM for Document Validation Without Cryptographic Verification

**What happens:** `VettingAgent._analyze_documents()` sends document text extracted from PDFs to Claude and asks it to determine if the license is valid and insurance is current. The LLM analysis is purely semantic -- it cannot verify:
- Whether the contractor license number actually exists in the Israeli Contractor Registry (Misrad HaBinui).
- Whether the insurance policy is currently active (requires API call to the insurance company).
- Whether the document was digitally forged (e.g., a real license PDF with the expiry date changed in a PDF editor).

A contractor can submit a screenshot of a real license belonging to a different contractor, and the LLM will likely mark `license_valid: True` since the document looks legitimate.

**Warning signs:** Multiple contractors with the same license number. License numbers that don't follow the Israeli format (7-digit license number). Insurance expiry dates that are always in the future by exactly 1 year.

**Prevention:**
- Integrate the Israeli Contractor Registry API (if available) for license number validation. At minimum, validate the license number format with a regex (`^\d{7}$` for Israeli contractor licenses).
- The `check_license_api` tool is listed in `VettingAgent.tools` -- ensure it makes a real external API call, not just an LLM tool-use simulation.
- Cross-reference contractor name + license number: if another contractor is already registered with the same license, flag as suspicious.
- Require contractors to submit documents through a verified upload flow (not self-reported text), and scan for PDF metadata anomalies.

**Phase:** Contractor onboarding, before any contractor is auto-approved.

---

### 4.6 Matching Agent Recommending Contractors Across Buildings (Data Isolation Failure)

**What happens:** The `matching` agent uses Qdrant vector similarity search across the `contractors` namespace without building-level filtering. A contractor's vector embeddings include metadata from completed jobs in specific buildings. When the matching agent retrieves `top_k=10` similar contractors for a query, it may return contractors that have explicit "do not work with" flags set by a specific building's manager -- and the matching agent has no way to know about building-specific blacklists unless they are part of the retrieval filter.

**Warning signs:** Matching agent recommends a contractor that a buildings_manager explicitly excluded for their building. Contractor who was rejected by Building A is recommended to Building B using Building A's positive review data.

**Prevention:**
- Always pass `building_id` as a Qdrant filter when retrieving contractor matches: `filters={"must_not": [{"key": "excluded_buildings", "match": {"value": building_id}}]}`.
- Store building-specific contractor exclusions in Qdrant metadata, not just in PostgreSQL.
- Add a post-retrieval filter in the matching agent that checks PostgreSQL for building-level contractor exclusions before presenting results.

**Phase:** Before the matching agent operates in any live building.

---

## 5. Operational Pitfalls

### 5.1 RabbitMQ Outbox Worker Failure Silently Drops CRM and Notification Events

**What happens:** The outbox pattern (`src/workers/worker_payments.py`, `src/messaging/outbox_helpers.py`) enqueues events to RabbitMQ for CRM sync, notifications, and payment status updates. The `try_enqueue_crm()` function wraps the enqueue in a try/except with `logger.exception("CRM outbox enqueue failed ... (non-fatal)")`. If RabbitMQ is unavailable at launch (common in early deployments where the queue service starts after the API), all payment confirmation events, contractor notification events, and CRM sync events are silently dropped with no retry.

**Warning signs:** Payments succeed (Stripe charges confirmed) but residents don't receive confirmation emails. Contractor CRM (HubSpot/Salesforce) shows no new leads from launch day. `outbox_events` table shows rows that never transition out of `pending` state.

**Prevention:**
- The `outbox_events` table (migration present) is the correct pattern -- but only if the outbox worker reliably polls and retries. Verify the worker has a dead-letter queue (DLQ) in RabbitMQ for events that fail after N attempts.
- Add a monitoring alert: if any `outbox_events` row remains in `status='pending'` for more than 15 minutes, page on-call.
- Implement a compensating health-check endpoint that scans `outbox_events` for stale pending events and re-enqueues them.
- At launch, disable non-critical outbox events (CRM sync) and keep only payment confirmation and notification events active -- reducing the blast radius if RabbitMQ has issues.

**Phase:** Infrastructure setup and load testing.

---

### 5.2 Alembic Migration Applied to Wrong Database Environment

**What happens:** The Alembic connection string is read from `DATABASE_URL` environment variable. During rushed launch preparation, developers often run `alembic upgrade head` from a terminal that has production `DATABASE_URL` set (from a previous deployment session), applying development migrations to the production database. Migration 033 drops and recreates RLS policies -- running it against production while live traffic is happening will cause brief moments where RLS policies are absent (between DROP and CREATE).

**Warning signs:** RLS policies disappear in Supabase dashboard mid-traffic. Alembic `alembic_version` table in production shows development revision IDs. Error emails from automated Supabase linter.

**Prevention:**
- Require `ALEMBIC_ENV=production` explicit environment variable before any `alembic upgrade` command in production scripts. The migration script should validate this.
- Run migrations only via CI/CD pipeline (GitHub Actions) with environment-specific secrets -- never from developer laptops.
- Use Alembic's `--sql` flag to generate SQL first for review before applying to production.
- Schedule migrations during low-traffic windows (Israeli time: 2–4am Sunday night).

**Phase:** DevOps process, before launch.

---

### 5.3 Neo4j Graph Store Single Node -- Contractor Reputation SPOF

**What happens:** Contractor trust scores, reputation data, and relationship graphs (used by the vetting and matching agents) are stored in Neo4j. The `get_graph_store()` client connects to a single Neo4j instance. If Neo4j becomes unavailable:
- `VettingAgent._analyze_reputation()` falls back gracefully (try/except returns `{}`)
- `VettingAgent._get_performance_history()` falls back to `{"total_projects": 0, "completion_rate": 0}`

A contractor who previously had a trust score of 90 (auto-approve) will now get a trust score of approximately 40–50 (all history-based signals return 0), and will be routed to `manual_review` -- creating a surge of manual review queue items whenever Neo4j has any downtime.

**Warning signs:** Neo4j downtime correlates with surge of `vetting_decision: manual_review` in agent audit log. All contractors suddenly require manual review during maintenance windows.

**Prevention:**
- Cache the last-known trust score in PostgreSQL `contractors.trust_score` column. On Neo4j unavailability, use the cached score rather than recalculating from zero.
- Add a Neo4j health check to the `/health` endpoint.
- For city MVP, consider running contractor reputation from PostgreSQL alone and introducing Neo4j only after graph-specific queries (shortest path, influence networks) are actually needed.

**Phase:** Infrastructure resilience planning.

---

### 5.4 Offer Expiry Race with In-Flight Payments

**What happens:** The scheduler runs `expire_stale_offers` periodically. If an offer transitions to `expired` at the same time a resident is mid-checkout (between `POST /payments/initiate` and the Stripe webhook delivery), the payment succeeds on Stripe but the offer is now expired. The webhook handler (`stripe_webhook`) finds the `payment` row, updates it to `succeeded`, but the offer is no longer `active` -- so the participant is charged but may not be listed as an active participant. The escrow state machine has no compensation path for this case.

**Warning signs:** Stripe charges that correspond to offers in `expired` state. Residents charged for expired offers. `offer_participants` rows with `payment_status=succeeded` but `offer.status=expired`.

**Prevention:**
- At payment initiation, lock the offer row with `SELECT ... FOR UPDATE` and verify `status IN ('active', 'pending')`. Reject with HTTP 409 if not.
- In the webhook handler, check offer status after updating payment status. If offer is expired, automatically initiate a refund and create an `escalation` for admin review.
- Add a 5-minute grace window: the scheduler marks offers `expiry_pending` first, then transitions to `expired` only after the grace window -- giving in-flight payments time to complete.

**Phase:** Before any offer reaches its deadline with live participants.

---

## 6. Israeli Market-Specific Pitfalls

### 6.1 Israeli Consumer Fraud: "Va'ad Bayit" Impersonation

**What happens:** In Israeli apartment buildings, the `va'ad bayit` (building committee) holds significant social authority. Fraudsters can register as a `buildings_manager` for a building they don't manage by:
1. Finding the building address on public property registries (Tabu).
2. Registering with a plausible name and a Google Voice / disposable phone number.
3. Using their `buildings_manager` access to invite residents, view their data, and direct them to fraudulent contractor offers.

The current system requires admin creation of `buildings_manager` accounts but does not verify that the registrant actually represents the va'ad bayit for that building.

**Warning signs:** Multiple `buildings_manager` accounts for the same building. Buildings_manager account with no prior resident invitations suddenly invites all residents. Buildings_manager changes the building's associated contractor to an unverified one.

**Prevention:**
- Require physical address verification for `buildings_manager` creation: send a verification code by physical mail to the building's registered address (teudat zehut of the applicant cross-referenced against building ownership records in Tabu).
- Limit each building to one active `buildings_manager` and require admin approval to change.
- Add an anomaly detection rule: new `buildings_manager` who invites more than 10 residents within 24 hours triggers a review.
- Consider a tiered trust model: new `buildings_manager` accounts have reduced privileges for the first 30 days.

**Phase:** Identity verification sprint, before any buildings_manager onboarding.

---

### 6.2 Israeli ID Number (Teudat Zehut) Validation Not Implemented

**What happens:** Israeli residents and contractors are expected to provide their Teudat Zehut (9-digit national ID) for financial transactions and contractor verification. The codebase does not include any Teudat Zehut format validation or checksum verification. The vetting agent collects documents but the license number format validation (`^\d{7}$` regex) is not in the codebase. Fraudsters can submit synthetic ID numbers that pass naive format checks but are mathematically invalid.

The Israeli Teudat Zehut uses a Luhn-like check digit algorithm that validates the 9-digit number.

**Warning signs:** Contractor registration with ID numbers that fail the Israeli checksum. Multiple accounts with similar ID number patterns (sequential increments indicating fabricated IDs). No validation error for obviously wrong IDs like "000000000" or "123456789".

**Prevention:**
- Implement the Israeli ID checksum algorithm (alternating digit weights of 1 and 2, sum modulo 10 = 0) as a Pydantic validator on contractor registration.
- Integrate with a third-party Israeli ID verification service (e.g., `Binat` or `B4U Technologies`) for KYC before any contractor can publish an offer.
- Cross-check contractor business registration number (`עוסק מורשה` / `חברה בע"מ`) against the Israeli Companies Registrar (Registrar of Companies API).

**Phase:** Contractor onboarding, before any contractor is approved.

---

### 6.3 Israeli Consumer Protection Law: 14-Day Cancellation Right (Chok Hamakher Mehuga)

**What happens:** Israeli consumer protection law (Chok Hamikra Mehuga, amendment 2010) grants consumers a 14-day cancellation right for digital services purchased remotely. For group purchases, this creates a critical ambiguity: if one of 10 participants cancels within 14 days, does the entire offer's pricing tier change? Does the platform owe the other 9 participants a refund of the tier difference? The current escrow implementation has no mechanism for cascading tier recalculation after a cancellation.

Additionally, digital service receipts in Israel must include the supplier's VAT registration number (`עוסק מורשה` number) and business address -- requirements that may not be implemented in the current invoice generation flow.

**Warning signs:** Residents requesting cancellations within 14 days of joining. Group size drops below a tier threshold but pricing is not recalculated. Invoices missing mandatory Israeli tax fields.

**Prevention:**
- Implement a `cancellation_window_ends_at` field on `offer_participants`, set to `joined_at + 14 days`.
- Define the business rule explicitly: cancellation within 14 days triggers re-evaluation of the pricing tier for all remaining participants. If the tier changes, issue partial refunds or credit notes to all participants.
- Have Israeli legal counsel review the invoice template for compliance with Chok HaLivaknit (Tax Invoice Law): must include `עוסק מורשה` number, business address, and consecutive invoice numbering.
- Add the platform operator's `עוסק מורשה` number to all invoice templates before issuing any official tax invoices.

**Phase:** Legal review sprint, before launch.

---

### 6.4 WhatsApp-Centric Onboarding Excludes Non-WhatsApp Users

**What happens:** The platform's primary resident engagement channel is WhatsApp Business API. In Israel, WhatsApp penetration is approximately 85–90% among smartphone users, but the remaining 10–15% (including elderly residents who are often key apartment building decision-makers) do not use WhatsApp. Additionally, WhatsApp Business API has a 24-hour message window: after 24 hours without a user message, the platform can only send pre-approved template messages. If a resident signs up and doesn't interact within 24 hours, follow-up messages about payment deadlines or offer expiry cannot be sent freely.

**Warning signs:** Elderly residents in the building committee cannot interact with the bot. Residents report not receiving payment reminders. WhatsApp template message approval takes 1–7 business days via Meta -- offers may expire before templates are approved.

**Prevention:**
- Maintain SMS fallback for critical transactional messages (payment confirmations, offer expiry warnings). Israel has high SMS delivery rates.
- Pre-approve WhatsApp message templates for: offer_expiry, payment_reminder, payment_confirmation, offer_joined, contractor_matched. Submit these before launch -- approval takes days.
- The email service (`src/services/email.py`) should be the primary fallback for all transactional notifications, not the secondary channel.

**Phase:** Notification infrastructure, before any group offer deadline approaches.

---

### 6.5 Contractor VAT Registration Status Changes Mid-Offer

**What happens:** Israeli contractors can be `עוסק מורשה` (VAT-registered) or `עוסק פטור` (VAT-exempt, for annual revenue under ₪120,000). If a contractor's VAT status changes mid-offer (crosses the exemption threshold), the VAT treatment of the invoice changes. The current system applies a fixed 18% VAT rate to all transactions. If a contractor is `עוסק פטור`, the invoice must not include VAT, and charging residents VAT they cannot claim back is a consumer protection violation.

**Warning signs:** Contractor business registration showing `עוסק פטור` status. Invoice template showing 18% VAT for all contractors. No VAT status field in `contractor_verification_metadata`.

**Prevention:**
- Add `vat_status: Literal["registered", "exempt"]` to the contractor model and verification flow.
- Apply VAT conditionally: if contractor is `עוסק פטור`, set `tax_rate=0.0` on invoices for that contractor's offers.
- Validate contractor VAT status periodically (monthly check) via the Israeli Tax Authority API.

**Phase:** Contractor verification and invoicing sprint.

---

### 6.6 Shabbat and Jewish Holiday Traffic Patterns

**What happens:** Israeli user traffic follows Jewish calendar patterns significantly: near-zero activity from Friday sunset to Saturday night (Shabbat), spikes before holidays (Pesach, Rosh Hashana) as residents try to complete home renovations before the holiday, and near-zero activity on Yom Kippur. Scheduled tasks (offer expiry, escrow release, payout processing) that run on a fixed UTC schedule may fire at unexpected Hebrew calendar times:
- An offer that expires "on Friday" may expire during Shabbat (when no one can respond).
- Escrow release triggers during Sukkot may reach contractors during holiday closures.
- The scheduler uses UTC -- there is no Israeli timezone awareness in scheduled task logic.

**Warning signs:** Offers expiring on Friday evening with no resident response (they cannot respond during Shabbat). Contractor payout notifications sent on Yom Kippur. Customer support escalations clustered on Saturday nights (post-Shabbat inbox clearing).

**Prevention:**
- Implement an Israeli business calendar check before sending any user-facing notification or triggering offer expiry. The `pyluach` Python library supports Hebrew calendar calculations.
- Add a setting: `SKIP_SCHEDULER_DURING_SHABBAT=true` that suppresses non-critical scheduled tasks between Friday 16:00 and Saturday 21:00 Israel Standard Time.
- Set offer deadlines to Israeli business hours (Sunday–Thursday, 9am–6pm) by default in the offer creation flow.
- Contractor payout processing should default to Sunday morning (first Israeli business day).

**Phase:** Localization sprint, before the first offer deadline in the system.

---

*Document generated: 2026-05-06. Review against codebase state before each major release.*
