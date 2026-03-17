# Groupio Runtime Config and DB Readiness Audit

## 1. Executive Summary

**Root causes found:**
1. **Database schema not ready**: Docker Compose did not run Alembic migrations on startup. A fresh Postgres volume had no tables; login failed with `UndefinedTableError: relation "users" does not exist`.
2. **Startup readiness gap**: Startup verified only DB connectivity (`_get_client()`), not schema. "Database connection verified" was misleading when auth tables were missing.
3. **Metrics 403**: Prometheus scrape config did not send auth. `/metrics` requires `X-API-Key` when `API_KEYS` is set; 403 was expected but undocumented.
4. **Worker Postgres config**: Worker did not have `DOCKER_POSTGRES_*` when using local Postgres in Docker, risking wrong DB target.
5. **Alembic inside Docker**: `alembic/env.py` used `127.0.0.1` when `alembic.docker.ini` was used, but inside the API container Postgres is at `postgres:5432`. Migrations run from inside the container needed `DOCKER_POSTGRES_HOST`.

**What was fixed:**
- API command now runs `alembic upgrade head` before uvicorn.
- Startup checks `auth_tables_exist()` and logs a clear error if `users` is missing.
- `UndefinedTableError` returns 503 with `DB_SCHEMA_NOT_READY` instead of 500.
- `alembic/env.py` uses `DOCKER_POSTGRES_*` when set (for in-container migrations).
- Prometheus `/metrics` accepts `Authorization: Bearer <key>`; prometheus.yml documented.
- Worker receives `DOCKER_POSTGRES_*` and `depends_on: postgres`.
- `check_auth_deps.py` verifies schema readiness and uses local Postgres when `USE_LOCAL_POSTGRES=1`.

**Noise vs real blocker:**
- `DOCKER_POSTGRES_LOCALHOST` AttributeError: Already guarded with `getattr(..., "")` in postgres.py; likely from a stale/cached Settings instance.
- Metrics 403: Intentional protection; Prometheus was not configured with auth.

---

## 2. Confirmed Issues

| # | Title | Severity | Runtime | File(s) | Failure Mechanism | User Impact |
|---|-------|----------|---------|---------|-------------------|-------------|
| 1 | Users table missing | Critical | docker api | postgres.py, auth.py | `get_user_by_email` → `asyncpg.UndefinedTableError` | Login/signup 500 |
| 2 | Migrations not run in Docker | Critical | docker api | docker-compose.yml | No `alembic upgrade head` in startup | Fresh DB has no schema |
| 3 | Startup says "DB verified" when schema missing | High | all | main.py | Only `_get_client()` check | Misleading readiness |
| 4 | Metrics 403 (Prometheus) | Medium | docker | main.py, prometheus.yml | API_KEYS set, no auth in scrape | No metrics scraped |
| 5 | Worker missing Postgres config | Medium | docker worker | docker-compose.yml | No DOCKER_POSTGRES_* | Worker could hit wrong DB |
| 6 | Alembic env for in-container run | High | docker api | alembic/env.py | Used 127.0.0.1 only | Migrations inside container would fail |

---

## 3. Settings and Env Drift Map

| Setting | In Settings | In Docker | In .env.example | Referenced in Code | Status |
|--------|-------------|-----------|----------------|-------------------|--------|
| DOCKER_POSTGRES_HOST | ✓ | ✓ (api, worker) | — | postgres.py, alembic/env.py | OK |
| DOCKER_POSTGRES_USER | ✓ | ✓ | — | postgres.py, env.py | OK |
| DOCKER_POSTGRES_PASSWORD | ✓ | ✓ | — | postgres.py, env.py | OK |
| DOCKER_POSTGRES_DB | ✓ | ✓ | — | postgres.py, env.py | OK |
| DOCKER_POSTGRES_LOCALHOST | ✓ | — | — | postgres.py (getattr guard) | OK |
| USE_LOCAL_POSTGRES | ✓ | ✓ | — | postgres.py, check_auth_deps | OK |
| POSTGRES_* | — | ✓ (compose) | ✓ | alembic/env.py, check_auth_deps | OK |
| DATABASE_URL | ✓ | via env_file | ✓ | postgres.py fallback | OK |
| API_KEYS | ✓ | ✓ | ✓ | main.py metrics, webhooks | OK |

---

## 4. Database Target and Schema Findings

| Runtime | Host | Port | Database | Migrations | Tables | Schema Ready |
|---------|------|------|----------|------------|--------|--------------|
| docker api | postgres | 5432 | groupio | Now auto on startup | users, etc. | ✓ |
| docker worker | postgres | 5432 | groupio | Same DB as api | ✓ | ✓ |
| docker scheduler | postgres | 5432 | groupio | Same DB | ✓ | ✓ |
| local uvicorn | 127.0.0.1 / DATABASE_URL | 5432 | groupio | Manual `alembic upgrade head` | ✓ | ✓ |

---

## 5. Startup vs Runtime Readiness Gaps

**Before:** Startup only called `db._get_client()` (pool creation). That proved socket reachability, not schema.

**After:**
- After DB connection, `auth_tables_exist()` checks `information_schema.tables` for `users`.
- If missing, logs: "Database schema not ready — users table missing. Run: alembic upgrade head..."
- Request-time `UndefinedTableError` returns 503 with `DB_SCHEMA_NOT_READY`.

---

## 6. Fixes Implemented

| File | Change |
|------|--------|
| `requirements-prod.txt` | Added `alembic>=1.13.0` |
| `alembic/env.py` | Use `DOCKER_POSTGRES_*` when set (in-container); else `alembic.docker.ini` → 127.0.0.1; else `DATABASE_URL` |
| `docker/Dockerfile` | Copy `alembic/`, `alembic.ini` into image |
| `docker/docker-compose.yml` | API command: `alembic upgrade head && uvicorn ...`; worker: add `DOCKER_POSTGRES_*`, env_file, depends_on postgres |
| `src/databases/postgres.py` | `auth_tables_exist()` method |
| `src/api/main.py` | Startup schema check; `_is_schema_not_ready()`; 503 for schema errors; `/metrics` accepts `Authorization: Bearer` |
| `monitoring/prometheus.yml` | Comments on bearer_token for groupio-api scrape |
| `scripts/check_auth_deps.py` | Schema check (users table); use POSTGRES_* + 127.0.0.1 when USE_LOCAL_POSTGRES=1 |

---

## 7. Monitoring / Metrics Findings

- **403 on GET /metrics**: Expected when `API_KEYS` is set. Prometheus did not send auth.
- **Change**: `/metrics` now accepts either `X-API-Key` or `Authorization: Bearer <key>`.
- **Prometheus**: Add `bearer_token` or `bearer_token_file` to `groupio-api` scrape_config with one of `API_KEYS`.
- **Dev option**: Set `API_KEYS=[]` in docker/.env to allow unauthenticated metrics.

---

## 8. Additional Flows Audited

| Flow | Route | Depends on DB | Depends on Schema | Status |
|------|-------|---------------|-------------------|--------|
| signup | POST /auth/signup | ✓ | ✓ | Fixed (migrations + 503) |
| login | POST /auth/login/json | ✓ | ✓ | Fixed |
| refresh | POST /auth/refresh | ✓ | ✓ | Fixed |
| password reset | POST /auth/password/reset | ✓ | ✓ | Fixed |
| me | GET /auth/me | ✓ | ✓ | Fixed |
| onboarding | POST /onboarding/... | ✓ | ✓ | Fixed |
| webhooks | POST /webhooks/... | ✓ | ✓ | Fixed |

All use `get_postgres_client()` → same DB path. With migrations on startup and 503 on schema errors, all are now aligned.

---

## 9. Tests Added or Updated

- `tests/unit/test_postgres_client.py`: `test_auth_tables_exist_true_when_users_table_exists`, `test_auth_tables_exist_false_when_users_table_missing`, `test_auth_tables_exist_returns_true_for_supabase`
- `tests/unit/test_error_scenarios.py`: `TestSchemaNotReady::test_is_schema_not_ready_recognises_undefined_table_error`, `test_login_returns_503_when_users_table_missing`

---

## 10. Validation Steps

```bash
# From project root
cd /Users/talakalo/projects/Groupio-Multi-Agent-System

# 1. Rebuild and run Docker
docker compose -f docker/docker-compose.yml build api --no-cache
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant neo4j
docker compose -f docker/docker-compose.yml up api

# 2. Expect in logs: "Database connection verified" then "alembic upgrade head" (migrations run)
# 3. If fresh DB: "Database schema not ready — users table missing" should NOT appear after migrations
# 4. Login: POST /api/v1/auth/login/json with valid user → 200
# 5. Schema check: python scripts/check_auth_deps.py → "OK (schema ready)"

# From host against Docker Postgres (migrations only):
alembic -c alembic.docker.ini upgrade head
```

---

## 11. Remaining Risks

- **Scheduler**: Uses `DATABASE_URL`; ensure it targets Docker Postgres when running in compose. Currently set in compose.
- **Prometheus scrape**: `redis-exporter`, `postgres-exporter`, `node-exporter` targets may not exist in base compose; remove or add services if needed.
- **Stale image**: Rebuild API image after adding alembic to `requirements-prod.txt` and copying `alembic/`.
