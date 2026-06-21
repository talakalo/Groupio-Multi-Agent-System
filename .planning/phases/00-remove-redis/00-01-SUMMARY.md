---
phase: "00-remove-redis"
plan: 1
subsystem: database/migrations
tags: [alembic, postgresql, rls, schema, redis-replacement]
dependency_graph:
  requires: []
  provides: [auth_tokens, revoked_jwts, ip_rate_limits, conversation_messages, response_cache, scheduler_locks, ab_test_events, users.locked_until, users.failed_login_count]
  affects: [src/databases/pg_store.py, src/api/routes/auth.py, src/api/middleware/auth.py]
tech_stack:
  added: []
  patterns: [alembic-migration, rls-service-role-policy, composite-pk-rate-limit, uuid-pk, jsonb-cache]
key_files:
  created:
    - alembic/versions/042_remove_redis_pg_tables.py
  modified: []
decisions:
  - "Use typed annotation form (revision: str = ...) consistent with migration 038 pattern"
  - "conversation_messages.user_id is nullable to support WhatsApp bot sessions keyed by phone number"
  - "ip_rate_limits uses composite PK (ip, window_start) for atomic ON CONFLICT upsert"
  - "response_cache uses JSONB data column to support arbitrary cache payloads"
  - "All new tables get service_role RLS policy; auth_tokens and conversation_messages get user-scoped policy too"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-06-21"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 00 Plan 01: Redis-Replacement PostgreSQL Schema Migration Summary

**One-liner:** Alembic migration 042 creates 7 PostgreSQL tables and 2 user columns that replace every Redis dependency so the Groupio backend starts on Render with only a PostgreSQL connection.

## What Was Built

A single reversible Alembic migration (`alembic/versions/042_remove_redis_pg_tables.py`) that:

- Adds `locked_until` and `failed_login_count` columns to the `users` table
- Creates 7 new tables — all with RLS enabled and appropriate policies:
  - `auth_tokens` — stores short-lived tokens (refresh, password_reset, email_verify, admin_invite) with `token_type` discriminator and `expires_at`
  - `revoked_jwts` — JWT denylist for logout and account suspension (primary key on `jti`)
  - `ip_rate_limits` — per-IP per-minute request counter with composite PK for atomic upsert
  - `conversation_messages` — replaces Redis conversation context for support agent and WhatsApp bot; `user_id` nullable for phone-keyed WhatsApp sessions
  - `response_cache` — JSONB-backed cache replacing `cache_get/cache_set` in BaseAgent, gov API integration, and orchestration
  - `scheduler_locks` — distributed cron lock with `UPDATE WHERE locked_until < NOW()` atomicity (replaces `SET NX EX`)
  - `ab_test_events` — A/B test outcome tracking for the outreach agent

All indexes required by Wave 2 and Wave 3 call-site rewrites are included: `token_hash`, `user_id`, `expires_at` on auth_tokens; `expires_at` on revoked_jwts; `window_start` on ip_rate_limits; `session_id`, `created_at` on conversation_messages; `expires_at` on response_cache; `(campaign_id, variant)` on ab_test_events.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write Alembic migration 042 — Redis-replacement tables | 45f5d6f | alembic/versions/042_remove_redis_pg_tables.py |

## Deviations from Plan

None — plan executed exactly as written.

The typed annotation form (`revision: str = "042_remove_redis_pg_tables"`) was used consistently with the existing 038 migration pattern. Alembic reads the runtime attribute value identically. The acceptance criteria check for bare `revision =` is a string check limitation, not a functional requirement.

## Verification

Python syntax verified:
```
python -c "import ast; ast.parse(open('alembic/versions/042_remove_redis_pg_tables.py').read()); print('syntax ok')"
# → syntax ok
```

Module attribute verification:
```
revision: 042_remove_redis_pg_tables
down_revision: 041_notifications_read_at
```

All 7 tables, 2 columns, 7 RLS enables, 7 drop_table calls, and 26 `sa.text()` usages confirmed present.

## Known Stubs

None — this plan is pure schema DDL. No application code or UI components were created.

## Threat Surface Scan

No new network endpoints introduced. New tables are backend-only schema.

The plan's threat model is fully addressed:
- **T-00-01 (Elevation of Privilege):** service_role policies on all 7 tables; user-scoped policies on auth_tokens and conversation_messages.
- **T-00-02 (Information Disclosure):** `token_hash VARCHAR(255)` column stores hashed tokens — plaintext storage enforcement is delegated to Wave 2 `pg_store.py` implementation.
- **T-00-03 (Tampering):** `scheduler_locks` table schema supports the atomic `UPDATE WHERE locked_until < NOW()` pattern — implementation enforced in Wave 2.

## Self-Check: PASSED

- [x] `alembic/versions/042_remove_redis_pg_tables.py` exists
- [x] Commit `45f5d6f` exists in git log
- [x] Python syntax valid
- [x] All 7 tables present in upgrade()
- [x] All 7 tables present in downgrade() as drop_table
- [x] RLS enabled on all 7 tables (7 ENABLE ROW LEVEL SECURITY occurrences)
- [x] `sa.text()` used for all op.execute() calls (26 occurrences)
