# API Reference

## Base URL

All routes are under:

```
http://localhost:8000/api/v1
```

## Authentication

- **JWT (web/mobile):** `Authorization: Bearer <access_token>`. Obtain via `POST /auth/login` (form) or `POST /auth/login/json` (JSON).
- **Refresh:** `POST /auth/refresh` accepts `refresh_token` in body or in `refresh_token` HTTP-only cookie. Returns new `access_token` and sets cookie.
- **Admin:** Same JWT; require `role` in `admin` or `super_admin` for `/admin/*` and some list/update routes.

---

## Route groups

| Prefix | Description |
|--------|-------------|
| `/auth` | Signup, login (form + JSON), refresh, logout, me, password reset, verify email |
| `/offers` | List, create, get, update, join, leave; match (admin) |
| `/contractors` | List, create, get, update, stats, verify (admin), reviews |
| `/buildings` | List, create, get, update, delete, residents, invite |
| `/escalations` | Create, list, get, update, resolve, reopen, messages |
| `/agents` | Invoke agent (testing) |
| `/admin` | Status, metrics, collections, analytics; agent reload |
| `/webhooks` | WhatsApp incoming |

---

## Auth endpoints

### POST /api/v1/auth/signup

Register a new user (resident or contractor). Returns token for auto-login.

**Body:** `{ "name", "email", "phone", "password", "role": "resident" | "contractor", "buildingId?" }`

**Response (200):** `{ "token", "user" }`

### POST /api/v1/auth/login

Form login (OAuth2 form: `username`=email, `password`).

**Response (200):** `{ "access_token", "refresh_token", "expires_in" }`; sets `refresh_token` cookie.

### POST /api/v1/auth/login/json

JSON login (for SPA).

**Body:** `{ "email", "password" }`

**Response (200):** `{ "access_token", "refresh_token", "expires_in" }`; sets `refresh_token` cookie.

### POST /api/v1/auth/refresh

Refresh access token. Body: `{ "refresh_token"? }` or use cookie.

**Response (200):** `{ "access_token", "refresh_token", "expires_in" }`; sets cookie.

### POST /api/v1/auth/logout

Invalidate refresh token. Requires Bearer token.

### GET /api/v1/auth/me

Current user profile. Requires Bearer token.

### GET /api/v1/admin/analytics

Dashboard analytics (admin). Returns `gmvToday`, `activeOffers`, `openTickets`, `resolvedToday`, etc.

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

### GET /api/v1/health

Health check for all services.

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
