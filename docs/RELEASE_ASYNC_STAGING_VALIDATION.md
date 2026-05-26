# Release note — async staging validation pass (operational credibility)

Date: 2026-03-25 (worktree). Scope: validate and document staging bring-up; no payment semantics or webhook idempotency changes.

## What was validated successfully

- **Handoff baseline** (Phase 0): Feature flags, `src/messaging/*`, workers, replay CLI, migrations through `034`, invoice-created outbox wiring, API Compose decoupled from RabbitMQ health, workers still `depends_on` RabbitMQ where configured, `building.activated` still topology-only.
- **`docker compose config`**: Passes with  
  `docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml config -q`
- **Targeted tests**: Outbox batch publish success/failure, existing async unit tests (run after edits).
- **Alembic**: Single head `034` (unchanged in this pass).

## What was fixed or added in this pass

- **Compose + env**: Services use tracked `docker/staging-minimal.env` as `env_file` (no missing `docker/.env`); expanded file includes JWT/API/async placeholders for container boot.
- **Docs**: `docs/STAGING_ASYNC_ROLLOUT.md` rewritten with compose commands, flag order, per-scenario smoke tables (routes, queues, DLQs, recovery).
- **Espo ops contract**: `docs/ESPOCRM_SETUP_CONTRACT.md` (entities, fields, samples, rate-limit/DLQ note).
- **Runbook**: `docs/ASYNC_EVENTS_RUNBOOK.md` — compose env flow, failure-mode matrix, backlog/PII, Supabase/PostgREST table intent.
- **Ops script**: `scripts/ops/outbox_backlog_report.py` — aggregate unpublished / near-exhausted outbox counts.
- **Code**: `outbox_dispatcher._process_outbox_rows()` extracted for testable publish batch behavior (behavior unchanged).
- **Tests**: `tests/unit/test_outbox_dispatcher_failures.py`.

## Blocked by environment (precise)

- **Docker daemon**: Not running in validation environment → **no** live `docker compose up`, health checks, or worker log capture.
- **EspoCRM**: No live instance → no real HTTP verification; use `docs/ESPOCRM_SETUP_CONTRACT.md` for admin execution.

## Staging bring-up commands (copy-paste)

```bash
# 1) Validate compose
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml config -q

# 2) Infra
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml up -d postgres rabbitmq redis qdrant neo4j

# 3) Full stack including async workers (edit staging-minimal.env flags first)
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml up -d api outbox_dispatcher worker_notifications worker_crm_sync worker_payments
```

Migrations: automatic on API start (`alembic upgrade head` in command) or manual with `DATABASE_URL` set.

## Smoke checklist

See **`docs/STAGING_ASYNC_ROLLOUT.md`** (must-pass scenarios 1–6).

## Rollback

See **`docs/STAGING_ASYNC_ROLLOUT.md`** § Phase B rollback and **`docs/ASYNC_EVENTS_RUNBOOK.md`** § Rollback.

## Verdict

| Statement | Rating |
|-----------|--------|
| Foundation stable | **Yes** |
| Staging-ready async rollout (paper + tests) | **Yes** |
| Staging-**validated** async rollout (live Docker + Espo) | **Partial** — blocked on Docker daemon + Espo in this environment |
| Production candidate | **Not claimed** |
| Production ready | **No** |
