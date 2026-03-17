#!/usr/bin/env python3
"""Quick diagnostic: verify DB and Redis connectivity for login/signup."""
import asyncio
import os
import sys

# Load .env from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dotenv import load_dotenv

load_dotenv()
load_dotenv("docker/.env")


async def main() -> None:
    print("Checking auth dependencies...\n")

    # 1. Database
    db_url = os.environ.get("DATABASE_URL", "")
    duser = os.environ.get("DOCKER_POSTGRES_USER") or os.environ.get("POSTGRES_USER", "postgres")
    dpw = os.environ.get("DOCKER_POSTGRES_PASSWORD") or os.environ.get("POSTGRES_PASSWORD", "postgres")
    ddb = os.environ.get("DOCKER_POSTGRES_DB") or os.environ.get("POSTGRES_DB", "groupio")
    use_local = (os.environ.get("USE_LOCAL_POSTGRES") or "").lower() in ("1", "true", "yes")
    # When targeting local/Docker Postgres from host, use 127.0.0.1
    if use_local and duser and ddb:
        from urllib.parse import quote_plus
        db_url = f"postgresql://{duser}:{quote_plus(dpw)}@127.0.0.1:5432/{ddb}"
    print(f"  Database: {'(Supabase)' if db_url and 'supabase' in db_url else '(PostgreSQL)'} ...", end=" ")
    try:
        import asyncpg

        url = db_url.replace("postgres://", "postgresql://", 1) if db_url.startswith("postgres://") else db_url
        if "localhost" in url:
            url = url.replace("localhost", "127.0.0.1")
        conn = await asyncpg.connect(url, timeout=5)
        await conn.execute("SELECT 1")
        # Schema readiness: users table must exist for login/signup
        row = await conn.fetchrow(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'users'"
        )
        await conn.close()
        if row:
            print("OK (schema ready)")
        else:
            print("OK (connected) — WARNING: users table missing. Run: alembic upgrade head")
    except Exception as e:
        print(f"FAILED: {e}")
        print("  → Ensure Postgres is running. For Supabase: check project not paused, credentials correct.")

    # 2. Redis
    redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379")
    print(f"  REDIS_URL: {redis_url.split('@')[-1] if '@' in redis_url else redis_url} ...", end=" ")
    try:
        import redis.asyncio as redis

        r = redis.from_url(redis_url, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        print("OK")
    except Exception as e:
        print(f"FAILED: {e}")
        print("  → Start Redis: docker compose -f docker/docker-compose.yml up -d redis")
        print("  → Or: redis-server (local)")

    # 3. JWT secret
    secret = os.environ.get("JWT_SECRET_KEY", "")
    print(f"  JWT_SECRET_KEY: {'set' if secret and len(secret) > 10 else 'MISSING'}")

    print("\nIf DB/Redis OK, restart the API after .env changes: uvicorn src.api.main:app --reload")


if __name__ == "__main__":
    asyncio.run(main())
