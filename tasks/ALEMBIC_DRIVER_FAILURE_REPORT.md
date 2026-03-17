# Groupio Alembic Driver Failure Report

## 1. Root Cause

**Exact reason psycopg2 was required:**
- `alembic/env.py` uses `create_engine(database_url)` with a `postgresql://` URL.
- SQLAlchemy's `postgresql` dialect defaults to the **psycopg2** DBAPI driver.
- When `run_migrations_online()` runs, `create_engine()` attempts to `import psycopg2`.
- The Docker image is built from `requirements-prod.txt`, which did not include `psycopg2` or `psycopg2-binary`.

**Exact files:**
- `alembic/env.py` line 72–75: `create_engine(database_url, poolclass=pool.NullPool)`
- `requirements-prod.txt`: lacked psycopg2-binary

**Config/dependency mismatch:**
- **Dev** (`pyproject.toml`): `psycopg2-binary` is in the `dev` extra → local `pip install -e ".[dev]"` gets it.
- **Deploy** (`.github/workflows/deploy.yml`): explicitly runs `pip install alembic psycopg2-binary` before migrations.
- **Docker** (`requirements-prod.txt`): had `alembic` but not `psycopg2-binary` → migrations failed inside the container.

---

## 2. Fix Implemented

**Files changed:**
- `requirements-prod.txt`: added `psycopg2-binary>=2.9.0` under Databases, with a short comment.

**No changes to:**
- `alembic/env.py` (driver choice via URL is correct)
- `alembic.ini` / `alembic.docker.ini`
- `Dockerfile` (build uses `requirements-prod.txt`)

---

## 3. Driver Strategy

| Component        | Driver        | Reason |
|-----------------|---------------|--------|
| **App runtime** | asyncpg       | Async connection pool for FastAPI request handlers. |
| **Alembic**     | psycopg2      | SQLAlchemy `create_engine()` is sync; `postgresql://` maps to psycopg2. |

Both use the same `postgresql://` URL (host, port, database), connect to the same Postgres, and operate on the same schema. Alembic is run once at startup; the app then uses asyncpg for all request-time queries.

---

## 4. Validation

```bash
# Rebuild API image (includes psycopg2-binary)
docker compose -f docker/docker-compose.yml build api --no-cache

# Start dependencies
docker compose -f docker/docker-compose.yml up -d postgres redis qdrant neo4j

# Run API (runs alembic upgrade head then uvicorn)
docker compose -f docker/docker-compose.yml up api

# Expected: migrations run without ModuleNotFoundError; "Database connection verified" and schema ready
# Or run migrations manually inside container:
docker compose -f docker/docker-compose.yml run --rm api alembic upgrade head

# Verify users table
docker compose -f docker/docker-compose.yml exec postgres psql -U postgres -d groupio -c "\\dt users"
```

---

## 5. Remaining Risks

- **DB URL drift**: Alembic and the app both use the same env vars (`DOCKER_POSTGRES_*` / `DATABASE_URL`), so they target the same database.
- **Runtime vs migration consistency**: Both connect to the same Postgres; no remaining inconsistency.
