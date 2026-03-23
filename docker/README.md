# Docker Setup for Groupio

## Bootstrap

1. **Migrations**: Run automatically when the API starts (`alembic upgrade head` before uvicorn).

2. **Seed users** (required for login): Run inside the API container so it uses the same DB:
   ```bash
   docker compose -f docker/docker-compose.yml run --rm api python scripts/seed_user_accounts.py
   ```
   (From host against port-mapped Postgres: `python scripts/seed_user_accounts.py` — only if your 127.0.0.1:5432 is the Docker Postgres, not a local install.)
   Creates: tal.akalo@gmail.com / T220782al!@#, takalo878@gmail.com / T2207al!@#, etc.

   **Important:** This script seeds **only `users` rows** (accounts you can log in with). It does **not** insert buildings, offers, contractors, payments, or escalations. The admin app’s **Users** page will list those accounts; **Offers**, **Contractors**, **Buildings**, etc. will stay empty until you add more data.

3. **Optional — full demo data** (buildings, residents, contractors, offers, escalations):

   ```bash
   docker compose -f docker/docker-compose.yml run --rm api python scripts/seed_test_data.py
   ```

   Uses `@test.local` emails and password `TestSeed123!` (override with `SEED_TEST_PASSWORD`). Inspect counts with `--dry-run`. Safe to re-run: existing emails are skipped.

4. **Metrics**: `/metrics` returns 403 when `API_KEYS` is set (Prometheus must send auth). For local dev, set `API_KEYS=[]` in docker/.env to allow unauthenticated scraping.

## Run

```bash
docker compose -f docker/docker-compose.yml up -d
```
