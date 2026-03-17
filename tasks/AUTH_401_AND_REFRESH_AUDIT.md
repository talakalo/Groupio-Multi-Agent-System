# Groupio Auth 401 and Refresh Flow Audit

## 1. Executive Summary

**Login 401 root cause**: Either (a) user does not exist in the database, or (b) wrong password. The backend returns 401 for both cases with "Invalid credentials" to avoid user enumeration. **User must run `scripts/seed_user_accounts.py`** to create demo users (e.g. tal.akalo@gmail.com / T220782al!@#) before login will succeed.

**Refresh-after-failed-login**: The frontend's apiClient triggered `refreshAccessToken()` on every 401, including login. Login uses apiClient.login() → request() → 401 → refresh attempted → /auth/refresh called (no cookie) → 401 "Refresh token required". **Fixed**: Auth endpoints (login, signup, refresh, etc.) are now excluded from 401-retry; no refresh call after failed login.

**Metrics 403**: Intentional. `/metrics` requires `X-API-Key` or `Authorization: Bearer` when `API_KEYS` is set. Prometheus scrape config does not send auth. **Options**: (1) Set `API_KEYS=[]` in docker/.env for local dev (metrics unauthenticated), or (2) Add `bearer_token` to prometheus.yml with one of the API_KEYS for production.

---

## 2. Login Root Cause

- **Route**: `POST /api/v1/auth/login/json`
- **Files**: `src/api/routes/auth.py` → `login_json()`
- **Failure cases returning 401**:
  - `user is None` (get_user_by_email/get_user_by_phone) → UserNotFound
  - `not verify_password(request.password, hashed)` → WrongPassword
- **DB check**: Run `python scripts/seed_user_accounts.py` with `USE_LOCAL_POSTGRES=1 DOCKER_POSTGRES_LOCALHOST=1` (from host) or equivalent from inside container. Seed creates: tal.akalo@gmail.com / T220782al!@#, takalo878@gmail.com / T2207al!@#, etc.
- **Diagnostic logging**: Added `logger.info("Login 401: user not found ...")` and `logger.info("Login 401: invalid password for user_id=...")` for operator diagnostics.

---

## 3. Frontend Refresh Behavior Findings

- **Where triggered**: `apps/web/lib/api/client.ts` → `request()` → on 401, calls `refreshToken()` → `refreshAccessToken()` → `POST /auth/refresh`
- **Why after failed login**: Login goes through `apiClient.login()` → `request("/api/v1/auth/login/json")`. Any 401 triggered the retry handler.
- **Why wrong**: Auth endpoints return 401 for "invalid credentials" or "no session". Refresh cannot help; it only adds noise and a second 401.
- **Fix**: Introduced `AUTH_PUBLIC_ENDPOINTS` and `isAuthPublicEndpoint()`. For these endpoints, 401 does NOT trigger refresh. Endpoints: `/api/v1/auth/login`, `/api/v1/auth/login/json`, `/api/v1/auth/signup`, `/api/v1/auth/register`, `/api/v1/auth/refresh`, `/api/v1/auth/password/reset`, `/api/v1/auth/password/reset/confirm`, `/api/v1/auth/verify-email`, `/api/v1/auth/resend-verification`, `/api/v1/auth/resend-verification-by-email`.

---

## 4. User-Facing Error Handling Findings

- **Current**: Login page maps 401 → "אימייל או סיסמה שגויים. נסו שוב.", 403 → verification message, 423 → "החשבון נחסם. פנו לתמיכה."
- **Status**: Correct. No change needed. The removal of the extra refresh call ensures the user sees the real login error, not a secondary "Refresh token required" message.

---

## 5. Metrics 403 Findings

- **Source**: Prometheus (or internal monitoring) scraping `api:8000/metrics` without auth.
- **Expected**: `/metrics` is protected when `API_KEYS` is set. 403 is correct behavior.
- **Fix options**: (1) Local dev: `API_KEYS=[]` in docker/.env. (2) Production: Add `bearer_token: "<one-of-API_KEYS>"` to the groupio-api scrape_config in prometheus.yml, or use `bearer_token_file`.

---

## 6. Fixes Implemented

| Area | Change | Safety |
|------|--------|--------|
| **Frontend** | Exclude auth endpoints from 401-retry in apiClient | Prevents unnecessary /auth/refresh after failed login |
| **Backend** | Log "Login 401: user not found" / "invalid password" for diagnostics | Operator-only; no PII in logs |
| **Tests** | Added apiClient test: login 401 does NOT trigger refresh | Regression protection |

---

## 7. Tests Added or Updated

- `apps/web/__tests__/apiClient.test.ts`: `it('does NOT trigger refresh on 401 for auth endpoints (login, signup, refresh)', ...)` 

---

## 8. Validation

```bash
# 1. Seed users (from host, against Docker Postgres)
cd /Users/talakalo/projects/Groupio-Multi-Agent-System
load docker/.env
USE_LOCAL_POSTGRES=1 DOCKER_POSTGRES_LOCALHOST=1 python scripts/seed_user_accounts.py

# 2. Login
curl -X POST http://localhost:8000/api/v1/auth/login/json \
  -H "Content-Type: application/json" \
  -d '{"email":"tal.akalo@gmail.com","password":"T220782al!@#"}'
# Expect 200 with access_token

# 3. Verify no refresh on failed login (browser devtools): login with wrong password → single 401, no /auth/refresh call
```

---

## 9. Remaining Risks

- **Seed requirement**: Fresh Docker Postgres has no users. Operators must run `seed_user_accounts.py`. Consider adding an optional init container or doc step.
- **Metrics in dev**: With `API_KEYS` set, Prometheus gets 403. Use `API_KEYS=[]` for local dev if metrics scraping is needed.
- **Password typos**: tal.akalo password is `T220782al!@#` (with 782, exclamation, @, #). Common typo: missing characters.
