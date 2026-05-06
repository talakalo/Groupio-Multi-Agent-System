# Groupio — City MVP Launch Readiness

## What This Is

Groupio is a marketplace where Israeli apartment building residents group together to hire contractors for home services (AC, plumbing, electrical, renovations) at discounted rates via dynamic tier pricing. Residents in the same building join an "offer" collectively; the more who join, the lower the price drops.

The platform already has a full-stack codebase (FastAPI + Next.js + 11 LangGraph agents). This milestone is about getting it **launch-ready** for a multi-city Israeli MVP — hardening, completing unfinished flows, and shipping to production so real residents and contractors can transact.

## Core Value

**The first real transaction** — a resident pays for a contractor service through escrow, the work gets done, the contractor gets paid. Everything else is scaffolding for that moment.

**Launch success = 10 active buildings** with residents browsing and joining offers.

## Context

| Dimension | Detail |
|-----------|--------|
| Stage | Brownfield — large codebase exists, no production users yet |
| Target users | Residents in multi-unit apartment buildings (Israel) |
| Contractor model | Mix: pre-signed partners + open self-signup |
| Geographic scope | Multiple Israeli cities simultaneously |
| Timeline | 1–3 months |
| Ops model | Mostly automated — agents + automation handle 90%+ |
| Identified gaps | Payments & escrow, contractor onboarding, resident experience, production infra |

## Requirements

### Validated

(Existing capabilities confirmed in codebase)

- ✓ Multi-role auth system (resident, contractor, buildings_manager, admin, super_admin) — existing
- ✓ FastAPI backend with 17 route modules + JWT auth + RLS — existing
- ✓ 11 LangGraph specialist agents (matching, pricing, payment, vetting, support…) — existing
- ✓ Dynamic tier pricing — price drops as more residents join — existing
- ✓ Offer lifecycle: draft → active → pending → in_progress → completed — existing
- ✓ Escrow lifecycle: collecting → held → released — existing
- ✓ Stripe payment integration (PaymentIntents, webhooks) — existing
- ✓ Hebrew RTL + English i18n (next-intl) — existing
- ✓ Contractor vetting (trust score, license, insurance, certifications) — existing
- ✓ WhatsApp bot + email notifications — existing
- ✓ PostgreSQL RLS policies + 44 Alembic migrations — existing
- ✓ Admin dashboard (apps/admin) — existing
- ✓ Vitest unit tests + Playwright E2E (with Hebrew locale project) — existing
- ✓ Observability stack (Prometheus, Grafana, Sentry, structlog) — existing

### Active

(Required for launch — not yet production-ready)

- [ ] Production deployment — cloud hosting, Docker-to-prod pipeline, environment config
- [ ] Production secrets management — all 170+ env vars wired to production secrets store
- [ ] Payment end-to-end validation — full Stripe flow from resident pay → escrow hold → contractor payout
- [ ] Contractor self-signup + membership checkout — complete and tested (Stripe subscription)
- [ ] Resident onboarding flow — invite code → account creation → building join → browse offers
- [ ] Building manager onboarding — create building, invite residents, manage roster
- [ ] Admin operations readiness — escalation queue, payout approvals, user suspension
- [ ] Production monitoring & alerting — Sentry DSN wired, Prometheus alerts configured
- [ ] Security hardening — RLS validation for all 5 roles, webhook signature checks, OWASP review
- [ ] E2E smoke test suite — happy path for all roles passing against staging environment
- [ ] Error handling completeness — all 34 raw fetch() calls → api-client, field-level form errors
- [ ] Legal & compliance — Terms of Service, Privacy Policy, GDPR-equivalent (Israeli law)
- [ ] Load testing — validate system handles expected concurrent users at launch
- [ ] Operational runbooks — how to handle escalations, refunds, contractor disputes

### Out of Scope

- Mobile app (React Native / Expo) — in-progress, not required for city MVP
- Bit / Paybox payment providers — Stripe-only for MVP launch
- ML predictive models (`ENABLE_PREDICTIVE_MODELS`) — not required for launch
- Influencer campaigns / viral invite (graph features) — post-launch
- Pinecone vector DB — Qdrant-only for MVP (dual path deferred)
- Multi-building-manager hierarchy — single manager per building is enough for MVP

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stripe-only payments for MVP | Reduces integration surface, Bit/Paybox can be added post-launch | — Pending |
| Multiple cities at once | Maximizes early contractor pool and offer density | — Pending |
| Pre-signed + open contractor signup | Pre-signed partners guarantee supply; open signup builds long-term pipeline | — Pending |
| Mostly automated ops | Small team can't manually handle scale; agents route and resolve 90%+ | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-06 after initialization*
