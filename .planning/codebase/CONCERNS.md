---
last_mapped: 2026-05-06
---

# Concerns & Tech Debt

## High Priority

### 1. Direct `fetch()` calls in frontend (34 occurrences)
**Location:** `apps/web/app/`, `apps/web/lib/`, `apps/web/components/`
**Rule violated:** All API calls must go through `@groupio/api-client`
**Risk:** Bypasses auth headers, retry logic, and deduplication built into the shared client. Inconsistent error handling across the app.
**Fix:** Replace raw `fetch()` calls with equivalent `apiClient.*` calls from `packages/api-client/`.

### 2. `User` type overlap in auth store
**Location:** `apps/web/lib/stores/authStore.ts:5`
**Issue:** `// TODO: User overlaps with Resident/contractor profile from @groupio/types; consider sharing a base type.`
**Risk:** Duplicated type definitions can drift, causing runtime type mismatches between auth state and shared types.
**Fix:** Consolidate into a shared `AuthUser` base type in `packages/types/src/index.ts`.

### 3. Mobile app completeness
**Location:** `apps/mobile/`
**Issue:** React Native / Expo app exists but appears in-progress. Maestro tests defined but mobile may not have feature parity with web.
**Risk:** Undefined scope — unclear which features are expected to work on mobile.

## Medium Priority

### 4. ESLint suppressions in React 19 code
**Location:** `apps/web/app/providers.tsx` (3 suppressions), `apps/web/app/(resident)/checkout/page.tsx`
**Issue:** `@ts-expect-error -- React 19 ReactNode typing conflict` and `eslint-disable react-hooks/set-state-in-effect`
**Risk:** These are React 19 compatibility shims. May be resolved when upstream types are updated, but create ongoing maintenance debt.

### 5. Pinecone vs Qdrant dual vector DB
**Location:** `src/databases/vector_store.py`, `src/databases/pinecone_store.py`, env var `VECTOR_DB_PROVIDER`
**Issue:** Two vector stores maintained in parallel. Config flag selects between them at runtime.
**Risk:** Diverging implementations, double maintenance burden. One should be deprecated.

### 6. Optional payment providers (Bit, Paybox)
**Location:** `src/services/payment.py`, `get_payment_provider()` factory
**Issue:** Three payment providers (Stripe primary, Bit and Paybox optional Israel-local) are maintained. The factory is fail-closed at startup, which is good — but all three providers need to be tested in their respective environments.
**Risk:** Bit/Paybox code paths may be undertested since Stripe is the primary.

### 7. Feature flag sprawl
**Issue:** 11 boolean feature flags in env vars (`ENABLE_RABBITMQ`, `ENABLE_OUTBOX`, `ENABLE_CRM_SYNC`, etc.)
**Risk:** Combinations of on/off flags create exponential test surface. No central feature flag service — each flag checked individually in code.

## Low Priority / Watch Areas

### 8. PERF annotations (tracked, not resolved)
Multiple code comments reference specific performance improvements (PERF-2 through PERF-12):
- `PERF-2`: Auth-user Redis cache to reduce DB load
- `PERF-4`: Concurrent participant notification (max 10 in flight)
- `PERF-5+10`: Short-TTL context cache in orchestrator
- `PERF-7`: Explicit column lists to avoid `SELECT *` payload bloat
- `PERF-9`: Paginated payment history
- `PERF-11`: GDS similarity materialization (optional Neo4j GDS)
- `PERF-12`: Cache-Control middleware
These are annotated and documented — tracking is good. Watch for regressions when modifying these paths.

### 9. Israeli government data API dependency
**Location:** `src/services/datagov_provider.py`
**Issue:** `NOTE: data.gov.il does not provide official contractor *license* verification.`
**Risk:** The data source doesn't actually verify contractor licenses — it only provides address/building data. Contractor license verification claims must not over-represent this integration.

### 10. asyncpg / Supabase dual path
**Location:** `src/databases/postgres.py`
**Issue:** Comment notes asyncpg uses explicit column lists while Supabase PostgREST uses `.select("*")`. Two code paths for the same data.
**Risk:** Schema migrations that add columns may silently work on Supabase but break asyncpg paths if column lists aren't updated.

### 11. 44 Alembic migrations — potential drift
**Location:** `alembic/versions/`
**Issue:** 44 migration versions. With this many migrations, schema drift between environments is a risk if migrations aren't run in order.
**Risk:** `alembic upgrade head` must be run before any deployment. CI should validate migration state.

## Security Observations

### Good practices observed
- Stripe webhook signature verification enforced (`stripe.Webhook.construct_event()`)
- Two-layer authorization: RLS + FastAPI role guards
- JWT validation in middleware, never skipped
- Input sanitization via `sanitize_input()` and `validate_message_request()` utilities
- `_USER_COLS` explicitly excludes `hashed_password` from default user queries
- Rate limiting configured globally
- Security headers middleware applied

### Areas to monitor
- WhatsApp webhook secret verification — ensure `WHATSAPP_WEBHOOK_SECRET` is always validated
- `CORS_ORIGINS` env var — ensure production is not set to wildcard
- `API_KEYS` env var — used for service-to-service auth, ensure rotation policy exists

## Infrastructure Concerns

### RabbitMQ is optional
When `ENABLE_RABBITMQ=false`, the outbox pattern is disabled. Ensure the fallback path for reliable message delivery is tested.

### Neo4j is optional
`ENABLE_GRAPH_QUERIES` gates all Neo4j-powered features (contractor reputation, viral invite, influencer campaigns). If disabled, graph-dependent agent paths must degrade gracefully.

### Redis as single point of failure
Redis is used for both auth caching and rate limiting. The `test_auth_redis_fallback.py` test suggests a fallback path exists — verify it works correctly in production.
