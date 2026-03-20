# Security Audit Report — Groupio Multi-Agent System

**Date:** 2026-03-20
**Scope:** Full backend (FastAPI) + middleware + storage service
**Reference:** "Web Application Security for AI Agents" — OWASP API Top 10 (2023), input/output protection, authentication, infrastructure

---

## Executive Summary

The Groupio codebase has a solid security foundation: JWT authentication, bcrypt password hashing, account lockout, RBAC, structured logging, Docker non-root users, GitLeaks secret scanning, and security headers middleware. However, five **Critical/High** issues were found and fixed in this audit. Additional **Medium/Low** findings are documented below as recommendations.

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

## Additional Findings (Recommendations — Not Fixed)

### MEDIUM-03: Access Tokens Not Revocable
**Severity:** MEDIUM
**File:** `src/api/middleware/auth.py`

JWT access tokens (30-minute TTL) are stateless — once issued, they cannot be individually revoked. Only refresh tokens are stored in Redis and can be invalidated. If an access token is stolen (e.g. via a network-layer attack), it remains valid for up to 30 minutes.

**Recommendation:** Implement a Redis-based token denylist for access tokens, checked in `get_current_user()`. Store revoked token JTIs (JWT ID claim) with TTL equal to the remaining token lifetime. Add `jti` claim to `create_access_token()`.

---

### MEDIUM-04: Refresh Token Rotation is Not Atomic
**Severity:** MEDIUM
**File:** `src/api/routes/auth.py` — `refresh_token` endpoint

The sequence:
1. Validate old refresh token
2. Generate new tokens
3. Update Redis with new refresh token
4. Return new tokens

...is not atomic. If two concurrent requests use the same refresh token before step 3 completes (race condition), both could succeed, effectively duplicating the session.

**Recommendation:** Use a Redis Lua script or `SET NX` + `DEL` pattern to atomically swap the old token for the new one, rejecting the second request.

---

### MEDIUM-05: CSP Allows `unsafe-inline` for Styles
**Severity:** LOW-MEDIUM
**File:** `src/api/middleware/security.py`

```python
"style-src 'self' 'unsafe-inline';"
```

`unsafe-inline` styles can be abused for CSS injection attacks (exfiltrating data via CSS selectors). Since this is a JSON API server (not serving HTML), this CSP header affects only error pages or documentation UI (Swagger/OpenAPI).

**Recommendation:** If the Swagger UI is disabled in production, set `style-src 'self'` without `unsafe-inline`. If Swagger is kept, use CSP nonces: `style-src 'self' 'nonce-{random}'`.

---

### LOW-01: API Key Comparison Not Timing-Safe
**Severity:** LOW
**File:** `src/api/middleware/auth.py` — `verify_api_key()`

```python
if api_key not in settings.API_KEYS:
```

The `in` operator on a list is not timing-safe (short-circuits on first non-match). An attacker doing very precise timing measurements could enumerate valid API key prefixes.

**Recommendation:**
```python
import hmac
valid = any(hmac.compare_digest(api_key, k) for k in settings.API_KEYS)
```

---

### LOW-02: Brute-Force Lockout Relies on Database for Unlock
**Severity:** LOW
**File:** `src/api/routes/auth.py`

After 5 failed login attempts, `is_active` is set to `False` in the database. The account can only be unlocked by an admin calling `activate_user`. There is no self-service unlock (e.g., via email link) and no automatic time-based unlock.

**Recommendation:** Consider a time-limited Redis-based lockout (e.g., 15 minutes) before permanently locking the account, allowing legitimate users to self-recover.

---

### LOW-03: `/api/v1/health/db` Leaks Internal Infrastructure Info
**Severity:** LOW
**File:** `src/api/main.py`

The `GET /api/v1/health/db` endpoint returns pool statistics (`pool_size`, `free_connections`, `used_connections`) and the database backend type (`asyncpg` or `supabase`). This is unauthenticated — any caller can probe it.

**Recommendation:** Protect with API key auth (`Depends(verify_api_key)`) or restrict to internal network access only.

---

### LOW-04: WhatsApp Webhook Processes Phone Numbers as User IDs Without Sanitization
**Severity:** LOW
**File:** `src/api/routes/webhooks.py`

```python
user_id=message["phone"]  # phone number from untrusted WhatsApp payload
```

The phone number from the webhook payload is used as `user_id` in the orchestrator without format validation. If the orchestrator or downstream services use this value unsafely, it could be a vector for injection.

**Recommendation:** Validate the phone number format (E.164 regex) before processing.

---

### LOW-05: Missing `X-Request-ID` Propagation for Audit Correlation
**Severity:** LOW (Observability/Audit)

Request IDs are accepted in the `allow_headers` CORS list but are not extracted, validated, or propagated to logs. This makes correlating distributed traces difficult.

**Recommendation:** In `RequestLoggingMiddleware`, extract `X-Request-ID` header, validate it as a UUID, generate one if absent, and add it to the structured log context and response headers.

---

## What's Already Well Implemented

| Category | Status | Notes |
|----------|--------|-------|
| Password hashing | ✅ Secure | bcrypt with salt |
| JWT validation | ✅ Secure | Algorithm pinning, expiry, type check |
| Refresh token storage | ✅ Secure | Redis-backed rotation |
| Cookie security | ✅ Secure | HttpOnly, Secure (prod), SameSite=Lax |
| Account lockout | ✅ Implemented | 5 failed attempts → lock |
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
| API4 | Unrestricted Resource Consumption | ⚠️ Partially fixed — upload rate limiting added; no global request size limit |
| API5 | Broken Function Level Authorization | ✅ Fixed — super_admin escalation guard added |
| API6 | Unrestricted Access to Sensitive Business Flows | ✅ Mitigated — agent modes (recommend/gated), human approval workflows |
| API7 | Server-Side Request Forgery (SSRF) | ✅ Low risk — outbound calls only to known APIs (Meta, Stripe) |
| API8 | Security Misconfiguration | ✅ Fixed — webhook fail-closed, CORS expose_headers, prod validators |
| API9 | Improper Inventory Management | ✅ Mitigated — 17 documented route modules, OpenAPI spec |
| API10 | Unsafe Consumption of APIs | ⚠️ Review — WhatsApp payload parsed with basic validation; phone sanitization recommended |

---

*Generated by security audit using "Web Application Security for AI Agents" framework.*
