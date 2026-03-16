# Groupio Operations Runbook

## Services Required
| Service     | Default Port | Required | Notes |
|-------------|-------------|----------|-------|
| PostgreSQL  | 5432        | Yes      | Primary datastore |
| Redis       | 6379        | Yes      | Rate limiting, sessions, caching |
| Qdrant      | 6333        | No       | Vector search (graceful degradation) |
| Neo4j       | 7687        | No       | Graph features (graceful degradation) |
| FastAPI     | 8000        | Yes      | Backend API |
| Next.js Web | 3000        | Yes      | Resident/contractor frontend |
| Next.js Admin| 3001       | Yes      | Admin dashboard |

## Health Checks
- `GET /api/v1/health` — returns service status for DB, Redis, Qdrant, Neo4j

## Startup Sequence
1. PostgreSQL + Redis (required)
2. Run migrations: `alembic upgrade head`
3. Start backend: `uvicorn src.api.main:app --host 0.0.0.0 --port 8000`
4. Start web: `pnpm --filter @groupio/web dev`
5. Start admin: `pnpm --filter @groupio/admin dev`

## Backup & Restore

### Database Backup
```bash
pg_dump -h localhost -U postgres -d groupio -F c -f backup_$(date +%Y%m%d).dump
```

### Database Restore
```bash
pg_restore -h localhost -U postgres -d groupio -c backup_YYYYMMDD.dump
```

### Redis Backup
Redis AOF is enabled. For manual snapshot:
```bash
redis-cli -a $REDIS_PASSWORD BGSAVE
```

## Incident Response

### Auth Failures (Redis Down)
- Rate limiting degrades gracefully (requests allowed without limit)
- Login/signup still work but without brute-force protection
- Fix: restart Redis container

### Payment Issues
- Check `PAYMENT_PROVIDER` env var (must be `stripe` in production)
- Check Stripe dashboard for failed webhooks
- Check `payments` table for stuck `processing` status

### Database Connection Issues
- Health endpoint returns `db: false`
- Check `DATABASE_URL` in environment
- Check PostgreSQL container/service status
- Run `alembic current` to verify migration state

## Environment Variables
See `.env.example` for full list. Critical production variables:
- `JWT_SECRET_KEY` (>= 32 chars, random)
- `DATABASE_URL` (real credentials, not defaults)
- `REDIS_PASSWORD` or REDIS_URL with embedded password
- `PAYMENT_PROVIDER=stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYMENT_WEBHOOK_SECRET`
- `ENVIRONMENT=production`
