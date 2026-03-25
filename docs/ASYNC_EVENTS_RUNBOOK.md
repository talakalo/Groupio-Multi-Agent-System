# Async events, RabbitMQ, and EspoCRM — runbook

Groupio remains **transactionally authoritative** in PostgreSQL. RabbitMQ and EspoCRM are **best-effort async** projections and delivery paths.

## Feature flags (see `src/config/settings.py`)

| Flag | Purpose |
|------|---------|
| `ENABLE_RABBITMQ` | AMQP client usage (publisher, workers). |
| `ENABLE_OUTBOX` | Write/read `outbox_events` and run the outbox dispatcher. |
| `ENABLE_NOTIFICATION_QUEUE` | Enqueue offer/notification messages via outbox instead of inline `BackgroundTasks` (where wired). |
| `ENABLE_CRM_SYNC` | CRM sync worker calls EspoCRM. |
| `ENABLE_PAYMENT_EVENTS` | Outbox rows for payment-derived events (Stripe webhook after DB success) and **invoices.created** when a new invoice row is first persisted in `POST /payments/initiate`. |

All default to **off**. Turn on only after migrations and workers are verified.

## Configuration

- `RABBITMQ_URL` — e.g. `amqp://guest:guest@rabbitmq:5672/` (Docker) or `localhost:5672` (host).
- `RABBITMQ_EXCHANGE_EVENTS` — topic exchange name (default `groupio.events`).
- `OUTBOX_POLL_INTERVAL_MS` — dispatcher poll interval.
- `ESPOCRM_BASE_URL` / `ESPOCRM_API_KEY` — REST API (only when CRM sync enabled).
- `ESPOCRM_ENTITY_*` / `ESPOCRM_FIELD_*` — entity type names and attribute keys for contractor, building, and note projection (must match your Espo schema).

## Local Docker

The **`api`** service does **not** `depends_on` RabbitMQ health, so the API can start for core flows while the broker is down (messaging flags off). Services load **`docker/staging-minimal.env`** (tracked placeholders). For Compose variable interpolation, pass the same file:

```bash
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml config -q
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml up -d postgres rabbitmq
```

The API container runs `alembic upgrade head` on start. Worker services (`outbox_dispatcher`, `worker_*`) still wait on RabbitMQ healthy where configured in Compose.

Management UI: http://localhost:15672 (guest/guest) when using the default image.

## Workers

Run from repo root (with `DATABASE_URL`, `REDIS_URL`, flags set):

- `python -m src.workers.outbox_dispatcher` — drains `outbox_events` to the exchange.
- `python -m src.workers.worker_notifications` — delivers notification jobs.
- `python -m src.workers.worker_crm_sync` — projects to EspoCRM.
- `python -m src.workers.worker_payments` — payment side-effects / CRM notes.

Docker Compose (see `docker/docker-compose.yml`): `outbox_dispatcher`, `worker_notifications`, `worker_crm_sync`, `worker_payments` (all respect feature flags; safe defaults keep them idle).

## Observability

- `groupio_messaging_publish_total{result="success|error"}` — RabbitMQ publish attempts (`src/messaging/publisher.py`).
- `groupio_messaging_consumer_messages_total{worker="notifications|crm_sync|payments",result="ok|error|ignored"}` — consumer outcomes.

Outbox dispatcher logs a **warning** when a publish fails and `attempts` is incremented; rows with `attempts >= 50` are no longer fetched until an operator requeues them.

## EspoCRM field mapping

Projection targets are **explicit** via `src/integrations/espocrm/schema.py` and settings defaults (`C_GroupioContractor`, `C_GroupioBuilding`, `Note`, plus `cGroupio*` field keys). In Espo Admin: create matching entity types (or point settings at native types such as `Account`) and **create fields with the exact attribute names** you configure in env. Optional `emailAddress` / `phoneNumber` / `description` are sent when present on contractor rows.

Staged checklist: `docs/STAGING_ASYNC_ROLLOUT.md`.

## Supabase / RLS / PostgREST

Migration `034_async_tables_rls` enables **RLS** on `outbox_events` and `crm_external_refs`.

| Table | Intended access |
|-------|-----------------|
| `outbox_events` | **Backend only** (asyncpg / service role). Not a product table for browsers. |
| `crm_external_refs` | **Backend only**. Maps Groupio ids to Espo ids. |

With RLS enabled and **no** policies for `anon` / `authenticated`, PostgREST using the publishable/anon key cannot read or write these rows. The API and workers use the database owner or service role and are unaffected.

**Replay metadata** lives in `outbox_events` columns (`attempts`, `last_error`, `published_at`) — same access rules.

No extra “allow client write” policies should be added without a product requirement.

## Failure modes (expected behavior)

| Scenario | API / DB | Outbox / queue |
|----------|----------|----------------|
| RabbitMQ down, **flags off** | Normal | No rows inserted (or not published). |
| RabbitMQ down, **ENABLE_OUTBOX+ENABLE_RABBITMQ on**, dispatcher up | Normal | Rows stay unpublished; `attempts` increment on each failed publish until cap (50), then skipped until requeue. |
| Espo down, **ENABLE_CRM_SYNC on** | Normal | Consumer throws → `requeue=False` → message to **`crm.dlq`**; fix Espo and move/republish from DLQ. |
| Worker killed mid-handle | Message may be redelivered if not acked (AMQP); handlers should stay idempotent where possible (`crm_external_refs`, Stripe webhook idempotency). |
| Duplicate AMQP delivery | Same idempotency keys on outbox insert prevent duplicate **rows**; CRM PATCH/create uses `crm_external_refs` to avoid duplicate Espo entities for contractor/building. |
| Invalid CRM payload (400 from Espo) | Normal | Message fails → DLQ; fix mapping or Espo fields — **not** retried forever in-queue. |

## Backlog, PII, and housekeeping

- **Outbox growth**: Unpublished rows + high `attempts` → fix broker connectivity, then `scripts/ops/requeue_outbox.py` or admin requeue. Summary: `scripts/ops/outbox_backlog_report.py`.
- **Queue backlog**: Inspect RabbitMQ UI; scale consumers only after fixing root cause (slow Espo, email rate limits).
- **PII**: Notification payloads include **email** and names; payment payloads include user/offer ids and amounts. Do not log full message bodies at INFO in shared log sinks; restrict access to queue monitors.

**EspoCRM setup contract**: `docs/ESPOCRM_SETUP_CONTRACT.md`.

## Replay stuck outbox rows

- API: `POST /api/v1/admin/outbox/{id}/requeue` (admin auth).
- CLI: `python scripts/ops/requeue_outbox.py <outbox_uuid>`

## Degraded operation

If RabbitMQ or EspoCRM is down:

- API requests that commit business state **must still succeed**.
- Outbox rows accumulate; dispatcher/workers retry when infrastructure returns.
- Monitor backlog: `outbox_events` where `published_at IS NULL`, RabbitMQ queue depth, DLQs.

## Rollback

Disable flags in order: `ENABLE_NOTIFICATION_QUEUE` → `ENABLE_CRM_SYNC` → `ENABLE_PAYMENT_EVENTS` → `ENABLE_OUTBOX` → `ENABLE_RABBITMQ`. Redeploy API and stop workers.
