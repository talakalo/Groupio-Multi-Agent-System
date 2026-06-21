---
phase: "00-remove-redis"
plan: 2
subsystem: database/pg_store
tags: [postgres, asyncpg, supabase, redis-replacement, rate-limiting, jwt-denylist, scheduler-lock, pg-notify]
dependency_graph:
  requires: [auth_tokens, revoked_jwts, ip_rate_limits, conversation_messages, response_cache, scheduler_locks, ab_test_events, users.locked_until, users.failed_login_count]
  provides: [PostgresStore, get_pg_store]
  affects: [src/api/routes/auth.py, src/api/middleware/auth.py, src/api/routes/offers.py, src/api/routes/contractors.py, src/api/routes/admin.py, src/api/routes/uploads.py, src/agents/base.py, src/agents/support.py, src/agents/outreach.py, src/orchestration/graph.py, src/workers/scheduler.py, src/services/whatsapp_bot.py, src/integrations/gov/cache.py]
tech_stack:
  added: []
  patterns: [dual-path-supabase-asyncpg, fail-open-rate-limit, atomic-on-conflict-upsert, sha256-token-hash, pg-notify-publish, scheduler-lock-update-where]
key_files:
  created:
    - src/databases/pg_store.py
  modified: []
decisions:
  - "refresh_token keys stored in response_cache as plaintext (not hashed) to preserve direct string comparison in auth.py"
  - "email_verify/password_reset/invite_token keys routed to auth_tokens with SHA-256 hash of token as token_hash"
  - "check_rate_limit reuses ip_rate_limits table with user_id as the 'ip' column (VARCHAR(45) fits UUIDs)"
  - "acquire_scheduler_lock: INSERT ON CONFLICT DO NOTHING to ensure row exists, then atomic UPDATE WHERE locked_until < NOW()"
  - "publish() is fire-and-forget: never raises, logs and skips on supabase path"
  - "is_temporarily_locked returns int (remaining seconds) using GREATEST(0, EXTRACT(EPOCH...)) on asyncpg path"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-06-21"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 00 Plan 02: PostgresStore — Postgres Drop-in for RedisClient Summary

**One-liner:** PostgresStore class with 24 methods and a dual Supabase/asyncpg path replaces every RedisClient call site using the 7 tables created in migration 042, with no Redis import anywhere.

## What Was Built

`src/databases/pg_store.py` — a 470-line module implementing `PostgresStore`, a drop-in replacement for `RedisClient`. The module exports `get_pg_store()` as a module-level singleton factory mirroring `get_redis_client()`.

### Key design decisions implemented

**Key routing for `set/get/delete`:**
- `email_verify:{token}`, `password_reset:{token}`, `invite_token:{token}` — routed to `auth_tokens` table with SHA-256 hash of the token stored in `token_hash`; `get()` returns the `user_id` from the matched row
- `refresh_token:{user_id}` and all other keys — routed to `response_cache` as `{"v": value}` JSON wrapper so the raw string is preserved for direct comparison in `auth.py`

**Rate limiting (fail-open):**
- Both `check_rate_limit` and `check_ip_rate_limit` use a single-round-trip `INSERT ... ON CONFLICT DO UPDATE RETURNING request_count`
- All exceptions caught at the outer level — return `True` (allow) on any DB error (threat model T-00-06 accepted disposition)

**Login failures and lockout — `users` table columns:**
- `increment_login_failures` → `UPDATE users SET failed_login_count = failed_login_count + 1 RETURNING`
- `set_temporary_lockout` → `UPDATE users SET locked_until = NOW() + $1 * INTERVAL '1 second'`
- `is_temporarily_locked` → `GREATEST(0, EXTRACT(EPOCH FROM (locked_until - NOW()))::int)` — returns `int`
- `clear_temporary_lockout` → `UPDATE users SET locked_until = NULL`

**JWT denylist:**
- `add_token_to_denylist` → `INSERT INTO revoked_jwts ... ON CONFLICT DO NOTHING`
- `is_token_denylisted` → `SELECT EXISTS(SELECT 1 FROM revoked_jwts WHERE jti=$1 AND expires_at > NOW())`

**Conversation context:**
- `get_conversation_context` queries `conversation_messages WHERE session_id=$1 ORDER BY created_at DESC LIMIT 10` and reverses result to chronological order
- `add_conversation_message` detects UUID vs phone string for the nullable `user_id` FK column

**Generic cache:**
- `cache_get/cache_set/cache_delete` operate on `response_cache` table with JSONB `data` column
- `cache_get` catches all exceptions and returns `None` (fail-open)
- `cache_set` uses `INSERT ... ON CONFLICT DO UPDATE`

**Publish (pg_notify):**
- asyncpg path: `SELECT pg_notify($1, $2)` via connection pool
- Supabase path: logged and skipped (PostgREST does not expose pg_notify)
- Never raises (fire-and-forget)

**Scheduler lock (atomic):**
- `acquire_scheduler_lock`: first INSERT ON CONFLICT DO NOTHING to ensure row exists, then `UPDATE WHERE locked_until IS NULL OR locked_until < NOW()` — rowcount check via status string `"UPDATE 1"`
- `get_scheduler_last_run` and `release_scheduler_lock` provided for scheduler.py call sites

**A/B tests:**
- `ab_test_track` → `INSERT INTO ab_test_events`
- `ab_test_get_results` → `SELECT outcome, COUNT(*) GROUP BY outcome`; Supabase path fetches rows and aggregates in Python

**Connection management:**
- Exact mirror of `postgres.py` `_use_supabase_client()` — checks `SUPABASE_URL`, `SUPABASE_KEY`, `USE_LOCAL_POSTGRES`
- Lazy initialization of Supabase client or asyncpg pool
- `close()` closes asyncpg pool gracefully; no-op on Supabase path

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement PostgresStore class with all method mappings | 4057371 | src/databases/pg_store.py |

## Deviations from Plan

None — plan executed exactly as written.

The plan noted that for the Supabase path of `check_rate_limit`, PostgREST cannot express `ON CONFLICT DO UPDATE` natively. The implementation follows the plan's guidance: logs a debug message and falls through to the asyncpg path for correctness. This is documented in the method comment.

## Verification

Automated checks passed:

```
python -c "
import ast
src = open('src/databases/pg_store.py').read()
ast.parse(src)
assert 'class PostgresStore' in src
assert 'get_pg_store' in src
assert 'redis' not in src.lower() or 'no redis' in src.lower()
assert 'is_temporarily_locked' in src
assert 'add_token_to_denylist' in src
assert 'acquire_scheduler_lock' in src
print('pg_store.py OK')
"
# → pg_store.py OK
```

All 24 required methods verified present. No redis/aioredis/tenacity imports. pg_notify present. fail-open pattern confirmed in check_ip_rate_limit.

## Known Stubs

None — all methods are fully implemented. The Supabase path for `check_rate_limit` delegates to the asyncpg pool for the ON CONFLICT upsert (documented in code comment) rather than being a stub.

## Threat Surface Scan

No new network endpoints introduced. `pg_store.py` is a pure database abstraction layer.

Threat model dispositions from plan fully implemented:
- **T-00-04 (Spoofing — refresh_token plaintext):** Accepted. `refresh_token:*` keys stored in `response_cache` as plaintext inside a JSON wrapper so `auth.py` can do direct string comparison. Protected by httponly cookie + JWT expiry.
- **T-00-05 (Information Disclosure — email_verify/password_reset/invite_token):** Mitigated. SHA-256 hash of token stored in `auth_tokens.token_hash`; plaintext token never persisted.
- **T-00-06 (DoS — rate limit fail-open):** Accepted. `check_rate_limit` and `check_ip_rate_limit` catch all exceptions and return `True` (allow). Intentional — degrades gracefully.
- **T-00-SC (no new package installs):** Confirmed. No `pip install` or new entries in `pyproject.toml`.

## Self-Check: PASSED

- [x] `src/databases/pg_store.py` exists
- [x] Commit `4057371` exists in git log
- [x] Python syntax valid (ast.parse passes)
- [x] `class PostgresStore` defined
- [x] `get_pg_store()` singleton factory defined
- [x] No import of redis, aioredis, or tenacity
- [x] All 24 methods present
- [x] `is_temporarily_locked` returns int (max(0, ...))
- [x] `check_ip_rate_limit` has `except Exception:` fail-open
- [x] `publish` uses `pg_notify` in asyncpg path
- [x] `acquire_scheduler_lock` uses atomic UPDATE WHERE locked_until < NOW()
- [x] Dual-path (supabase + asyncpg) in all methods
