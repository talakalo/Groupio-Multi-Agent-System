# Staged rollout and smoke verification — async events

Groupio PostgreSQL is authoritative. RabbitMQ, workers, and EspoCRM are best-effort. See also `docs/ASYNC_EVENTS_RUNBOOK.md`, `docs/ESPOCRM_SETUP_CONTRACT.md`.

---

## Phase A — Compose and env (required before any bring-up)

### Validating the Compose file (no Docker daemon required to parse; daemon required for `up`)

From repository root:

```bash
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml config -q
```

- **Project interpolation**: `--env-file docker/staging-minimal.env` supplies `POSTGRES_PASSWORD`, `NEO4J_PASSWORD`, and other `${VAR:?…}` placeholders used in `docker-compose.yml`.
- **Container env**: Services use `env_file: staging-minimal.env` (paths relative to the `docker/` directory). That file is **tracked** with **non-production placeholders** — replace before shared environments.

### User-provided secrets (never commit real values)

| Variable | Required for |
|----------|----------------|
| `POSTGRES_PASSWORD` / `NEO4J_PASSWORD` | Postgres + Neo4j services (placeholders in `staging-minimal.env` suffice only for local sandboxes) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | LLM features inside API |
| `JWT_SECRET_KEY` | Stable sessions in staging/production (`ENVIRONMENT=staging` enforces length) |
| `STRIPE_*` | Real payments (use `PAYMENT_PROVIDER=mock` for async smoke without Stripe) |
| `ESPOCRM_*` | CRM worker talking to real Espo |

### Minimal service set for async smoke (Docker)

Infrastructure:

```bash
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml up -d postgres rabbitmq redis qdrant neo4j
```

Async workers (after DB + broker healthy):

```bash
docker compose --env-file docker/staging-minimal.env -f docker/docker-compose.yml up -d api outbox_dispatcher worker_notifications worker_crm_sync worker_payments
```

**Startup order**: Postgres → RabbitMQ (for workers that `depends_on` it) → API (runs `alembic upgrade head` on start) → dispatcher + workers.

**CRM worker with Espo unset**: With `ENABLE_CRM_SYNC=false`, the process exits immediately with an info log — no crash loop. With `ENABLE_CRM_SYNC=true` but empty `ESPOCRM_BASE_URL` / key, `EspoCRMService.handle_envelope` skips CRM calls with a warning — verify logs.

---

## Phase B — Enablement order (flags)

1. Run migrations to head (API container does this on boot, or run `alembic upgrade head` manually).
2. Start RabbitMQ; wait for health.
3. Set `ENABLE_RABBITMQ=true`, `ENABLE_OUTBOX=true`.
4. Enable product flags one at a time: `ENABLE_NOTIFICATION_QUEUE`, `ENABLE_CRM_SYNC`, `ENABLE_PAYMENT_EVENTS`.
5. Restart API so routes enqueue to outbox where wired.

**Rollback**: `ENABLE_NOTIFICATION_QUEUE` → `ENABLE_CRM_SYNC` → `ENABLE_PAYMENT_EVENTS` → `ENABLE_OUTBOX` → `ENABLE_RABBITMQ`; restart API; workers may stay up (they idle when flags off).

---

## Must-pass smoke scenarios (executable recipes)

### 1. Offer join → queued notification

| Item | Detail |
|------|--------|
| **Prerequisites** | Resident user JWT; user in `building_residents` for offer’s building; offer `status` in `pending` / `matching`; `ENABLE_OUTBOX=true`, `ENABLE_RABBITMQ=true`, `ENABLE_NOTIFICATION_QUEUE=true`; `worker_notifications` + `outbox_dispatcher` running; topology declared (worker declares queues on start). |
| **API** | `POST /api/v1/offers/{offer_id}/join` with body `{"unit_count": 1}` (and optional `invite_token`). |
| **DB** | `offer_participants` (or equivalent join table) gains row; offer participant count updated. |
| **Outbox** | Row: `routing_key` = `notifications.send_requested`, payload envelope `event_name` = `notifications.offer_joined_email`, `idempotency_key` = `offer_joined_email:{offer_id}:{user_id}`. |
| **Queue** | Message on exchange `groupio.events` (default), queue `notifications.dispatch` (`src/messaging/constants.py`). |
| **Worker** | Logs delivery; email sent if Resend/SMTP configured, else check for failure logs / DLQ. |
| **DLQ** | On handler exception: `notifications.dlq` via `groupio.notifications.dlx`. |
| **Recovery** | Fix email config or payload; purge or move DLQ after root cause; replay not required for notifications unless you re-publish manually. |

### 2. Contractor register → CRM sync

| Item | Detail |
|------|--------|
| **Prerequisites** | `ENABLE_OUTBOX`, `ENABLE_RABBITMQ`, `ENABLE_CRM_SYNC=true`; Espo matches `docs/ESPOCRM_SETUP_CONTRACT.md`; `worker_crm_sync` running. |
| **API** | `POST /api/v1/contractors/` (creates contractor + enqueues `crm.contractor.registered`). Contractor onboarding also enqueues CRM events via `POST /api/v1/onboarding` (contractor branch). |
| **Outbox** | `crm.contractor.registered`, idempotency `crm:contractor:registered:{contractor_id}`. |
| **Queue** | `crm.sync` bound to `crm.contractor.registered`. |
| **DB** | After success: `crm_external_refs` row `entity_type=contractor`, `groupio_id` = contractor id. |
| **CRM** | Entity exists in Espo with external id field set. |
| **Recovery** | DLQ: `crm.dlq`; fix Espo/mapping; requeue message or reset outbox row if publish failed (different path). |

### 3. Building create → CRM sync

| Item | Detail |
|------|--------|
| **Prerequisites** | Same CRM flags as §2. |
| **API** | `POST /api/v1/onboarding` (resident flow) when a **new** building is created for the user (see `onboarding.py` CRM enqueue after building insert). |
| **Outbox** | `crm.building.created`. |
| **DB** | `crm_external_refs` for `building`. |

### 4. Escalation create → CRM Note

| Item | Detail |
|------|--------|
| **Prerequisites** | Same as §2. |
| **API** | `POST /api/v1/escalations/` |
| **Outbox** | `crm.escalation.created` with payload containing `escalation_id`. |
| **CRM** | New `Note` (or configured entity) with post text from mapper. |

### 5. Payment initiate + webhook → outbox

| Item | Detail |
|------|--------|
| **Prerequisites** | `ENABLE_OUTBOX=true`, `ENABLE_PAYMENT_EVENTS=true`; `PAYMENT_PROVIDER=mock` OK for initiate; Stripe webhook tests need `STRIPE_WEBHOOK_SECRET` in dev or signature bypass per route. |
| **Invoice created** | First `POST /api/v1/payments/initiate` for `(user, offer)` without invoice → outbox `invoices.created`, idempotency `invoice:{invoice_id}:created`. Second initiate with same invoice → **no** new `invoices.created` row. |
| **Webhook** | After DB update, outbox for `payments.succeeded` / failed / refund with Stripe idempotency keys (see `payments.py`). |
| **Worker** | `worker_payments` logs event name and ids. |

### 6. Replay failed outbox row

| Item | Detail |
|------|--------|
| **Prerequisites** | Known `outbox_events.id` with `published_at` null and `attempts` &lt; 50 (or reset first). |
| **Admin API** | `POST /api/v1/admin/outbox/{outbox_id}/requeue` (admin JWT). |
| **CLI** | `python scripts/ops/requeue_outbox.py <uuid>` |
| **Expected** | `published_at` cleared, `attempts=0`; dispatcher picks up row on next poll. |

---

## Optional checks

- Prometheus: `groupio_messaging_publish_total`, `groupio_messaging_consumer_messages_total`.
- RabbitMQ UI: queue depth + DLQ names (`notifications.dlq`, `crm.dlq`, `payments.dlq`).

---

## Blocked without external systems

- Live Espo create/update (use `docs/ESPOCRM_SETUP_CONTRACT.md`).
- Signed Stripe webhooks outside `ENVIRONMENT=development`.

---

## Operator utilities

- Backlog summary: `python scripts/ops/outbox_backlog_report.py` (requires DB reachable via `DATABASE_URL` / Docker settings).
- **building.activated**: Not emitted by API; topology only.

---

## Deferred product event

- **`crm.building.activated`**: Still no authoritative single hook in API code.
