# Groupio City MVP — Research Synthesis

**Synthesized:** 2026-05-06  
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md  
**Goal:** 10 active buildings, city MVP launch, 1–3 month timeline

---

## 1. Recommended Stack

Top 5 concrete decisions, in priority order:

- **Backend: Single Hetzner VPS (Frankfurt) + Docker Compose** — zero migration from current SSH-deploy workflow; CX31 ~€15/month handles 10-building MVP comfortably. Evaluate Fly.io migration only if VPS becomes CPU-bound post-launch.
- **Frontend: Keep Vercel (web + admin)** — already wired, zero-downtime atomic deploys, handles Israeli latency via CDN edge; no change needed.
- **PostgreSQL: Supabase Pro ($25/month)** — already integrated with asyncpg + RLS; upgrade from free tier immediately (free tier pauses after 1 week inactivity, which would be catastrophic in production). Enable PgBouncer transaction pooler.
- **DNS/CDN: Cloudflare (Tel Aviv PoP)** — serves static assets from within Israel, provides free TLS, DDoS protection; WAF ($20/month Pro) recommended for payment flows. Point groupio.co.il and api.groupio.co.il through Cloudflare. WebSockets work on all Cloudflare plans.
- **Secrets: GitHub Actions Environments now + Doppler in Phase 2** — CI secrets already partially wired; add Doppler for runtime injection to eliminate any .env file in production containers.

**Supporting services:** Qdrant Cloud free tier (EU-West), Neo4j AuraDB Free (Frankfurt), Redis self-hosted in Docker Compose (AOF persistence). RabbitMQ keep self-hosted but feature-flagged OFF at launch (ENABLE_RABBITMQ=false).

**Total estimated cost at MVP launch: ~$100–150/month.**

---

## 2. Table Stakes Features

Non-negotiable for launch. Users will not trust or use the platform without these.

- **WhatsApp-first communication** — outbound template messages (offer updates, payment receipts, 24h countdowns) pre-approved by Meta; inbound bot handles Hebrew queries; failure here is platform failure for Israeli users (~97% penetration).
- **Hebrew RTL UI — complete, not partial** — all resident and contractor flows, all form validation errors, all WhatsApp bot responses in Hebrew; shekel currency with Israeli number formatting; DD/MM/YYYY dates; no hardcoded strings bypassing next-intl.
- **Phone OTP as primary identity** — Israeli users do not trust email-primary auth; requires Supabase Phone Auth or Twilio/Inforu integration; currently a gap (codebase is JWT/email only).
- **Contractor license verification badge** — "verified by Groupio team" badge with manual admin vetting workflow; automated data.gov.il cannot verify trade licenses so admin review is the real gate; must be live before any contractor publishes an offer.
- **Escrow payment with visible protection** — "kaspecha muggan" badge, Stripe-branded form, clear escrow status visible to resident; payment held until resident confirms completion; full refund path if minimum participants not reached.
- **Offer countdown + real-time participant counter** — WebSocket-driven; "X more neighbors get you 15% off" urgency mechanic; tier crossings trigger WhatsApp blast to all participants.
- **Building-scoped discovery via invite code** — residents see only their building's offers; admin/BM creates buildings; residents join via invite link only; invalid codes handled gracefully in Hebrew.
- **Transparent tier pricing UI** — tier table with "you are here" indicator; market rate comparison (savings in shekels); AI-generated pricing rationale already stored in DB, needs surfacing.
- **VAT-compliant Hebrew invoice PDF** — 18% VAT breakdown (subtotal + VAT + total must sum exactly per Israeli law); legally required for transactions over 100 NIS; RTL PDF output.
- **Post-work verified review system** — triggered on offer status transitioning to completed; only verified participants can review; rating shown on contractor profile and offer card.
- **Shabbat/holiday-aware scheduling** — do not send notifications or expire offers during Shabbat (Friday sunset–Saturday night) or major Jewish holidays; use pyluach + Hebcal API; low effort, high cultural signal.
- **Israeli consumer protection compliance** — Hebrew ToS with explicit 14-day cancellation right; dispute resolution path (resident reports → escrow held → admin mediates → partial release); all actions in audit_logs.

---

## 3. Critical Gaps

Confirmed missing or broken items that block launch:

- **RLS bypassed in production** — FastAPI connects as PostgreSQL superuser (postgres), rendering all 37 migrations of RLS policies completely ineffective. Must switch asyncpg pool to connect as groupio_app role with SET LOCAL app.current_user_id per-request before any resident data can be isolated cross-building. Highest severity finding across all research.
- **Phone OTP auth not built** — current auth is JWT/email only; phone OTP requires Supabase Phone Auth or Twilio; blocks Israeli-native identity trust and WhatsApp-linked accounts.
- **RLS missing for payment_splits, invitations, conversation_logs** — explicitly deferred in migration 033; residents can read other residents' payment splits via Supabase JS client.
- **WebSocket ConnectionManager is in-process** — with 4 Uvicorn workers, broadcasts from worker 0 do not reach connections on workers 1–3; must implement Redis Pub/Sub fan-out before multi-worker deployment.
- **Stripe webhook idempotency gap** — webhook claim INSERT and payment UPDATE are not in the same transaction; double-processing a payment_intent.succeeded event creates duplicate succeeded payments and double-counted escrow balances. Needs INSERT ... ON CONFLICT DO NOTHING inside the same transaction as the payment update, plus UNIQUE constraint on payments.transaction_id.
- **Payment agent in auto mode risks live refunds** — "bitul" keyword triggers immediate Stripe refund without context; must force PAYMENT_AGENT_MODE=gated before any live WhatsApp users interact with the bot.
- **LLM circuit breaker is a global singleton** — one agent triggering 5 consecutive failures opens the circuit for all 11 agents simultaneously including support and payment agents; needs per-agent circuit breaker instances.
- **VAT rounding bug** — subtotal + tax_amount != total for amounts that don't divide evenly at 18%; Israeli tax law requires exact arithmetic; fix: tax_amount = total - subtotal (not subtotal * 0.18).
- **Offer expiry race with in-flight payments** — scheduler can expire an offer while a resident is mid-checkout; resident gets charged for an expired offer with no compensation path; needs SELECT FOR UPDATE on offer at payment initiation and a 5-minute expiry_pending grace window.
- **Contractor VAT status not modeled** — all invoices apply 18% VAT unconditionally; osek patur contractors (revenue under 120K NIS/year) must not charge VAT; requires vat_status field on contractor model.
- **LLM cache stales contractor vetting** — vetting agent may return cached rejection for a contractor who uploaded corrected documents; cache key must include document hash/updated_at or cache must be bypassed entirely for vetting.
- **Stripe PaymentElement renders LTR inside RTL page** — card input fields misalign in Hebrew locale; fix via appearance.rules in Elements config; blocks first demo to Israeli residents.
- **Meta WhatsApp template approval not started** — outbound proactive messaging blocked until Meta approves templates; 1–2 week external dependency; must start today.

---

## 4. Top Risks

Ranked by severity (probability x impact):

1. **[CRITICAL] RLS superuser bypass** — Every API request bypasses all RLS policies. A single route handler bug exposes all tenants' data cross-building. Existential data-isolation failure; must be resolved before any real users are onboarded. (PITFALLS 2.1)

2. **[CRITICAL] Stripe payment double-processing** — Non-atomic webhook idempotency creates duplicate succeeded payments and double-counted escrow balances. Financial integrity failure requiring manual reconciliation; irreparable trust damage at launch. (PITFALLS 1.1)

3. **[HIGH] Payment agent auto-refund on WhatsApp ambiguity** — AI agent in auto mode issues live Stripe refunds based on keyword matching "bitul" without conversation context or confirmation step. A casual message triggers a real money refund with no in-app recovery path. (PITFALLS 4.3)

4. **[HIGH] Meta WhatsApp template approval blocks all proactive communication** — Platform depends on WhatsApp for offer reminders, payment confirmations, and countdown alerts. Without pre-approved templates the platform is mute to users after initial contact. Cannot be rushed; must start immediately. (FEATURES 5, PITFALLS 6.4)

5. **[HIGH] Escrow release without full payment verification** — No database-level guard prevents transitioning escrow from collecting to released before all participants have paid; race between concurrent admin release calls pays contractor before all funds collected. (PITFALLS 1.2)

**Additional notable risks:**
- buildings_manager privilege escalation: can read contractor verification data and invoices system-wide, not scoped to their building (PITFALLS 2.3)
- Partial refund race condition: concurrent refund requests for same payment_split can double-refund via Stripe (PITFALLS 1.3)
- Israeli ID (teudat zehut) not validated: contractors can submit mathematically invalid or fraudulent ID numbers (PITFALLS 6.2)
- Va'ad bayit impersonation: fraudsters can register as buildings_manager for buildings they do not control (PITFALLS 6.1)
- Escrow config cache staleness on multi-replica: each replica may use different escrow thresholds for payments on the same offer (PITFALLS 1.4)

---

## 5. External Dependencies

Time-sensitive items that must start immediately:

- **Meta WhatsApp Business template approval** — Submit templates for: offer_expiry, payment_reminder, payment_confirmation, offer_joined, contractor_matched. Approval takes 1–7 business days per template; proactive outreach is blocked until approved. Start today.
- **Facebook Business Account verification** — Required before WhatsApp Business API goes live; takes 2–4 weeks with document review. Start in parallel with template submission.
- **Israeli .co.il domain registration** — Register via Israeli registrar (Isoc.org.il or Name.co.il); delegate DNS to Cloudflare. Must be done before any production DNS configuration or SSL issuance.
- **Supabase Pro upgrade** — Free tier pauses after 1 week of inactivity; upgrade before any production traffic. Takes minutes but requires billing confirmation.
- **Israeli legal review** — ToS and Privacy Policy need Israeli counsel review for: Chok Hamakher Mehuga (14-day cancellation right), Chok Haganat HaPrivacy 2023 amendments, and invoice compliance (osek morsche number required on all tax invoices). Schedule now; lawyers take time.
- **Stripe Israel entity + ILS payout configuration** — Confirm contractor ILS payout account is configured; Stripe Payments Israel Ltd. is operational but business KYC can take days.

---

## 6. Quick Wins

Things already done well that can be leveraged directly without rework:

- **CI/CD pipeline is production-grade** — GitHub Actions runs ruff, mypy, alembic single-head check, 75% coverage gate, Vitest, Playwright E2E, Docker build, Trivy vulnerability scan, GitLeaks, Vercel deploy, SSH backend deploy, Alembic migrations, Slack notification. Extend, do not replace.
- **Docker Compose configuration is complete** — 7 services + 4 workers with health check dependencies, multi-stage Dockerfile with non-root user, 4 Uvicorn workers. Deploy workflow already works against DEPLOY_HOST secret. Ship it.
- **Monitoring stack is pre-wired** — Prometheus + Grafana + Alertmanager configured with 9 production-appropriate alert rules (PaymentWebhookFailed, HighErrorRate, LLMLatencyHigh, DatabasePoolExhausted, etc.). Wire Sentry DSNs and add 3 missing exporters (redis_exporter, node_exporter, postgres_exporter) to activate fully.
- **Feature flags are circuit breakers** — ENABLE_RABBITMQ, ENABLE_OUTBOX, ENABLE_CRM_SYNC, ENABLE_PREDICTIVE_MODELS flags allow degraded-mode operation without emergency deploys. Small-team superpower.
- **LLM fallback is implemented** — Claude claude-sonnet-4-6 primary with automatic OpenAI GPT-4o fallback on timeout; this resilience pattern is correct and operational.
- **Escrow architecture is structurally sound** — authorized to captured to released lifecycle, PaymentIntents, webhook signature verification, audit_logs on every transition, MockPayment blocked in production/staging. The design is right; gaps are specific bugs (idempotency, atomicity), not design flaws.
- **Hebrew support is deep** — next-intl throughout, hebrew_utils.py, Hebrew Playwright project, WhatsApp language detection, RTL via dir=rtl on html element. Framework is solid; gaps are completeness (hardcoded strings, Stripe PaymentElement, RTL PDF), not architecture.
- **AI agent system is operational** — 11 LangGraph specialist agents, RouterAgent orchestration, Redis session state, Qdrant semantic search, Neo4j graph queries, Anthropic primary + OpenAI fallback. Can go live after targeted fixes (per-agent circuit breaker, cache invalidation, payment mode gating).
- **Outbox pattern preserves messages** — outbox_events table survives RabbitMQ downtime; at-least-once delivery guaranteed as long as outbox dispatcher runs. Just needs a monitoring alert for stale pending events (>15 minutes).
- **RabbitMQ is safely off** — feature flag means zero RabbitMQ operational burden at launch; all critical paths work without it. Enable incrementally after stability is confirmed.
