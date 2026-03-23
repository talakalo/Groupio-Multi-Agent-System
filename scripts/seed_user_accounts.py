#!/usr/bin/env python3
"""
Seed predefined user accounts for development and demo.

Usage:
    # Preferred: run inside API container (same DB as login):
    docker compose -f docker/docker-compose.yml run --rm api python scripts/seed_user_accounts.py

    # With Supabase (unset USE_LOCAL_POSTGRES or use SUPABASE_URL):
    python scripts/seed_user_accounts.py

    # Against Docker Postgres from host (127.0.0.1) — only if 127.0.0.1:5432 is Docker, not local Postgres:
    python scripts/seed_user_accounts.py

Creates **only user accounts** in Postgres (skips if email already exists). No buildings, offers,
or contractors — those are separate. For richer synthetic data see ``scripts/seed_test_data.py``
(writing to DB may need updates to match ``PostgresClient``).

Accounts (skips if email already exists):
- Buildings Manager: groupioappofficial@gmail.com / T2207al!@#
- Resident: takalo878@gmail.com / T2207al!@#
- Contractor: testusert612@gmail.com / T2207al!
- Super Admin: tal.akalo@gmail.com / T220782al!@#
"""

import asyncio
import os
import sys
from uuid import uuid4

# Ensure project root is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Require asyncpg when using local PostgreSQL
if os.environ.get("USE_LOCAL_POSTGRES", "").lower() in ("1", "true", "yes"):
    try:
        import asyncpg  # noqa: F401
    except ImportError:
        print("USE_LOCAL_POSTGRES=1 requires asyncpg. Install it with:")
        print("  pip install asyncpg")
        sys.exit(1)

from src.api.middleware.auth import hash_password
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.models.user import UserRole


ACCOUNTS = [
    {
        "email": "groupioappofficial@gmail.com",
        "password": "T2207al!@#",
        "full_name": "Buildings Manager",
        "phone": "0500000001",
        "role": UserRole.BUILDINGS_MANAGER,
    },
    {
        "email": "takalo878@gmail.com",
        "password": "T2207al!@#",
        "full_name": "Resident User",
        "phone": "0500000002",
        "role": UserRole.RESIDENT,
    },
    {
        "email": "testusert612@gmail.com",
        "password": "T2207al!",
        "full_name": "Contractor User",
        "phone": "0500000003",
        "role": UserRole.CONTRACTOR,
    },
    {
        "email": "tal.akalo@gmail.com",
        "password": "T220782al!@#",
        "full_name": "Super Admin",
        "phone": "0525140908",
        "role": UserRole.SUPER_ADMIN,
    },
]


async def seed_user_accounts() -> None:
    """Create predefined user accounts if they do not exist."""
    db = get_postgres_client()
    try:
        if not await db.health_check():
            raise RuntimeError("Database health check failed")
    except Exception as e:
        print("Database connection failed:", e)
        print("  Local PostgreSQL: start the server (e.g. brew services start postgresql@14)")
        print("  Docker Postgres from host: USE_LOCAL_POSTGRES=1 DOCKER_POSTGRES_LOCALHOST=1 python scripts/seed_user_accounts.py")
        print("  Or use Supabase: unset USE_LOCAL_POSTGRES and set SUPABASE_URL/SUPABASE_KEY in docker/.env")
        raise SystemExit(1) from e

    created = 0
    skipped = 0

    for acc in ACCOUNTS:
        email = acc["email"]
        existing = await db.get_user_by_email(email)
        if existing:
            print(f"  Skip (exists): {email} ({acc['role'].value})")
            skipped += 1
            continue

        user_id = str(uuid4())
        hashed = hash_password(acc["password"])
        user_data = {
            "id": user_id,
            "email": email,
            "full_name": acc["full_name"],
            "phone": acc["phone"],
            "role": acc["role"].value,
            "hashed_password": hashed,
            "is_active": True,
            "is_verified": True,
        }
        await db.create_user(user_data)
        print(f"  Created: {email} ({acc['role'].value})")
        created += 1

    print(f"\nDone. Created: {created}, Skipped (already exist): {skipped}")


def main() -> None:
    get_settings()
    print("Seeding user accounts...")
    asyncio.run(seed_user_accounts())


if __name__ == "__main__":
    main()
