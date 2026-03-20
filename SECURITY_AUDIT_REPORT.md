# Security Audit Report — Groupio Multi-Agent System

**Date:** 2026-03-20
**Scope:** Full backend (FastAPI) + middleware + storage service
**Reference:** "Web Application Security for AI Agents" — OWASP API Top 10 (2023), input/output protection, authentication, infrastructure

---

## Executive Summary

The Groupio codebase has a solid security foundation: JWT authentication, bcrypt password hashing, RBAC, structured logging, Docker non-root users, GitLeaks secret scanning, and security headers middleware. **All 13 findings across two audit passes are now fixed** — 5 Critical/High in the first pass, and 8 Medium/Low in the second pass.

---

## Findings Fixed in This Audit

### CRITICAL-01: File Upload Content-Type Spoofing (Magic Byte Bypass)
**Severity:** CRITICAL
**File:** `src/services/storage.py`

**Issue:**
`validate_file()` trusted the `content_type` sent by the HTTP client without verifying the actual file content. An attacker could upload a malicious file (e.g. a PHP webshell, HTML with scripts, or an executable) by declaring `content_type=image/jpeg` in the multipart form request.

**Attack scenario:**
```
POST /api/v1/uploads/architecture
Content-Type: multipart/form-data
[malicious_script.php renamed, content-type: image/jpeg]
→ File accepted and stored, potentially served publicly
```

**Fix Applied:**
Added `_detect_magic_type()` and `_verify_magic_bytes()` functions that read the first bytes of every uploaded file and compare them against known file signatures (magic bytes):

| Format | Magic Bytes |
|--------|-------------|
| PDF    | `%PDF` at offset 0 |
| PNG    | `\x89PNG\r\n\x1a\n` at offset 0 |
| JPEG   | `\xff\xd8\xff` at offset 0 |
| WebP   | `RIFF` at 0 + `WEBP` at 8 |
| HEIC   | `ftyp` at offset 4 |

Files whose actual magic bytes do not match the declared content-type are rejected with HTTP 400.

---

### HIGH-01: WhatsApp Webhook Signature Bypass (Fail-Open)
**Severity:** HIGH
**File:** `src/api/routes/webhooks.py`

**Issue:**
When `WHATSAPP_WEBHOOK_SECRET` was not configured, `_verify_whatsapp_signature()` returned `True` and logged only a warning. This meant:
- Any attacker could send fake WhatsApp messages to the system.
- The AI agents would process untrusted input as if it came from real users.
- The webhook verification endpoint also accepted any token when the secret was not set.

**Fix Applied:**
Changed to fail-closed: when no secret is configured, the function logs an **ERROR** and returns `False`, causing the endpoint to return HTTP 403. The verification endpoint similarly raises HTTP 403. Both changes are environment-agnostic — there is no dev-mode bypass.

---

### HIGH-02: Admin Privilege Escalation — Missing Role Validation
**Severity:** HIGH
**File:** `src/api/routes/admin.py`

**Issue:**
`AdminUserCreate.role` and `AdminUserUpdate.role` accepted any string, including `super_admin`. Any user with `admin` or `buildings_manager` role could:
1. Create a new `super_admin` account.
2. Promote any existing user to `super_admin`.

This breaks the privilege separation between `admin` and `super_admin`.

**Fix Applied:**
1. Added `model_validator` to `AdminUserCreate` and `AdminUserUpdate` to validate that `role` is a known value (`resident`, `contractor`, `admin`, `buildings_manager`, `super_admin`).
2. Added a runtime check in `update_user` and `create_admin_user` endpoints: only `super_admin` callers can assign the `super_admin` role.

---

### MEDIUM-01: Authorization Header Exposed via CORS `expose_headers`
**Severity:** MEDIUM
**File:** `src/api/main.py`

**Issue:**
```python
expose_headers=["Authorization"]
```
This CORS setting instructed browsers to expose the `Authorization` response header to JavaScript. If an XSS vulnerability exists anywhere, the attacker's script could read the bearer token from XHR/fetch responses and exfiltrate it.

**Fix Applied:**
Changed to `expose_headers=[]`. The frontend reads tokens from the JSON response body (not headers), so this has no functional impact.

---

### MEDIUM-02: No Rate Limiting on File Upload Endpoints
**Severity:** MEDIUM
**File:** `src/api/routes/uploads.py`

**Issue:**
The `/uploads/architecture`, `/uploads/contractor-docs`, and `/uploads/avatar` endpoints had no rate limiting. An attacker (authenticated) could:
- Exhaust storage quotas by repeatedly uploading 20 MB files.
- Generate high I/O load against the storage backend.
- Create DoS conditions for other users.

**Fix Applied:**
Added `_check_upload_rate_limit()` called at the top of each upload endpoint: **10 uploads per 60 seconds per user**, backed by the existing Redis rate limiter. Returns HTTP 429 with `Retry-After: 60` header when exceeded. Gracefully degrades when Redis is unavailable.

---

## Additional Findings — All Fixed in Second Pass

### MEDIUM-03: Access Tokens Not Revocable ✅ Fixed
**Severity:** MEDIUM → Fixed
**Files:** `src/models/user.py`, `src/databases/redis_client.py`, `src/api/middleware/auth.py`, `src/api/routes/auth.py`

**Issue:** JWT access tokens (30-minute TTL) were stateless — once issued, they could not be individually revoked.

**Fix Applied:**
1. Added `jti` (UUID) claim to every access token via `create_access_token()`.
2. Added to `TokenPayload` model: `jti: str | None = None`.
3. Added `add_token_to_denylist(jti, ttl)` and `is_token_denylisted(jti)` to `RedisClient` — stored with TTL equal to the token's remaining lifetime so the denylist stays small.
4. `get_current_user()` checks the denylist on every request (fails open if Redis is unavailable, with warning log).
5. `get_token_jti()` dependency extracts the JTI without a DB lookup — used by logout and password change.
6. `logout` and `change_password` now add the current access token's JTI to the denylist, immediately invalidating it.

---

### MEDIUM-04: Refresh Token Rotation Not Atomic ✅ Fixed
**Severity:** MEDIUM → Fixed
**Files:** `src/databases/redis_client.py`, `src/api/routes/auth.py`

**Issue:** Two concurrent refresh requests could both succeed before the stored token was updated, duplicating a session.

**Fix Applied:**
Added `_REFRESH_TOKEN_SWAP_SCRIPT` — a Redis Lua script that atomically reads the stored token, validates it matches the submitted one, and replaces it with the new token in a single round-trip. Returns `1` (success), `0` (expired), or `-1` (mismatch). The `refresh_token` endpoint now calls `atomic_refresh_token_swap()`, returning 401 on mismatch or expiry.

---

### MEDIUM-05: CSP Allows `unsafe-inline` for Styles ✅ Fixed
**Severity:** LOW-MEDIUM → Fixed
**File:** `src/api/middleware/security.py`

**Issue:** `style-src 'self' 'unsafe-inline'` in the production CSP enabled CSS injection attacks.

**Fix Applied:** Removed `'unsafe-inline'` — production CSP is now `style-src 'self'`. Note: the Swagger UI (`/docs`) uses inline styles and will be visually broken under this CSP. Disable Swagger in production (`docs_url=None, redoc_url=None`) or allow inline styles only at the `/docs` path via a reverse-proxy CSP override.

---

### LOW-01: API Key Comparison Not Timing-Safe ✅ Fixed
**Severity:** LOW → Fixed
**File:** `src/api/middleware/auth.py`

**Issue:** `if api_key not in settings.API_KEYS` short-circuits and leaks timing information.

**Fix Applied:** Replaced with `any(hmac.compare_digest(api_key, k) for k in settings.API_KEYS)`. Also added `import hmac` to the module.

---

### LOW-02: Brute-Force Lockout Permanent DB Lock ✅ Fixed
**Severity:** LOW → Fixed
**Files:** `src/databases/redis_client.py`, `src/api/routes/auth.py`

**Issue:** After 5 failed logins, `is_active=False` was written to the database permanently, requiring admin intervention to unlock. No self-service recovery existed.

**Fix Applied:**
1. Added `set_temporary_lockout(user_id, seconds=900)`, `is_temporarily_locked(user_id)` (returns remaining TTL), and `clear_temporary_lockout(user_id)` to `RedisClient`.
2. Login flow now: checks temporary lockout first → returns 423 + `Retry-After` header if locked → on 5 failures, sets 15-minute Redis lockout and clears the failure counter (no DB change).
3. Successful login clears both the failure counter and any temporary lockout.
4. Admin-set `is_active=False` (via `/admin/users/{id}/suspend`) still works as permanent lock.

---

### LOW-03: `/api/v1/health/db` Leaks Infrastructure Info ✅ Fixed
**Severity:** LOW → Fixed
**File:** `src/api/main.py`

**Issue:** Endpoint exposed DB pool size and backend type without authentication.

**Fix Applied:** Added `Depends(verify_api_key)` — endpoint now requires a valid `X-API-Key` header, same as the Prometheus metrics endpoint.

---

### LOW-04: WhatsApp Phone Numbers Not Sanitized ✅ Fixed
**Severity:** LOW → Fixed
**File:** `src/api/routes/webhooks.py`

**Issue:** Phone numbers from the WhatsApp payload were used as user identifiers without format validation, creating an injection risk.

**Fix Applied:** Added `_E164_PATTERN = re.compile(r"^\d{7,15}$")`. Phone numbers that don't match are logged as a warning and the webhook request is silently ignored (`status: ignored`).

---

### LOW-05: X-Request-ID Not Validated (Log Injection Risk) ✅ Fixed
**Severity:** LOW → Fixed
**File:** `src/api/middleware/logging.py`

**Issue:** A crafted `X-Request-ID` header containing newlines or control characters could inject fake log entries.

**Fix Applied:** Added `_REQUEST_ID_RE = re.compile(r"^[a-zA-Z0-9\-]{1,64}$")`. Headers that don't match are discarded and a fresh UUID is generated. The pattern is also a superset of UUID v4, so well-behaved clients are unaffected.

---

## What's Already Well Implemented

| Category | Status | Notes |
|----------|--------|-------|
| Password hashing | ✅ Secure | bcrypt with salt |
| JWT validation | ✅ Secure | Algorithm pinning, expiry, type check |
| Refresh token storage | ✅ Secure | Redis-backed rotation |
| Cookie security | ✅ Secure | HttpOnly, Secure (prod), SameSite=Lax |
| Account lockout | ✅ Hardened | 5 failures → 15-min Redis lockout (auto-expiry, self-recovery) |
| Access token revocation | ✅ Added | JTI denylist in Redis; logout/pw-change revoke immediately |
| Refresh token rotation | ✅ Hardened | Atomic Lua swap — race-condition-free |
| IP-based auth rate limiting | ✅ Implemented | 20 req/min on auth endpoints |
| RBAC | ✅ Implemented | 5 roles, dependency injection |
| SQL injection prevention | ✅ Implemented | Parameterized queries, column name regex |
| XSS prevention | ✅ Implemented | Input sanitization, CSP headers |
| CORS | ✅ Configured | Allowlist-based, no wildcard |
| Security headers | ✅ Implemented | HSTS, X-Frame-Options, X-Content-Type-Options, CSP |
| Docker security | ✅ Implemented | Non-root user, multi-stage build |
| Secret scanning | ✅ Implemented | GitLeaks in pre-commit |
| Dependency scanning | ✅ Implemented | Trivy |
| HMAC webhook verification | ✅ Implemented | WhatsApp HMAC-SHA256 (now fail-closed) |
| Audit logging | ✅ Implemented | All admin actions logged with IP |
| PII masking | ✅ Implemented | Logging middleware redacts sensitive fields |
| Error message disclosure | ✅ Handled | `str(exc)` only in development mode |
| GDPR right-to-erasure | ✅ Implemented | DELETE /auth/me endpoint |

---

## OWASP API Top 10 (2023) Coverage

| ID | Name | Status |
|----|------|--------|
| API1 | Broken Object Level Authorization (BOLA) | ✅ Mitigated — owner checks on file/offer resources |
| API2 | Broken Authentication | ✅ Mitigated — JWT, bcrypt, lockout, refresh rotation |
| API3 | Broken Object Property Level Auth (Mass Assignment) | ✅ Mitigated — Pydantic models with `exclude_unset` |
| API4 | Unrestricted Resource Consumption | ✅ Fixed — upload rate limiting + temporary brute-force lockout |
| API5 | Broken Function Level Authorization | ✅ Fixed — super_admin escalation guard, /health/db protected |
| API6 | Unrestricted Access to Sensitive Business Flows | ✅ Mitigated — agent modes (recommend/gated), human approval workflows |
| API7 | Server-Side Request Forgery (SSRF) | ✅ Low risk — outbound calls only to known APIs (Meta, Stripe) |
| API8 | Security Misconfiguration | ✅ Fixed — webhook fail-closed, CORS, CSP, prod validators |
| API9 | Improper Inventory Management | ✅ Mitigated — 17 documented route modules, OpenAPI spec |
| API10 | Unsafe Consumption of APIs | ✅ Fixed — WhatsApp phone E.164 validation added |

---

*Generated by security audit using "Web Application Security for AI Agents" framework.*
