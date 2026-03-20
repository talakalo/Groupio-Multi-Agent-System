# AI Readiness Audit — Groupio Multi-Agent System

**Date**: 2026-03-20
**Auditor**: Claude Code (automated deep-codebase audit)
**Branch**: `claude/audit-ai-readiness-78JWg`
**Scope**: Full codebase — backend (`src/`), frontend (`apps/`), infrastructure (`docker/`, `alembic/`)

---

## Executive Summary

The Groupio Multi-Agent System is a well-structured production-grade platform with a **strong AI foundation**. The LangGraph orchestration, dual-model LLM strategy, RAG pipeline, and autonomy-mode architecture are implemented correctly and are genuinely production-ready.

However, **four critical gaps** exist that must be resolved before AI agents can be trusted to act autonomously in a live environment:

1. The **payment agent issues refunds without any human approval gate**, bypassing the autonomy-mode system entirely.
2. The **admin UI approve/reject controls for pending agent decisions are unimplemented stubs** — the governance loop has no closing action.
3. **Agent autonomy modes are not persisted** — they reset to `"auto"` on every page reload, making runtime governance impossible.
4. **Email verification is disabled by default**, allowing unverified users to initiate payments and trigger agent workflows.

---

## 1. Architecture Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend API | FastAPI (Python 3.11+) | Async, Pydantic v2, 28 Alembic migrations |
| Agent Orchestration | LangGraph `StateGraph` | 10 specialized agents, typed `AgentState` |
| Primary LLM | `claude-sonnet-4-20250514` (Anthropic) | Configurable via `PRIMARY_MODEL` |
| Fallback LLM | `gpt-4o` (OpenAI) | Auto-fallback on timeout/failure |
| Embedding | `text-embedding-3-large` (OpenAI) | 1536 dimensions |
| Vector Store | Qdrant | 4 collections: offers, contractors, faq, conversations |
| Graph Store | Neo4j 5 + APOC | Invite chains, influence scores, building similarity |
| Cache / Denylist | Redis 7 | JWT denylist, LLM response cache, rate-limit counters |
| Database | PostgreSQL 15 / Supabase | RLS on sensitive tables (Supabase mode) |
| Frontend | Next.js 14 (App Router), React 19, TypeScript | i18n via `next-intl` (Hebrew + English) |
| Mobile | React Native + Expo Router | Separate `apps/mobile` |
| Infra | Docker Compose, Prometheus, Sentry | Monitoring fully wired |

---

## 2. Agent Inventory

| Agent | File | Autonomy Mode (default) | What It Does |
|-------|------|------------------------|-------------|
| Router | `src/agents/router.py` | — | Intent classification; confidence-gated routing |
| Support | `src/agents/support.py` | auto | FAQ RAG, escalation triage |
| Matching | `src/agents/matching.py` | `recommend` | Weighted contractor matching |
| Pricing | `src/agents/pricing.py` | `recommend` | Group discount tiers (5/10/15/20%) |
| Vetting | `src/agents/vetting.py` | `recommend` | Trust score, license/insurance verification |
| Outreach | `src/agents/outreach.py` | `gated` | Campaign management, A/B testing |
| Analytics | `src/agents/analytics.py` | auto | NL → SQL queries |
| Architecture | `src/agents/architecture.py` | auto | Building improvement analysis |
| Payment | `src/agents/payment.py` | auto | Payment status, invoice, **refund** |
| Notification | `src/agents/notification.py` | auto | Multi-channel message dispatch |
| Influencer | `src/agents/influencer.py` | auto | Invite chain, influence scoring |

**Autonomy modes** are defined in `.env` / `src/config/settings.py`:
- `auto` — agent executes immediately
- `recommend` — result queued in `pending_agent_decisions`, admin must confirm
- `gated` — always requires human approval before action

---

## 3. Strengths — What Is Working Well

### 3.1 LangGraph Orchestration
`src/orchestration/graph.py` implements a full `StateGraph` with typed `AgentState` (versioned via `state_contract_version`). Agent handoffs carry context (`context_for_next_agent`, `entities`), preventing data loss between hops. The router uses confidence thresholding (`ROUTER_CONFIDENCE_THRESHOLD=0.7`) before delegating.

### 3.2 Dual-Model Fallback with Circuit Breaker
`src/agents/base.py:37` implements a `CircuitBreaker` (threshold: 5 failures, 60 s recovery). On Claude timeout or failure, the system falls back to GPT-4o automatically. This prevents single-provider outages from taking down the entire agent system.

### 3.3 LLM Response Caching
`src/utils/llm_client.py` caches LLM responses in Redis (SHA256 key over model + system_prompt + messages, TTL: 30 min). This reduces cost and latency for repeated queries.

### 3.4 RAG Pipeline
Qdrant hybrid search (semantic + keyword) with multi-hop retrieval and reranking (top-5 from top-10). Chunking: 512 tokens / 50 overlap. Collections: `offers`, `contractors`, `faq`, `conversations`.

### 3.5 Comprehensive Audit Trail
- `audit_logs` table — immutable (app role `groupio_app` has no `UPDATE`/`DELETE`). Every user action is recorded with IP.
- `agent_audit_log` table — every agent decision with confidence score and reasoning.
- `pending_agent_decisions` table — gated decisions queued for human approval.
- `contractor_verification_metadata` — full audit trail of every vetting API call (source, confidence, raw response).

### 3.6 JWT Security
- HS256 tokens with JTI claims; denylist stored in Redis with matching TTL.
- Logout and password-change immediately revoke the current token.
- 5-role RBAC (`resident`, `contractor`, `buildings_manager`, `admin`, `super_admin`) with fine-grained FastAPI dependency guards.

### 3.7 Infrastructure Security
- RLS enabled on `users`, `offer_participants`, `payments`, `chat_messages`, `audit_logs`, `escalations` (Supabase).
- HMAC SHA-256 webhook verification for Stripe.
- Timing-safe API key comparison.
- CSP, HSTS, X-Frame-Options, Referrer-Policy headers on both Next.js and FastAPI.
- PII redaction in request logging middleware.

### 3.8 Payment Governance (Escrow Logic)
`src/api/routes/payments.py` implements a well-designed escrow decision engine with configurable thresholds (participant count, amount, contractor trust score, category risk). The thresholds are stored in `system_settings` and can be updated at runtime via the admin API.

---

## 4. Critical Gaps — Must Fix Before Production

### GAP-1: Payment Agent Issues Refunds Autonomously (No Human Gate)

**File**: `src/agents/payment.py`, method `_handle_refund_request` (lines ~201–283)

**Problem**: When a user sends a refund-related message, the payment agent immediately calls `provider.refund()` on the most recent succeeded payment, updates the payment and invoice status in the database, and confirms the refund to the user — all without any human approval gate. This happens even though `PAYMENT_AGENT_MODE` exists as a setting.

```python
# src/agents/payment.py — current behaviour
result = await provider.refund(transaction_id=transaction_id, amount=candidate.get("amount"))
await db.update_payment(candidate["id"], {"status": result.get("status", "refunded")})
```

**Risk**: Any user can trigger a refund of their most recent payment by sending a message containing words like "refund", "החזר", "ביטול", or "cancel". There is no ownership check beyond `user_id`, no cooldown, and no admin notification.

**Fix**: Read `settings.PAYMENT_AGENT_MODE` in `_handle_refund_request`. When mode is `recommend` or `gated`, write to `pending_agent_decisions` and set `state["needs_human"] = True` instead of executing the refund. Apply the same pattern used by `MatchingAgent` and `VettingAgent`.

---

### GAP-2: Pending Decision Approve/Reject Buttons Are Unimplemented Stubs

**File**: `apps/admin/app/agents/page.tsx`, lines 244–250

**Problem**: The admin UI renders a `PendingDecisionCard` component with `onApprove` and `onReject` callbacks. Both callbacks are wired to handler functions that contain only `// TODO: wire to escalation resolve API` comments and do nothing:

```typescript
// apps/admin/app/agents/page.tsx:244-250
const handleApproveDecision = useCallback((_id: string) => {
  // TODO: wire to escalation resolve API
}, []);
const handleRejectDecision = useCallback((_id: string) => {
  // TODO: wire to escalation reject API
}, []);
```

**Risk**: The backend correctly creates `pending_agent_decisions` records for gated actions (outreach, and any agent operating in `gated` mode). However, admins have no way to approve or reject them through the UI. Gated decisions will accumulate indefinitely and never execute.

**Fix**: Wire `handleApproveDecision` to `POST /api/v1/admin/agent-decisions/{id}/approve` and `handleRejectDecision` to `POST /api/v1/admin/agent-decisions/{id}/reject`. Verify the backend endpoints exist in `src/api/routes/admin.py` and implement them if missing.

---

### GAP-3: Agent Autonomy Modes Are Not Persisted

**File**: `apps/admin/app/agents/page.tsx`, lines 87–90

**Problem**: The comment in the source code itself describes the issue: *"Agent modes & toggles — client state until backend supports persistence."* All mode changes are stored only in React `useState` and are lost on page reload:

```typescript
// apps/admin/app/agents/page.tsx:87-90
// Agent modes & toggles — client state until backend supports persistence
const [agentModes, setAgentModes] = useState<Record<string, AgentMode>>(
  () => Object.fromEntries(AGENT_DEFS.map((a) => [a.key, "auto" as AgentMode])),
);
```

Furthermore, the defaults in `agentModes` initialisation are all `"auto"`, meaning the UI ignores the `MATCHING_AGENT_MODE=recommend` and `OUTREACH_AGENT_MODE=gated` values configured in the environment. The actual modes used at runtime are the env-var values, but what admins see in the UI does not reflect them.

**Risk**: Admins believe they are changing agent behaviour but they are not. The mismatch between displayed mode and actual runtime mode undermines operator trust in the control plane.

**Fix**:
1. Add a `GET /api/v1/admin/settings` query to load current agent modes on page mount (the endpoint already exists in `admin.py`).
2. Persist mode changes via `PUT /api/v1/admin/settings` when an admin toggles a mode.
3. The backend should store agent modes in `system_settings` and have `settings.py` read from there (with env-var as initial/default).

---

### GAP-4: Email Verification Not Enforced

**File**: `src/config/settings.py`, line 145

**Problem**: `ENFORCE_EMAIL_VERIFICATION: bool = False` — the login and token-refresh endpoints check this flag before blocking unverified users, meaning anyone can sign up with a fake email address, receive a JWT, and immediately start creating offers, initiating payments, and triggering agent workflows:

```python
# src/api/routes/auth.py:277
if settings.ENFORCE_EMAIL_VERIFICATION and not user.is_verified:
    raise HTTPException(...)  # Only checked if flag is True
```

**Risk**: Without email verification, the platform is open to low-friction account creation by bad actors, inflating agent workload and potentially triggering outreach campaigns to invalid addresses.

**Fix**: Set `ENFORCE_EMAIL_VERIFICATION=true` in staging and production environments. Ensure the email service (SMTP credentials) is configured before enabling this. The verification flow is already fully implemented (`/verify-email`, `/resend-verification` routes exist).

---

## 5. Medium-Priority Findings

### M-1: Payment Provider Defaults to Mock

`PAYMENT_PROVIDER: str = "mock"` in `src/config/settings.py:152`. The mock provider returns fake transaction IDs and never charges. This is correct for development but there is no environment-level guard preventing it from being deployed to production. The production readiness validator in `settings.py` should assert `PAYMENT_PROVIDER != "mock"` when `ENVIRONMENT == "production"`.

### M-2: Circuit Breaker Is Process-Local

`src/agents/base.py:75` defines `_llm_circuit_breaker` as a module-level singleton. In a multi-worker deployment (multiple Uvicorn processes or pods), each worker has an independent circuit breaker. A cascading LLM failure will not open the breaker across all workers simultaneously, meaning some workers continue hammering a failing provider while others have already backed off. Consider moving circuit-breaker state to Redis.

### M-3: Vetting Source Allowlist Missing

`contractor_verification_metadata.source` accepts any string. The vetting agent could write a record claiming verification from an arbitrary source. There is no allowlist of trusted verification sources. Add a `TRUSTED_VERIFICATION_SOURCES` config constant and validate against it before persisting metadata.

### M-4: Agent Audit Log Has No Retention Policy

`agent_audit_log` and `audit_logs` have no `DELETE` permissions for the app role (correctly immutable). However, there is no automated archival or retention policy. At scale, these tables will grow unboundedly. Define a retention window (e.g. 2 years) and implement an archival job.

### M-5: TOTP Secret Stored in Users Table

`users.totp_secret` is stored in plaintext in the `users` table. If the database is compromised, TOTP secrets are exposed, allowing an attacker to generate valid OTP codes. Encrypt `totp_secret` at rest using a KMS-backed key.

---

## 6. Configuration Checklist for Production

| Setting | Default | Required for Production |
|---------|---------|------------------------|
| `PAYMENT_PROVIDER` | `mock` | `stripe` |
| `ENFORCE_EMAIL_VERIFICATION` | `False` | `True` |
| `JWT_SECRET_KEY` | auto-generated | >= 64 chars, stable secret |
| `ENVIRONMENT` | `development` | `production` |
| `MATCHING_AGENT_MODE` | `recommend` (env) / `auto` (UI) | `recommend` — fix UI sync (GAP-3) |
| `OUTREACH_AGENT_MODE` | `gated` (env) / `auto` (UI) | `gated` — fix UI sync (GAP-3) |
| `PAYMENT_AGENT_MODE` | `auto` | `recommend` or `gated` — fix agent (GAP-1) |
| `VETTING_AGENT_MODE` | `recommend` | `recommend` |
| `STRIPE_WEBHOOK_SECRET` | unset | Required |
| `SMTP_*` | unset | Required (for email verification) |
| `API_KEYS` | `[]` | Non-empty list required |
| `SENTRY_DSN` | unset | Recommended |
| `REDIS_PASSWORD` | unset | Required (production Redis) |

---

## 7. Remediation Priority

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| P0 — Critical | GAP-1: Payment agent autonomous refunds | Medium (1–2 days) | Financial loss, fraud |
| P0 — Critical | GAP-2: Pending decision UI stubs | Small (< 1 day) | Governance loop broken |
| P0 — Critical | GAP-3: Agent mode persistence | Medium (1–2 days) | Operator control plane unreliable |
| P1 — High | GAP-4: Email verification disabled | Trivial (env change + SMTP setup) | Account integrity |
| P1 — High | M-1: Mock payment provider guard | Small (< 1 day) | Accidental production mock |
| P2 — Medium | M-2: Process-local circuit breaker | Medium | Resilience in multi-worker |
| P2 — Medium | M-3: Vetting source allowlist | Small | Data integrity |
| P3 — Low | M-4: Audit log retention | Small | Storage growth |
| P3 — Low | M-5: TOTP secret encryption | Medium | Defence-in-depth |

---

## 8. What Is Ready for Production

The following subsystems are production-ready as-is:

- LangGraph multi-agent orchestration and state management
- Router intent classification with confidence gating
- RAG pipeline (Qdrant + Neo4j hybrid retrieval)
- JWT authentication with Redis-backed token denylist
- RBAC with 5 roles and fine-grained FastAPI guards
- Stripe webhook verification and escrow decision logic
- Comprehensive immutable audit logging
- Contractor vetting pipeline (trust score, license/insurance)
- Multi-channel notification dispatch (email, WhatsApp, push, in-app)
- i18n (Hebrew + English) throughout
- Prometheus metrics and Sentry error tracking
- Database schema (28 migrations, full referential integrity)
- Docker Compose infrastructure (PostgreSQL, Qdrant, Neo4j, Redis)
