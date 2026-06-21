---
phase: "00-remove-redis"
plan: 5
subsystem: databases/config/workers/tests
tags: [redis-removal, cleanup, shim, pyproject, docker, settings, agent-worker]
dependency_graph:
  requires: [PostgresStore, get_pg_store, pg_store]
  provides: [redis-fully-optional, zero-redis-imports, backwards-compat-shim]
  affects:
    - src/databases/redis_client.py
    - src/config/settings.py
    - src/workers/agent_worker.py
    - pyproject.toml
    - docker/docker-compose.yml
    - .env.example
    - tests/unit/test_redis_client_extended.py
    - tests/unit/test_auth_rate_limit.py
    - tests/unit/test_coverage_boost.py
    - tests/unit/test_error_scenarios.py
    - tests/unit/test_agent_worker.py
tech_stack:
  added: []
  patterns: [backwards-compat-shim, asyncio-queue-worker, optional-settings-default]
key_files:
  created: []
  modified:
    - src/databases/redis_client.py
    - src/config/settings.py
    - src/workers/agent_worker.py
    - pyproject.toml
    - docker/docker-compose.yml
    - .env.example
    - tests/unit/test_redis_client_extended.py
    - tests/unit/test_auth_rate_limit.py
    - tests/unit/test_coverage_boost.py
    - tests/unit/test_error_scenarios.py
    - tests/unit/test_agent_worker.py
decisions:
  - "redis_client.py: replace 291-line Redis implementation with 23-line shim; RedisClient exported as PostgresStore alias; get_redis_client() delegates to get_pg_store() with DeprecationWarning"
  - "agent_worker.py: Redis brpop polling replaced with asyncio.Queue; no redis import; worker now operates in single-process in-memory mode (suitable for Render single-worker)"
  - "settings.py: REDIS_URL default changed from 'redis://localhost:6379' to '' (empty string avoids Pydantic Optional[str] breaking change)"
  - "pyproject.toml: redis[hiredis]>=5.0.0 removed; tenacity retained (used in postgres.py)"
  - "docker-compose.yml: Redis service, depends_on entries, REDIS_URL env vars, and redis_data volume all commented out (not deleted)"
  - "5 test files updated to remove RedisClient._redis mocking pattern; now use PostgresStore patch targets"
metrics:
  duration: "~14 minutes"
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 11
---

# Phase 00 Plan 05: Redis Cleanup — Shim, Optional Settings, Remove Dependency

**One-liner:** Replace 291-line RedisClient with a 23-line backwards-compat shim, remove redis[hiredis] from pyproject.toml, comment out Docker Redis service, and convert agent_worker.py from brpop polling to asyncio.Queue — achieving zero bare redis imports across the entire src/ tree.

## What Was Built

### Task 1: redis_client.py shim and settings.py (commit `606d05d`)

**src/databases/redis_client.py**
- Replaced entire 291-line Redis implementation with 23-line thin shim
- `RedisClient = PostgresStore` (alias) — existing `from src.databases.redis_client import RedisClient` imports get a `PostgresStore` back without error
- `get_redis_client()` calls `get_pg_store()` with `DeprecationWarning(stacklevel=2)`
- `get_pg_store` re-exported for convenience
- Zero `import redis` / `import redis.asyncio` at top level — removed Lua scripts, `_RATE_LIMIT_SCRIPT`, `_REFRESH_TOKEN_SWAP_SCRIPT`, all Redis internals

**src/config/settings.py**
- `REDIS_URL: str = "redis://localhost:6379"` → `REDIS_URL: str = ""`
- `REDIS_PASSWORD: str = ""` (unchanged)
- Comment block describing Redis password configuration replaced with: "Redis settings — no longer required. Kept for zero-downtime migration."
- Type kept as `str` (not `Optional[str]`) to avoid pydantic-settings parsing changes — empty string default means Render deployments without REDIS_URL env var don't fail

### Task 2: Remove redis from deps, comment out Docker Redis (commit `e5b1e10`)

**pyproject.toml**
- `"redis[hiredis]>=5.0.0"` removed from `[project] dependencies`
- `tenacity>=8.2.0` retained (used in `src/databases/postgres.py`)
- TOML remains valid

**docker/docker-compose.yml**
- Entire Redis service block commented out (11 lines): `image: redis:7-alpine`, ports, command, volumes
- `- redis: condition: service_started` commented in `api`, `worker`, `scheduler` `depends_on` blocks
- `REDIS_URL=redis://...` environment vars commented in `api`, `worker`, `scheduler` sections
- `redis_data:` volume commented in volumes section
- All original lines preserved (not deleted) for easy reference

**.env.example**
- `REDIS_URL=redis://localhost:6379` commented out
- `# REDIS_PASSWORD=` added
- Explanatory comment added: "Redis removed — Postgres is used for all caching and session storage."

**src/workers/agent_worker.py** (Rule 1 auto-fix)
- Removed `import redis.asyncio as redis` (would crash on import after redis package removed)
- Replaced Redis brpop polling with `asyncio.Queue` — `_queue: asyncio.Queue` attribute
- `connect()` no longer pings Redis; initializes `RouterAgent` only
- `disconnect()` is a no-op (no external connection to close)
- New `enqueue(task_data)` method for route handlers to push tasks directly
- `run()` uses `asyncio.wait_for(self._queue.get(), timeout=5.0)` instead of `redis.brpop`
- No longer stores results to Redis `setex` (results returned directly via `process_task()`)

### Deviation: 5 test files updated (included in Task 2 commit)

| File | Change |
|------|--------|
| `test_agent_worker.py` | Rewritten to use `asyncio.Queue` API: `worker._queue.put()`, `worker.enqueue()`, no `redis_client`/`brpop`/`setex` references |
| `test_redis_client_extended.py` | Rewritten: 25 old Redis-internal tests (mocking `redis.from_url`, `_redis.eval`) replaced with 6 shim contract tests |
| `test_auth_rate_limit.py` | Updated to mock `PostgresStore._pg_fetchval` instead of `RedisClient._redis.eval` |
| `test_coverage_boost.py` | `TestAgentWorkerLifecycle.test_connect` and `test_disconnect_with_client` updated for new in-memory queue API |
| `test_error_scenarios.py` | `TestRateLimiting.test_rate_limit_boundary` updated to patch `PostgresStore._pg_fetchval` |

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert redis_client.py to deprecated shim; REDIS_URL defaults to empty | 606d05d | 2 files |
| 2 | Remove redis dep, comment out Docker service, update tests | e5b1e10 | 9 files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] src/workers/agent_worker.py had bare `import redis.asyncio as redis`**
- **Found during:** Task 2 verification (`grep -r "^import redis" src/`)
- **Issue:** `agent_worker.py` line 14 had `import redis.asyncio as redis` which would cause `ImportError` at startup after `redis[hiredis]` removed from pyproject.toml
- **Fix:** Rewrote worker to use `asyncio.Queue` for in-memory task dispatch; no external queue broker required for single-worker Render deployment
- **Files modified:** src/workers/agent_worker.py
- **Commit:** e5b1e10

**2. [Rule 1 - Bug] 5 test files mocked old RedisClient internals**
- **Found during:** Post-task unit test run (7 failed, 25 errors)
- **Issue:** Tests used `RedisClient.__new__(RedisClient)` + `client._redis = AsyncMock()` to mock Redis internals. Since `RedisClient = PostgresStore`, `_redis` attr doesn't exist and tests crashed
- **Fix:** Updated all 5 files to mock `PostgresStore` methods directly (`_pg_fetchval`, `_pg_execute`), rewrite agent_worker tests for asyncio.Queue API, rewrite redis_client_extended tests as shim contract tests
- **Files modified:** 5 test files
- **Commit:** e5b1e10

**3. Pre-existing flaky test (out of scope — logged)**
- `tests/unit/test_graph_store.py::test_create_schema_handles_exceptions` times out (~30s) waiting for a Neo4j mock session
- Not caused by this phase (no Redis references in that file; test was added in a prior commit `09f6ba2`)
- Logged to deferred-items

## Known Stubs

None. The shim delegates to a real `PostgresStore` implementation. All method calls are wired.

## Threat Surface Scan

No new network endpoints introduced. Changes are:
- File content replacement (redis_client.py → shim)
- Config defaults changed (REDIS_URL empty string)
- Package dependency removed
- Docker service disabled

No new trust boundaries or auth paths added.

Threat model dispositions implemented:
- **T-00-13 (Spoofing — shim DeprecationWarning):** Accepted. Warning-only; no security impact.
- **T-00-14 (DoS — Redis package removal):** Mitigated. All call sites in prior plans replaced with pg_store. agent_worker.py was the only remaining bare redis import — fixed via Rule 1.

## Self-Check: PASSED

- [x] src/databases/redis_client.py: no `import redis` — Python parses without error
- [x] src/databases/redis_client.py: `get_redis_client()` function exists and returns `get_pg_store()`
- [x] src/config/settings.py: `REDIS_URL: str = ""`
- [x] pyproject.toml: no active `redis` entry in `[project] dependencies`
- [x] docker/docker-compose.yml: `image: redis` line is commented out
- [x] .env.example: REDIS_URL line commented out with explanatory comment
- [x] grep -r "^import redis" src/: zero results
- [x] Commits 606d05d and e5b1e10 exist in git log
- [x] 1599 unit tests pass (excluding pre-existing flaky test_graph_store.py timeout)
