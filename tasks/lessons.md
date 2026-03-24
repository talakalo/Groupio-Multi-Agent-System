# Lessons learned

Record patterns and rules here after user corrections or recurring mistakes. Review at session start.

## Format

For each lesson:

- **What happened**: Brief description of the mistake or correction.
- **Rule**: What to do (or avoid) next time.
- **When**: Optional date or context.

---

## Open PRs snapshot (2026-02-21)

Transcribed from screenshot:

| # | Title | Status |
|---|-------|--------|
| #76 | fix: handle pulls.create errors gracefully in dev-to-main-pr workflow (#75) | ✗ Checks failing, 1 comment |
| #72 | feat: production-readiness overhaul — scrub secrets, remove mock data, add validation | Open, 9h |

- **PR #76** is an auto-generated dev→main PR (created by `.github/workflows/dev-to-main-pr.yml` after PRs #73–#75 merged into dev). Do NOT delete it — fix the failing checks, then merge to promote dev→main.
- **PR #72** is a large feature branch (15 commits). Merge conflicts with dev were resolved in this session. Merge it into dev to land production-readiness improvements.

## Lessons

### Design system and frontend

- **next-intl namespace vs JSON nesting** — `useTranslations('contractor.offers')` + `t('filters.sortBy')` resolves `contractor.offers.filters.*`. If messages define `contractor.offers.active.filters.*`, use `t('active.filters.sortBy')` (or change namespace). Missing keys render as raw paths in the UI. (2026-03-24)
- **Sidebar “account” row must not call `logout`** — If the label is “My account” / “My business”, use a `Link` to profile/account and keep **logout** in the header dropdown only (resident, contractor, buildings-manager, admin web layouts). BM/admin without a full profile page: add `/buildings-manager/account` and `/admin/account` stub pages. (2026-03-24)
- **Design token changes are high-blast-radius** — Always verify on key pages first before rolling out token updates.
- **RTL requires logical CSS properties** — Use `start`/`end` (and `margin-inline-start`, `padding-inline-end`, etc.) not `left`/`right`.
- **Hebrew typography needs line-height >= 1.4** — Improves readability for Hebrew text.
- **Skeleton loading is better UX than spinners** — Use skeleton placeholders for content-heavy loading states.
- **Duplicate top-level keys in `messages/*.json` silently overwrite** — JSON parsers keep the last value; e.g. two `residentNav` blocks dropped `payments` while keeping `architecture`. Merge into one namespace and add a test that scans the raw file for duplicate keys.
- **`GET /api/v1/admin/settings` is a flat key-value map** — Do not assign the JSON body directly to nested UI state (`general`, `notifications`, etc.). Normalize by merging onto defaults; PUT responses are also flat.
- **Trust badges above the fold increase checkout conversion** — Position trust indicators prominently in checkout flows.
- **window.prompt() and window.location.reload() are anti-patterns** — Use modals and state invalidation instead.

### Backend / DevOps
- **REDIS_URL with localhost can cause Errno 99 on macOS** — Use `127.0.0.1` instead of `localhost` in Redis/DB URLs to avoid IPv6 resolution issues. Code now normalizes this in `redis_client.py` and `postgres.py`.
- **API must be restarted after .env changes** — `uvicorn --reload` only reloads on Python file changes. Restart manually for env/config changes.
- **503 on login** — Usually DB or Redis unreachable. Run `python scripts/check_auth_deps.py` to diagnose. Verify: (1) Redis running (Docker: `docker compose -f docker/docker-compose.yml up -d redis`), (2) Postgres reachable (Supabase not paused), (3) When API runs in Docker, REDIS_URL uses hostname `redis` not 127.0.0.1. Restart API after .env changes.
- **Docker errno 99 on DB connect** — API in Docker must use the `postgres` service hostname, not localhost or Supabase host. When `USE_LOCAL_POSTGRES=1`, the app uses `DOCKER_POSTGRES_*` (set by compose) instead of `DATABASE_URL` from .env. Do not set `DATABASE_URL` to Supabase when using local Docker Postgres.
- **Docker must run migrations** — A fresh Postgres volume has no schema. Docker Compose must run `alembic upgrade head` before uvicorn. API command now does: `alembic upgrade head && uvicorn ...`. See `tasks/RUNTIME_CONFIG_AUDIT_REPORT.md`.
- **Startup readiness ≠ schema readiness** — "Database connection verified" (pool creation) does not prove auth tables exist. Add `auth_tables_exist()` check and log clearly if `users` is missing. Return 503 (not 500) for `UndefinedTableError`.
- **Runtime failure audit** — Login/signup: duplicate-submit guard (useRef), 423 (Locked) mapping, gaierror→503 in backend. See `tasks/runtime_failure_audit_report.md`.
- **Local compose + ports** — Compose file is `docker/docker-compose.yml`; run from repo root with `-f docker/docker-compose.yml`, or from `docker/` with `-f docker-compose.yml` only. Grafana was published on host 3001 and blocked Admin; Grafana is now **3010**. Shell pastes: one command per line or `uvicorn` merges with `export` and breaks `--port`.
- **Pydantic `EmailStr` rejects `*.local`** — Domains like `@test.local` fail validation (“special-use or reserved”). Use RFC 2606 placeholders (`@example.com`) for synthetic seed/test emails.
- **JSONB `context` may arrive as `str` from DB/seed** — Pydantic `dict` fields then fail `EscalationListResponse` with 500. Use `@field_validator(..., mode="before")` to `json.loads` strings into dicts (see `EscalationInDB.context`). (2026-03-18)
- **Admin 401 on API while UI still loads** — Middleware checks `refresh_token` + `admin_role_verified`; protected routes use `access_token` (short TTL). Expired access → 401 on `/auth/me`, `/admin/*`, `/escalations`. Fix: refresh-on-401 (`POST /auth/refresh` + retry) and consistent `NEXT_PUBLIC_API_URL` (no `localhost` vs `127.0.0.1` mix). (2026-03-23)
- **Escalation assign 422** — Admin UI POSTs `{ assigned_to }`; FastAPI had `admin_id` as a query param → 422. Use a Pydantic body model with `assigned_to`. **Escalate priority 422** — API enum uses `critical`, not `urgent`; map UI `urgent` → `critical` on PUT. (2026-03-24)
- **Admin raw `fetch` vs `GroupioApiClient`** — Escalations page used `fetch` for PUT/assign while list used the client → different behavior (no 401 refresh, subtle header/base issues). Route all mutation calls through `getApiClient()` (`updateEscalation`, `assignEscalation`, `resolveEscalation`). (2026-03-24)
- **Strict `ContractorBase` / `EscalationBase` on read responses** — `GET` list/PUT return rows that may violate create-time rules (phone pattern, description length, `EmailStr`, short `summary`, unknown enum strings). Override/coerce on `ContractorInDB` / `EscalationInDB` for API responses so admin UI does not 500/422 on legacy or hand-edited rows. (2026-03-24)
- **`/admin/status` vs TS `SystemStatus`** — API returns `vector_collections` and `avg_duration_ms`; client must normalize to `vectorCollections` / `avgDurationMs` or agents/charts look empty. (2026-03-24)

### API contracts
- **Profile password change vs forgot password** — `POST /auth/password/reset` expects `{email}` (unauthenticated). For changing password when logged in, use `POST /auth/password/change` with `{current_password, new_password}` and auth header. Profile page was incorrectly using password-reset.
- **Payments list** — Backend has `GET /payments/my`, not `GET /payments?status=...`. Dashboard was requesting wrong path (404).
- **Building join in dev** — Relative `/api/v1/...` hits Next.js in dev (no rewrite). Use full `apiBase` URL so requests reach the backend.
- **Publish-readiness audits can drift from code** — Before filing a gap (e.g. “ApiClient missing X”), grep/read `client.ts` and align the written audit or add an “as-of” errata block. Stale G1-style claims undermine trust.

<!-- Add entries below as corrections and patterns emerge -->
