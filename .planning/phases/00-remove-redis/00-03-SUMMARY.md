---
phase: "00-remove-redis"
plan: 3
subsystem: api/auth
tags: [auth, redis-removal, pg-store, login-fix, middleware, critical-path]
dependency_graph:
  requires: [PostgresStore, get_pg_store, auth_tokens, revoked_jwts, ip_rate_limits, users.locked_until, users.failed_login_count, response_cache]
  provides: [auth.py-no-redis, middleware-no-redis, main.py-no-redis]
  affects: [src/api/routes/auth.py, src/api/middleware/auth.py, src/api/main.py]
tech_stack:
  added: []
  patterns: [pg-store-drop-in, fail-open-rate-limit, denylist-via-pg-store, no-user-cache]
key_files:
  created:
    - tests/unit/test_login_no_redis.py
  modified:
    - src/api/routes/auth.py
    - src/api/middleware/auth.py
    - src/api/main.py
    - tests/unit/test_route_auth.py
    - tests/unit/test_security_audit_fixes.py
    - tests/unit/test_auth_cookie_samesite.py
    - tests/unit/test_auth_redis_fallback.py
    - tests/unit/test_auth_rate_limit.py
    - tests/unit/test_error_scenarios.py
    - tests/unit/test_governance_patch2_unit.py
decisions:
  - "login_json: removed try/except Redis wrappers — pg_store methods don't need them (no connection error at startup)"
  - "middleware/auth.py: _get_cached_user and _set_cached_user deleted; invalidate_cached_user is now a no-op"
  - "main.py: pg_store.close() added to shutdown sequence; _is_db_connection_error simplified (no Redis branch)"
  - "main.py health check: redis key replaced with pg_store key — reflects actual backing service"
  - "test_auth_redis_fallback.py: rewritten to test the no-op cache removal rather than deleted functions"
metrics:
  duration: "~20 minutes"
  completed_date: "2026-06-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 10
---

# Phase 00 Plan 03: Auth Routes Redis Replacement — CRITICAL PATH Summary

**One-liner:** Replace every `get_redis_client()` call in auth.py, middleware/auth.py, and main.py with `get_pg_store()`, fixing the Render HTTP 500 on POST /api/v1/auth/login/json.

## What Was Built

### Task 1: auth.py — All Redis calls replaced (commit `7ad6221`)

**The critical fix** in `login_json()`: removed the `try/except` wrappers around Redis calls (is_temporarily_locked, increment_login_failures, set_temporary_lockout). These wrappers existed to handle Redis being unavailable. With `get_pg_store()`, the same methods now use Postgres — connection errors only happen if Postgres itself is down, in which case the whole API is unavailable.

Full list of functions updated in `src/api/routes/auth.py`:
- `check_auth_rate_limit` — `store.check_ip_rate_limit`
- `signup` — `store.set` for email_verify and refresh_token keys
- `register` — `store.set` for email_verify key
- `login` (form-data) — `store.is_temporarily_locked`, `store.increment_login_failures`, `store.set_temporary_lockout`, `store.set/clear_*`
- `login_json` — same as login (CRITICAL FIX: no more Redis try/except wrappers)
- `refresh_token` — `store.get/set` for refresh_token key
- `logout` — `store.delete` + `store.add_token_to_denylist`
- `change_password` — `store.delete` refresh_token
- `request_password_reset` / `confirm_password_reset` — `store.set/get/delete` for password_reset key
- `verify_email` / `resend_verification*` — `store.set/delete` for email_verify key
- `delete_account` — `store.delete` refresh_token

### Task 2: middleware/auth.py and main.py (commit `7133828`)

**middleware/auth.py changes:**
- `_get_cached_user()` — deleted entirely (no more Redis user cache)
- `_set_cached_user()` — deleted entirely
- `invalidate_cached_user()` — converted to no-op (`pass`). All callers in auth.py still call it; it simply does nothing now.
- `get_current_user()` denylist check — replaced `from src.databases.redis_client import get_redis_client` + `redis.is_token_denylisted` with `from src.databases.pg_store import get_pg_store` + `store.is_token_denylisted`. Fail-open behavior preserved.

**main.py changes:**
- Removed `from src.databases.redis_client import get_redis_client` top-level import
- Shutdown sequence: removed `redis.close()` block; added `pg_store.close()` block
- `_is_db_connection_error()`: removed Redis import and check; added comment explaining Redis errors are no longer possible
- `_check_message_rate_limit()`: replaced `redis.check_rate_limit` with `store.check_rate_limit`; fail-open behavior preserved
- `/api/v1/health` endpoint: replaced `services["redis"]` check with `services["pg_store"]`

### Task 3: Test — login/json returns 401 not 500 (commit `514ce31`)

Created `tests/unit/test_login_no_redis.py` with two tests:
- `test_login_json_user_not_found_returns_401`: mocks DB returning None, asserts 401 with "Invalid credentials", confirms no Redis text in response
- `test_login_json_missing_body_returns_422`: sends empty JSON body, asserts 422

### Deviation: Test suite updates (commit `780392f`)

All pre-existing tests that patched `src.api.routes.auth.get_redis_client` failed after the replacement. These were auto-fixed (Rule 1: tests are part of correctness):

| File | Change |
|------|--------|
| `test_route_auth.py` | `get_redis_client` → `get_pg_store` (all occurrences) |
| `test_security_audit_fixes.py` | `get_redis_client` → `get_pg_store` in auth patches |
| `test_auth_cookie_samesite.py` | `monkeypatch.setattr` updated to `get_pg_store` |
| `test_auth_redis_fallback.py` | Rewritten — deleted functions replaced with no-op tests |
| `test_auth_rate_limit.py` | `get_redis_client` → `get_pg_store` in check_auth_rate_limit test |
| `test_error_scenarios.py` | `get_redis_client` → `get_pg_store` in login 503 test |
| `test_governance_patch2_unit.py` | Denylist patches updated to `src.databases.pg_store.get_pg_store` (lazy import path) |

Final test result: **1633 passed, 0 failed**.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace all Redis calls in auth.py with get_pg_store() | 7ad6221 | src/api/routes/auth.py |
| 2 | Replace Redis in middleware/auth.py and main.py | 7133828 | src/api/middleware/auth.py, src/api/main.py |
| 3 | Add pytest test confirming login/json returns 401 not 500 | 514ce31 | tests/unit/test_login_no_redis.py |
| dev | Update all test patches from get_redis_client to get_pg_store | 780392f | 7 test files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing tests referenced deleted `get_redis_client` attribute**
- **Found during:** Task 3 verification (pytest run)
- **Issue:** 50 unit tests failed with `AttributeError: module 'src.api.routes.auth' does not have attribute 'get_redis_client'` because auth.py no longer imports it
- **Fix:** Updated patch targets from `get_redis_client` to `get_pg_store` in all 7 affected test files; rewrote `test_auth_redis_fallback.py` because `_get_cached_user`/`_set_cached_user` were deleted
- **Files modified:** 7 test files
- **Commit:** 780392f

**2. [Rule 2 - Missing functionality] `login_json` had unnecessary try/except Redis wrappers**
- **Found during:** Task 1 implementation
- **Issue:** The old code wrapped each Redis call in a `try/except` that would skip the Redis call on error. These are unnecessary with pg_store (Postgres errors fail the whole request appropriately).
- **Fix:** Removed the redundant try/except wrappers in `login_json` — simplifies the code and makes failure modes more transparent.

## Known Stubs

None. All pg_store calls are wired to real implementations from plan 00-02.

## Threat Surface Scan

No new network endpoints introduced. This plan only replaces the backing store for existing auth endpoints — no new attack surface created.

Threat model dispositions implemented:
- **T-00-07 (Repudiation — user cache removal):** Accepted. Direct DB lookup on every `get_current_user` call; cache was premature optimisation.
- **T-00-08 (Spoofing — denylist fail-open):** Accepted. Denylist check still fails-open; if Postgres is unreachable, whole API is down anyway.
- **T-00-09 (DoS — rate limit via Postgres):** Mitigated. `check_ip_rate_limit` and `check_rate_limit` fail-open on any DB error.

## Self-Check: PASSED

- [x] `src/api/routes/auth.py` exists
- [x] `src/api/middleware/auth.py` exists  
- [x] `src/api/main.py` exists
- [x] `tests/unit/test_login_no_redis.py` exists
- [x] Commit `7ad6221` exists in git log
- [x] Commit `7133828` exists in git log
- [x] Commit `514ce31` exists in git log
- [x] Commit `780392f` exists in git log
- [x] `get_redis_client` not in src/api/routes/auth.py
- [x] `get_redis_client` not in src/api/middleware/auth.py
- [x] `get_redis_client` not in src/api/main.py
- [x] `get_pg_store` present in src/api/routes/auth.py
- [x] `get_pg_store` referenced in src/api/middleware/auth.py (via lazy import)
- [x] `redis.close()` not in main.py lifespan shutdown
- [x] 1633 unit tests pass (0 failures)
