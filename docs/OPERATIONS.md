# Operations and security

## Health checks

- **`GET /api/v1/health`** — Checks vector DB, graph DB, Redis, and Postgres. Returns `200` with `status: "healthy"` or `"degraded"` and a `services` map. Use for readiness; all dependencies are probed, so this is a **ready** check (not a simple liveness ping).
- For Kubernetes/Docker: use this single endpoint as the readiness probe. Optionally add a separate **liveness** endpoint (e.g. `GET /health/live` returning 200 with no DB checks) if you need to distinguish “process alive” from “ready to serve traffic.”

## CORS

Configure allowed origins for production. The FastAPI app uses CORSMiddleware; set `CORS_ORIGINS` (or equivalent) in env to the exact origins of your web and admin apps (e.g. `https://groupio.co.il`, `https://admin.groupio.co.il`). Avoid `*` in production. See `src/api/main.py` for the CORS setup.

## Secrets and logging

- **Do not log** access tokens, refresh tokens, passwords, or API keys. Audit `logger.*` and exception handlers to ensure only non-sensitive data (e.g. user id, email, path) is logged.
- Keep JWT and Redis secrets in environment variables; do not commit them.

## Auth rate limits

Consider applying stricter rate limits to auth routes (login, signup, password reset) than to general API routes (e.g. via a reverse proxy or rate-limiting middleware).

## Feature flags and env

Document feature flags and toggles in env (e.g. `USE_LOCAL_POSTGRES`, `ENABLE_WEB_SEARCH`, WhatsApp/email enablement) in [LOCAL_SETUP.md](./LOCAL_SETUP.md) or `.env.example` so operators know how to turn features on or off.
