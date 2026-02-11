# API Reference

## Base URL and versioning

All routes are under `/api/v1`. Base URL example: `http://localhost:8000/api/v1`.

**OpenAPI:** The schema is available at `GET /openapi.json`; interactive docs at `GET /docs` (Swagger UI). The schema reflects the mounted routes under `/api/v1`. A future v2 can be introduced under `/api/v2` or by versioning the OpenAPI document.

## Authentication

Most endpoints require an `Authorization` header:

```
Authorization: Bearer <access_token>
```

Auth routes (signup, login, refresh, logout) use or set tokens; see **Auth** below. Refresh accepts the refresh token in the JSON body (`refresh_token`) or in a cookie (`refresh_token`); the response may set a new refresh token in a cookie.

---

## Pagination

List endpoints use a consistent shape:

- **Query:** `page` (default 1), `page_size` (default 20, max often 100).
- **Response:** `{ "items": [...], "total": number, "page": number, "page_size": number, "has_more": boolean }`.

Examples: `GET /offers`, `GET /contractors`, `GET /escalations`, `GET /buildings`.

---

## Route groups

- **Auth:** `/api/v1/auth/*` — signup, register, login, refresh, logout, me, password, verify.
- **Offers:** `/api/v1/offers` — CRUD, join, leave, participants, match.
- **Contractors:** `/api/v1/contractors` — CRUD, search, reviews, stats, verify.
- **Buildings:** `/api/v1/buildings` — CRUD, residents, stats, offers, invite.
- **Escalations:** `/api/v1/escalations` — create, list, filter, stats, assign, reply, resolve, reopen, messages.
- **Agents:** `/api/v1/agents` — invoke, list, metrics.
- **Admin:** `/api/v1/admin/*` — status, metrics, agents reload, collections.
- **Webhooks:** `/api/v1/webhooks/*` — WhatsApp, contractor-update.

---

## Auth (`/api/v1/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/signup` | Sign up (name, email, phone, password, role, buildingId). Returns token + user. |
| POST | `/register` | Register (legacy). Returns user. |
| POST | `/login` | Login (form or JSON: email, password). Returns `{ access_token, refresh_token, expires_in }`. |
| POST | `/login/json` | Login with JSON body only. |
| POST | `/refresh` | Refresh access token. Body: optional `refresh_token`; or cookie `refresh_token`. Returns new tokens; may set refresh cookie. |
| POST | `/logout` | Logout (invalidate refresh token when provided). |
| GET | `/me` | Current user (requires auth). |
| PUT | `/me` | Update current user (requires auth). |
| POST | `/password/change` | Change password (requires auth). |
| POST | `/password/reset` | Request password reset. |
| POST | `/password/reset/confirm` | Confirm reset with token. |
| POST | `/verify-email/{token}` | Verify email. |
| POST | `/resend-verification` | Resend verification email. |

---

## Offers, Contractors, Buildings, Escalations (summary)

- **Offers** `GET /offers` — List with filters; response uses pagination shape (`items`, `total`, `page`, `page_size`, `has_more`). `POST /offers`, `GET/PUT/DELETE /offers/{id}`, `POST /offers/{id}/join`, `POST /offers/{id}/leave`, etc.
- **Contractors** `GET /contractors` — List with `category`, `region`, `min_trust_score`, `verification_status`, `page`, `page_size`. Same pagination shape. `POST /contractors/search` for semantic search.
- **Buildings** `GET /buildings` — List; `GET/PUT/DELETE /buildings/{id}`, residents, stats, invites.
- **Escalations** `GET /escalations` — List; `POST /escalations/{id}/resolve` accepts JSON body `{ "resolution_notes": "..." }`. Stats, assign, reply, reopen, messages.

---

## Endpoints

### POST /api/v1/message

Send a message to the agent system.

**Request Body**:
```json
{
  "user_id": "string (required)",
  "message": "string (required)",
  "building_id": "string (optional)",
  "channel": "string (optional, default: 'web')"
}
```

**Response** (200):
```json
{
  "conversation_id": "conv_abc123",
  "response": {
    "type": "text | contractor_matches | pricing_analysis | handoff",
    "message": "Response text in Hebrew"
  },
  "metadata": {
    "intent": "contractor_search",
    "confidence": 0.95,
    "agents_used": ["router", "matching"],
    "tokens_used": 450,
    "duration_ms": 1200,
    "needs_human": false
  }
}
```

---

### POST /api/v1/agents/invoke

Invoke a specific agent directly.

**Request Body**:
```json
{
  "agent_name": "matching | pricing | support | vetting | analytics",
  "user_id": "string",
  "message": "string",
  "building_id": "string (optional)",
  "context": {}
}
```

---

### POST /api/v1/webhooks/whatsapp

Handle incoming WhatsApp messages.

**Request Body**: WhatsApp webhook payload (varies by provider)

**Response** (200):
```json
{
  "status": "processed"
}
```

---

### GET /api/v1/health/live

Liveness probe (no DB). Returns `{"status": "ok"}`. Use for k8s liveness.

### GET /api/v1/health

Readiness: health check for all services (vector_db, graph_db, redis, postgres). Use for k8s readiness.

**Response** (200):
```json
{
  "status": "healthy",
  "services": {
    "vector_db": true,
    "graph_db": true,
    "redis": true,
    "postgres": true
  }
}
```

---

### GET /api/v1/admin/status

Detailed system status (admin only).

**Response** (200):
```json
{
  "agents": {
    "router": {"model": "claude-sonnet-4-20250514", "calls": 150, "errors": 2},
    "matching": {"model": "claude-sonnet-4-20250514", "calls": 80, "errors": 0}
  },
  "vector_collections": {
    "contractors": {"points_count": 500, "status": "green"},
    "knowledge_base": {"points_count": 1200, "status": "green"}
  }
}
```

---

### GET /api/v1/admin/metrics

Prometheus-compatible metrics.

### GET /api/v1/admin/analytics

Dashboard analytics (admin only). Returns counts: open_tickets, total_contractors, gmv_today, active_offers, etc.

---

### POST /api/v1/admin/agents/{agent_name}/reload

Hot-reload an agent's configuration (admin).

**Response** (200):
```json
{
  "status": "reloaded",
  "agent": "matching"
}
```

---

### Escalations

- **POST /api/v1/escalations** – Create (body: source, priority, subject, description, etc.).
- **GET /api/v1/escalations** – List (admin); query: priority, status, page, page_size.
- **GET /api/v1/escalations/{id}** – Get one (admin).
- **POST /api/v1/escalations/{id}/resolve** – Resolve (admin). Body: `{ "resolution_notes"? }` or query `resolution_notes`.

### Offers

- **GET /api/v1/offers** – List; query: building_id, category, status, page, page_size.
- **POST /api/v1/offers** – Create (auth; resident in building).
- **GET /api/v1/offers/{id}** – Get one.
- **POST /api/v1/offers/{id}/join** – Join offer (auth).

### Contractors

- **GET /api/v1/contractors** – List; query: category, region, verification_status, page, page_size.
- **POST /api/v1/contractors** – Register contractor.
- **GET /api/v1/contractors/{id}** – Get one.

### Buildings

- **GET /api/v1/buildings** – List (auth).
- **GET /api/v1/buildings/{id}** – Get one (auth; resident or admin).

---

## Error Responses

| Status | Description |
|--------|------------|
| 400 | Invalid request body |
| 401 | Missing or invalid auth |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Internal server error |

```json
{
  "detail": "Error description"
}
```

---

## Operations

- **CORS**: Configure allowed origins for production (e.g. web and admin domains). See backend CORS middleware in `src/api/main.py`.
- **Feature flags**: Environment variables such as `ENABLE_WEB_SEARCH` control optional features; document in LOCAL_SETUP or env example.
