# Professional Code Review – Findings, Improvements & Fixes

**Date:** February 2026  
**Scope:** Backend (Python/FastAPI), Web app (Next.js), Admin, Mobile, shared packages.

---

## 1. Critical Issues

### 1.1 Contractor Create Offer – Wrong Endpoint (404)

**Location:** `apps/web/app/contractor/offers/create/page.tsx`

The create-offer form calls a **Next.js API route** that does not exist:

```ts
const res = await fetch('/api/contractor/offers', { method: 'POST', ... });
```

There is no `app/api/contractor/offers/route.ts` (or similar) in the web app. The request will always return **404**.

**Fix:** Call the backend API using the existing API client (with auth):

- Use `apiClient` from `@/lib/api/client` (or a dedicated createOffer method) and `POST` to `${API_BASE_URL}/api/v1/offers` with `Authorization: Bearer <token>`.
- Map form fields to backend `OfferCreate`: `title`, `description`, `category`, `base_price`, `min_participants`, `max_participants`, `deadline`, `building_id`. The backend sets `created_by` from the current user.
- Add `building_id` to the form (or derive from contractor context); backend requires it.

---

### 1.2 Duplicate `getContractors` in API Client Package

**Location:** `packages/api-client/src/client.ts` (lines 139–154 and 161–174)

`getContractors` is defined **twice**. The second definition overwrites the first, so the first (with `min_trust_score` and different return type) is never used and the public API is confusing.

**Fix:** Keep a single `getContractors` with one signature and one return type (`ContractorsListResponse`), and include all supported query params: `category`, `region`, `verification_status`, `min_trust_score`, `page`, `page_size`.

---

### 1.3 Web API Client – List Offers Response Shape

**Location:** `apps/web/lib/api/client.ts` – `getOffers()`

The client expects `{ offers: Offer[] }`:

```ts
return this.request<{ offers: import("@groupio/types").Offer[] }>(...)
```

The backend returns **OfferListResponse**: `{ items, total, page, page_size, has_more }`.

**Fix:** Type and use the real shape, e.g. `{ items: Offer[]; total: number; page: number; page_size: number; has_more: boolean }`, and update any UI that consumes this to use `items` (and optionally pagination fields).

---

### 1.4 Default JWT Secret in Production

**Location:** `src/config/settings.py`

```python
JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
```

If `JWT_SECRET_KEY` is not set in production, the app uses this default and tokens are predictable.

**Fix:** In production, require a non-default secret (e.g. raise at startup or in `get_settings()` when `ENVIRONMENT == "production"` and `JWT_SECRET_KEY == "your-secret-key-change-in-production"`), and document in README/LOCAL_SETUP.

---

## 2. High-Priority Issues

### 2.1 Contractor Layout – Logout / User Actions Not Wired

**Location:** `apps/web/app/contractor/layout.tsx`

- The “My Business” / user section button (with `LogOut` icon) has no `onClick` and does not log out or open a menu.
- Logout and user menu (e.g. profile, logout) should be implemented (e.g. clear auth store/cookie and redirect to login).

---

### 2.2 `datetime.utcnow()` Deprecation (Python 3.12+)

**Locations:** Multiple files under `src/`

`datetime.utcnow()` is deprecated. Prefer timezone-aware UTC:

```python
from datetime import datetime, timezone
# Use:
datetime.now(timezone.utc)
```

**Files to update:**  
`src/api/middleware/auth.py`, `src/api/routes/auth.py`, `src/api/routes/escalations.py`, `src/databases/postgres.py`, `src/orchestration/state.py`, and models under `src/models/` that use `default_factory=datetime.utcnow` (residents, offers, messages, contractors).

---

### 2.3 Admin Escalations and Analytics (from existing CODE_REVIEW.md)

- **Escalations:** Admin client calls `/admin/escalations`; backend exposes `/api/v1/escalations`. Fix base path or proxy so admin hits the correct URL.
- **Analytics:** Admin fetches `/api/admin/analytics` which does not exist (no Next.js route, no backend). Either add the backend/Next route or remove the analytics call and show a placeholder.

---

### 2.4 Join Offer Request Shape – Backend vs Frontend

**Backend:** `OfferJoinRequest` expects `user_id` and optional `unit_count` (default 1).  
**Web client:** `joinOffer(offerId, userId)` sends `{ userId }` (camelCase). Backend uses `populate_by_name`/alias where defined; ensure `user_id` is accepted (or add alias `userId`).

---

## 3. Medium-Priority Improvements

### 3.1 Error Handling and UX

- **Contractor create offer:** Replace `alert()` with a toast or inline error component; avoid `console.error` as the only feedback.
- **API client:** Ensure 401 triggers refresh (or redirect to login); consider retry/backoff for 5xx and network errors.

### 3.2 Typing and Consistency

- **Backend:** Ensure route response types match Pydantic models (e.g. `OfferResponse` for create/update/get single offer). PostgresClient returns dicts; confirm keys match model fields (snake_case).
- **Frontend:** Use shared types from `@groupio/types` for API request/response bodies; avoid ad-hoc interfaces that drift from backend.

### 3.3 Security and Hardening

- **Secrets in logs:** Ensure tokens, passwords, and API keys are never logged (audit `logger.*` and exception handlers).
- **CORS:** Keep `CORS_ORIGINS` strict in production; document required origins.
- **Rate limiting:** Consider stricter limits on auth endpoints (login, signup, password reset).

### 3.4 Package API Client

- **packages/api-client** `getOffers`: Backend uses query param `building_id`, not `buildingId`. Use `building_id` in the URL so list offers works correctly.
- Unify usage: Prefer one client (e.g. `@groupio/api-client`) across web and admin with a single base URL and path convention; document any exception (e.g. mobile).

---

## 4. Suggestions

### 4.1 Architecture and Clean Code

- **Dependency injection:** Consider injecting `get_postgres_client`, `get_redis_client`, etc., in routes to simplify unit/integration tests.
- **Create-offer flow:** Decide whether contractors create offers for a specific building or “open” offers; then align backend `OfferCreate.building_id` and frontend form (required field or hidden from contractor).

### 4.2 Testing and CI

- Run backend **integration** tests in CI (with Redis; optional Postgres/Qdrant/Neo4j or testcontainers).
- Make E2E fail the pipeline when tests fail (remove `continue-on-error` once stable).
- Add integration tests for auth (signup, login JSON, refresh), offers (create, list, join), and PostgresClient where feasible.

### 4.3 API and Docs

- Document that all routes live under `/api/v1` and any future versioning.
- Standardize list endpoints on query params (e.g. `page`, `page_size`) and response shape (`items`, `total`, `has_more`).
- Align `docs/api_reference.md` with actual routes and request/response schemas.

### 4.4 Frontend

- Add error boundaries and loading states on critical flows (signup, login, offer create).
- Contractor layout: Add logout handler and optional user menu (profile, settings, logout).

---

## 5. Quick Reference – Status

| Item                                      | Severity   | Status / Action                    |
|-------------------------------------------|------------|------------------------------------|
| Contractor create offer calls wrong URL   | Critical   | Fix: use backend API + auth        |
| Duplicate `getContractors` in api-client  | Critical   | Fix: single method, full params     |
| Web getOffers response shape              | Critical   | Fix: use `items` + pagination      |
| Default JWT secret                         | Critical   | Fix: enforce secret in production  |
| Contractor layout logout / user menu       | High       | Fix: wire logout and menu          |
| `datetime.utcnow()` deprecation           | High       | Fix: use `datetime.now(timezone.utc)` |
| Admin escalations/analytics URLs          | High       | Fix paths or add routes             |
| Join offer body (user_id vs userId)        | Medium     | Verify backend accepts frontend    |
| Error UX (alert → toast)                  | Medium     | Improve feedback                    |
| API client building_id param              | Medium     | Use snake_case in query             |

---

## 6. Code Fixes to Apply

The following concrete code changes are recommended next:

1. **apps/web/app/contractor/offers/create/page.tsx**  
   - Use backend `POST /api/v1/offers` via api client with auth token.  
   - Map form fields to backend snake_case and include `building_id`.

2. **packages/api-client/src/client.ts**  
   - Remove the first `getContractors` overload; keep one method with full params and `ContractorsListResponse`.

3. **apps/web/lib/api/client.ts**  
   - Change `getOffers` return type and usage to `{ items, total, page, page_size, has_more }` and use `building_id` in query.

4. **src/config/settings.py**  
   - Add a startup or runtime check that in production `JWT_SECRET_KEY` is not the default placeholder.

5. **src/api/middleware/auth.py** (and other files)  
   - Replace `datetime.utcnow()` with `datetime.now(timezone.utc)`.

6. **apps/web/app/contractor/layout.tsx**  
   - Add logout handler and, if desired, a simple user dropdown (profile / logout).

---

*This review builds on and supplements `docs/CODE_REVIEW.md`. Address critical items first, then high and medium as capacity allows.*
