# Docker Setup for Groupio

## Bootstrap

1. **Migrations**: Run automatically when the API starts (`alembic upgrade head` before uvicorn).

2. **Seed users** (required for login): Run inside the API container so it uses the same DB:
   ```bash
   docker compose -f docker/docker-compose.yml run --rm api python scripts/seed_user_accounts.py
   ```
   (From host against port-mapped Postgres: `python scripts/seed_user_accounts.py` — only if your 127.0.0.1:5432 is the Docker Postgres, not a local install.)
   Set `SEED_PASSWORD_*` env vars before running (see `scripts/seed_user_accounts.py` docstring).

3. **Metrics**: `/metrics` returns 403 when `API_KEYS` is set (Prometheus must send auth). For local dev, set `API_KEYS=[]` in docker/.env to allow unauthenticated scraping.

## Run

```bash
docker compose -f docker/docker-compose.yml up -d
```
