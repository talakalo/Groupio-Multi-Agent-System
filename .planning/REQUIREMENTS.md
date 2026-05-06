# Requirements — Groupio City MVP Launch Readiness

## v1 Requirements

### Security

- [ ] **SEC-01**: FastAPI connects using a restricted PostgreSQL role (not superuser) so all 37 RLS policies are enforced in production
- [ ] **SEC-02**: JWT tokens are invalidated server-side when a user's role changes or account is suspended
- [ ] **SEC-03**: Stripe webhook idempotency key INSERT is atomic with payment status update (prevents double-charge race condition)
- [ ] **SEC-04**: buildings_manager RLS policy is scoped to managed buildings only (not a flat admin bypass)

### Auth & Identity

- [ ] **AUTH-01**: User can authenticate via phone OTP (SMS or WhatsApp) — not email only
- [ ] **AUTH-02**: Contractor registration validates Teudat Zehut (Israeli ID) checksum before account creation
- [ ] **AUTH-03**: buildings_manager registration requires admin approval with anti-impersonation check (Va'ad Bayit fraud prevention)

### Payments

- [ ] **PAY-01**: Full escrow flow is validated end-to-end in Stripe test mode: resident payment → escrow hold → contractor payout
- [ ] **PAY-02**: Payment agent requires explicit confirmed intent before triggering refund (prevents auto-refund from Hebrew "ביטול" appearing in unrelated context)
- [ ] **PAY-03**: VAT rounding bug fixed (subtotal + tax_amount = total for all ILS amounts); contractor gets VAT-compliant Hebrew PDF invoice
- [ ] **PAY-04**: Resident can split payment into installments (תשלומים) for offers above ₪1,000

### Infrastructure

- [ ] **INFRA-01**: Supabase upgraded to Pro tier (no inactivity pause); FastAPI connection pool uses restricted non-superuser DB role
- [ ] **INFRA-02**: All 170+ environment variables managed via Doppler (not committed env files); secrets injected at container runtime
- [ ] **INFRA-03**: WebSocket ConnectionManager uses Redis pub/sub fan-out so real-time broadcasts work across multiple Uvicorn workers
- [ ] **INFRA-04**: Cloudflare CDN configured with Tel Aviv PoP for static assets; Qdrant volume snapshots automated daily

### UX & Localization

- [ ] **UX-01**: Stripe PaymentElement renders correctly in RTL (Hebrew) — iframe inherits dir=rtl from parent page
- [ ] **UX-02**: Offer deadlines and notification scheduling are Shabbat/Jewish holiday aware (no offers expire on Shabbat, no notifications during quiet hours)
- [ ] **UX-03**: All 34 raw fetch() calls in apps/web replaced with @groupio/api-client calls
- [ ] **UX-04**: Contractor VAT status (עוסק פטור vs עוסק מורשה) tracked and reflected in invoice VAT calculation

### AI Agents

- [ ] **AGENT-01**: Each of the 11 LangGraph agents has an isolated circuit breaker so one agent's LLM failure does not take down the others
- [ ] **AGENT-02**: Vetting agent cache is invalidated when contractor uploads new documents (no stale vetting decisions served)
- [ ] **AGENT-03**: actions_taken list in AgentState is bounded (sliding window or summarization) to prevent Claude context overflow in long conversations
- [ ] **AGENT-04**: Matching agent Qdrant queries include building-level contractor exclusion filter

### Launch Operations

- [ ] **OPS-01**: Meta Business verification submitted and WhatsApp message templates approved (proactive notification templates) — external dependency, start immediately
- [ ] **OPS-02**: 14-day consumer cancellation right (Chok Hamakher Mehuga) handled in group tier pricing — resident can cancel within window, tier recalculated
- [ ] **OPS-03**: Playwright E2E smoke tests pass for all 5 roles (resident, contractor, buildings_manager, admin, super_admin) on staging
- [ ] **OPS-04**: Alembic migration script validates target environment before running (prevents dev migration on production)

---

## v2 Requirements

(Deferred — post city MVP launch)

- Phone KYC beyond checksum (full Teudat Zehut registry verification)
- Mobile app (React Native / Expo) feature parity with web
- Bit / Paybox Israeli payment providers
- Influencer campaigns + viral invite (graph-powered)
- ML predictive models (ENABLE_PREDICTIVE_MODELS)
- Neo4j high-availability (currently single node)
- Pinecone as alternative vector DB
- Multi-building-manager hierarchy
- Teshuvot / dispute resolution workflow beyond current escalations

---

## Out of Scope

- Mobile app for MVP — in-progress, not required for 10 buildings target
- Bit / Paybox — Stripe-only simplifies payment compliance at launch
- Open self-service building creation — buildings created by admin/manager only at MVP
- In-app resident-to-resident chat — WhatsApp handles this
- ML predictive models — not needed for launch
- Viral invite at scale — graph features deferred post product-market fit
- Pinecone vector DB — Qdrant-only at MVP

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SEC-01 | TBD | — |
| SEC-02 | TBD | — |
| SEC-03 | TBD | — |
| SEC-04 | TBD | — |
| AUTH-01 | TBD | — |
| AUTH-02 | TBD | — |
| AUTH-03 | TBD | — |
| PAY-01 | TBD | — |
| PAY-02 | TBD | — |
| PAY-03 | TBD | — |
| PAY-04 | TBD | — |
| INFRA-01 | TBD | — |
| INFRA-02 | TBD | — |
| INFRA-03 | TBD | — |
| INFRA-04 | TBD | — |
| UX-01 | TBD | — |
| UX-02 | TBD | — |
| UX-03 | TBD | — |
| UX-04 | TBD | — |
| AGENT-01 | TBD | — |
| AGENT-02 | TBD | — |
| AGENT-03 | TBD | — |
| AGENT-04 | TBD | — |
| OPS-01 | TBD | — |
| OPS-02 | TBD | — |
| OPS-03 | TBD | — |
| OPS-04 | TBD | — |
