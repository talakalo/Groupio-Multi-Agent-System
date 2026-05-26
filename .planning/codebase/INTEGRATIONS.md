---
last_mapped: 2026-05-06
---

# External Integrations

## AI / LLM

| Service | Purpose | Config |
|---------|---------|--------|
| Anthropic Claude (claude-sonnet-4-6) | Primary LLM for all 11 agents | `ANTHROPIC_API_KEY` |
| OpenAI GPT-4o | Fallback LLM | `OPENAI_API_KEY` |
| Embedding model | Vector embeddings for RAG | `EMBEDDING_MODEL` env var |

## Databases & Storage

| Service | Purpose | Config |
|---------|---------|--------|
| Supabase / PostgreSQL | Primary relational DB + RLS + auth | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_DB_PASSWORD` |
| Redis 7 | Cache, rate limiting, pub/sub queues | `REDIS_URL` |
| Qdrant | Vector search — contractors, buildings, knowledge_base, conversations | `QDRANT_URL`, `QDRANT_API_KEY` |
| Pinecone | Alternative vector DB | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_ENVIRONMENT` |
| Neo4j 5 | Graph DB — contractor reputation, relationships | Configured via Docker service |
| RabbitMQ 3 | Message queue — outbox pattern, async workers | `RABBITMQ_URL`, `RABBITMQ_EXCHANGE_EVENTS` |

## Payments

| Service | Purpose | Config |
|---------|---------|--------|
| Stripe | Primary payments — PaymentIntents, webhooks, subscriptions | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Bit | Israeli payment provider (optional) | `BIT_API_KEY`, `BIT_MERCHANT_ID`, `BIT_ENVIRONMENT` |
| Paybox | Israeli payment provider (optional) | `PAYBOX_TERMINAL`, `PAYBOX_API_KEY`, `PAYBOX_ENVIRONMENT` |

Payment webhook handler: `src/services/payment.py`
Contractor membership webhooks: `src/services/stripe_contractor_webhooks.py`

## Communications

| Service | Purpose | Config |
|---------|---------|--------|
| Resend | Transactional email | `RESEND_API_KEY` |
| SMTP | Fallback email | `SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL/FROM_NAME` |
| WhatsApp (Meta API) | WhatsApp bot for notifications | `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WEBHOOK_SECRET` |

WhatsApp bot handler: `src/services/whatsapp_bot.py`

## CRM

| Service | Purpose | Config |
|---------|---------|--------|
| EspoCRM | CRM sync for contractors/buildings | `ESPOCRM_BASE_URL`, `ESPOCRM_API_KEY`, custom field mappings |

CRM sync worker toggled via `ENABLE_CRM_SYNC` feature flag.

## Observability & Monitoring

| Service | Purpose | Config |
|---------|---------|--------|
| Sentry | Error tracking (FE + BE) | `SENTRY_DSN` |
| Prometheus | Metrics collection | Port 9090 (Docker) |
| Grafana | Dashboards | Port 3001 (Docker, not admin app) |
| PostHog | Product analytics | `posthog-js` (FE) |

## Auth & Security

| Service | Purpose | Config |
|---------|---------|--------|
| Supabase Auth | JWT-based auth, user sessions | `JWT_SECRET_KEY`, `JWT_ALGORITHM` |
| Row-Level Security | PostgreSQL RLS — role-scoped data access | Defined in Alembic migrations |
| PyJWT | JWT validation in FastAPI middleware | `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` |

## Feature Flags (env-based)

| Flag | Controls |
|------|---------|
| `ENABLE_RABBITMQ` | RabbitMQ message queue |
| `ENABLE_OUTBOX` | Outbox pattern for reliable messaging |
| `ENABLE_NOTIFICATION_QUEUE` | Async notification delivery |
| `ENABLE_CRM_SYNC` | EspoCRM sync worker |
| `ENABLE_PAYMENT_EVENTS` | Payment event streaming |
| `ENABLE_BIT_PAYMENT` | Bit payment provider |
| `ENABLE_PAYBOX_PAYMENT` | Paybox payment provider |
| `ENABLE_WEB_SEARCH` | Web search in agents |
| `ENABLE_GRAPH_QUERIES` | Neo4j graph queries |
| `ENABLE_PREDICTIVE_MODELS` | ML prediction features |
| `HUMAN_ESCALATION_ENABLED` | Human escalation routing |

## Data Gov (Israel-specific)

- `src/services/datagov_provider.py` — Israeli government data API integration (building/address verification)

## Israeli Government / Data Sources

| Service | Purpose |
|---------|---------|
| data.gov.il API | Building addresses, contractor license verification |
