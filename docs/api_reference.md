# API Reference

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All endpoints require an `Authorization` header:

```
Authorization: Bearer <api_key>
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
