# API Reference

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Many endpoints require an `Authorization: Bearer <access_token>` header. The web app uses JSON login and stores the refresh token in an HTTP-only cookie.

### Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/auth/register | Register (JSON body: email, password, full_name, phone) |
| POST | /api/v1/auth/login | Login with form body (username, password) |
| POST | /api/v1/auth/login/json | **Login with JSON** (email, password). Use this from web/frontends. |
| POST | /api/v1/auth/refresh | Refresh access token; token in body or cookie `refresh_token` |
| POST | /api/v1/auth/logout | Logout (clears refresh cookie) |
| GET | /api/v1/auth/me | Current user (requires Bearer token) |

**Login JSON response** (200):
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600
}
```

---

## Pagination

List endpoints (e.g. offers, contractors, escalations) use query params:

- `page` (default 1), `page_size` (default 20, max 100)

Response shape:
```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "page_size": 20,
  "has_more": true
}
```

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

Hot-reload an agent's configuration.

**Response** (200):
```json
{
  "status": "reloaded",
  "agent": "matching"
}
```

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
