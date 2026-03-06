"""PostgreSQL/Supabase client for relational data operations."""

import json
import logging
import re
from collections.abc import AsyncIterator as _AsyncIterator
from contextlib import asynccontextmanager as _acm
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings
from src.models.user import UserInDB

# Regex for safe SQL column names (letters, digits, underscores)
_SAFE_COLUMN_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

logger = logging.getLogger(__name__)


def _compute_avg_resolution_hours(rows: list[dict]) -> float:
    """Compute average resolution time in hours from escalation rows."""
    total_seconds = 0.0
    count = 0
    for row in rows:
        created = row.get("created_at")
        resolved = row.get("resolved_at")
        if created and resolved:
            try:
                delta = resolved - created
                total_seconds += delta.total_seconds()
                count += 1
            except Exception:
                pass
    return (total_seconds / count / 3600) if count else 0.0


def _row_to_user(row: dict) -> dict:
    """Convert DB row to user dict (exclude hashed_password)."""
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "phone": row["phone"],
        "role": row["role"],
        "preferred_language": row.get("preferred_language") or "he",
        "is_active": row.get("is_active", True),
        "is_verified": row.get("is_verified", False),
        "avatar_url": row.get("avatar_url"),
        "building_id": row.get("building_id"),
        "contractor_id": row.get("contractor_id"),
        "last_login": row.get("last_login"),
        "created_at": row.get("created_at") or datetime.now(UTC),
        "updated_at": row.get("updated_at") or datetime.now(UTC),
    }


class PostgresClient:
    """PostgreSQL client with dual backend support.

    Connects to **Supabase** (PostgREST) when ``SUPABASE_URL`` and
    ``SUPABASE_KEY`` are set and ``USE_LOCAL_POSTGRES`` is not ``"1"``/``"true"``.
    Otherwise falls back to a local **asyncpg** connection pool.

    .. note::
        **Production** currently uses Supabase.  The asyncpg path is
        used in CI/testing and for local development.  Both paths are
        exercised in integration tests.

    Every public method contains an ``if self._use_supabase_client():``
    branch.  When adding new queries, always implement both branches.
    """

    def __init__(self) -> None:
        self._supabase_client: Any = None
        self._asyncpg_pool: Any = None
        self._use_supabase: bool | None = None

    def _use_supabase_client(self) -> bool:
        """Use Supabase when URL is set and USE_LOCAL_POSTGRES not set, else local PostgreSQL."""
        if self._use_supabase is None:
            settings = get_settings()
            force_local = (settings.USE_LOCAL_POSTGRES or "").lower() in ("1", "true", "yes")
            self._use_supabase = bool(settings.SUPABASE_URL and settings.SUPABASE_KEY and not force_local)
        return self._use_supabase

    async def _get_client(self) -> Any:
        """Lazily initialize the database client."""
        if self._use_supabase_client():
            if self._supabase_client is None:
                from supabase import acreate_client

                settings = get_settings()
                self._supabase_client = await acreate_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_KEY,
                )
            return self._supabase_client

        # Local PostgreSQL via asyncpg
        if self._asyncpg_pool is None:
            import asyncpg

            settings = get_settings()
            db_url = settings.DATABASE_URL
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            self._asyncpg_pool = await asyncpg.create_pool(
                db_url,
                min_size=5,
                max_size=25,
                max_inactive_connection_lifetime=300,
                command_timeout=60,
            )
        return self._asyncpg_pool

    async def _pg_fetch_one(self, query: str, *args: Any) -> dict | None:
        """Fetch one row via asyncpg."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None

    async def _pg_fetch_all(self, query: str, *args: Any) -> list[dict]:
        """Fetch all rows via asyncpg."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(r) for r in rows]

    @staticmethod
    def _build_safe_update(
        table: str, filtered: dict[str, Any], id_column: str, id_value: Any
    ) -> tuple[str, list[Any]]:
        """Build a safe parameterised UPDATE query.

        Validates that all column names are safe identifiers to prevent
        any SQL injection through column names.

        Returns:
            (query_string, args_list)
        """
        set_parts: list[str] = []
        args: list[Any] = []
        for i, (col, val) in enumerate(filtered.items(), 1):
            if not _SAFE_COLUMN_RE.match(col):
                raise ValueError(f"Unsafe column name: {col!r}")
            set_parts.append(f'"{col}" = ${i}')
            args.append(val)
        args.append(id_value)
        where_pos = len(args)
        query = f'UPDATE {table} SET {", ".join(set_parts)} WHERE "{id_column}" = ${where_pos}'
        return query, args

    async def close(self) -> None:
        """Gracefully close the database connection pool."""
        if self._asyncpg_pool is not None:
            await self._asyncpg_pool.close()
            self._asyncpg_pool = None

    async def _pg_execute(self, query: str, *args: Any) -> None:
        """Execute query via asyncpg."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            await conn.execute(query, *args)

    @_acm
    async def transaction(self) -> "_AsyncIterator[Any]":
        """Provide a transactional scope for multi-step DB operations.

        Usage::

            async with db.transaction() as conn:
                await conn.execute("INSERT INTO ...", ...)
                await conn.execute("UPDATE ...", ...)
                # auto-committed on success, rolled back on exception
        """
        if self._use_supabase_client():
            # Supabase client doesn't expose raw transactions; yield None
            # so callers fall back to individual requests.
            yield None
            return

        pool = await self._get_client()
        async with pool.acquire() as conn:
            async with conn.transaction():
                yield conn

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def execute_query(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        """Execute a raw SQL query."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.rpc("execute_sql", {"query": query, "params": params or {}}).execute()
            return result.data if result.data else []
        # Local PostgreSQL: execute with positional params
        # Convert $1-style placeholders - the query already uses them
        if params:
            # params dict values as positional args in order
            args = list(params.values())
            return await self._pg_fetch_all(query, *args)
        return await self._pg_fetch_all(query)

    async def get_user_profile(self, user_id: str) -> dict[str, Any] | None:
        """Get a user profile by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("*").eq("id", user_id).execute()
            return result.data[0] if result.data else None
        row = await self._pg_fetch_one("SELECT * FROM users WHERE id = $1", user_id)
        return row

    async def get_user_by_email(self, email: str) -> UserInDB | None:
        """Get user by email."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("*").eq("email", email).limit(1).execute()
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT * FROM users WHERE email = $1", email)
        return UserInDB(**_row_to_user(row)) if row else None

    async def get_user_by_phone(self, phone: str) -> UserInDB | None:
        """Get user by phone."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("*").eq("phone", phone).limit(1).execute()
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT * FROM users WHERE phone = $1", phone)
        return UserInDB(**_row_to_user(row)) if row else None

    async def get_user(self, user_id: str) -> UserInDB | None:
        """Get user by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("*").eq("id", user_id).limit(1).execute()
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT * FROM users WHERE id = $1", user_id)
        return UserInDB(**_row_to_user(row)) if row else None

    async def get_user_password_hash(self, user_id: str) -> str | None:
        """Get user password hash by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("hashed_password").eq("id", user_id).limit(1).execute()
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT hashed_password FROM users WHERE id = $1", user_id)
        return row["hashed_password"] if row else None

    async def create_user(self, user_data: dict[str, Any]) -> UserInDB:
        """Create a new user."""
        if self._use_supabase_client():
            client = await self._get_client()
            insert_data = {
                "id": user_data["id"],
                "email": user_data["email"],
                "hashed_password": user_data["hashed_password"],
                "full_name": user_data["full_name"],
                "phone": user_data["phone"],
                "role": user_data.get("role", "resident"),
                "preferred_language": user_data.get("preferred_language", "he"),
                "is_active": user_data.get("is_active", True),
                "is_verified": user_data.get("is_verified", False),
                "building_id": user_data.get("building_id"),
                "contractor_id": user_data.get("contractor_id"),
            }
            result = await client.table("users").insert(insert_data).execute()
            row = result.data[0] if result.data else None
        else:
            await self._pg_execute(
                """INSERT INTO users (id, email, hashed_password, full_name, phone, role,
                   preferred_language, is_active, is_verified, building_id, contractor_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)""",
                user_data["id"],
                user_data["email"],
                user_data["hashed_password"],
                user_data["full_name"],
                user_data["phone"],
                user_data.get("role", "resident"),
                user_data.get("preferred_language", "he"),
                user_data.get("is_active", True),
                user_data.get("is_verified", False),
                user_data.get("building_id"),
                user_data.get("contractor_id"),
            )
            row = await self._pg_fetch_one("SELECT * FROM users WHERE id = $1", user_data["id"])
        if not row:
            raise RuntimeError("Failed to create user")
        return UserInDB(**_row_to_user(row))

    async def update_user(self, user_id: str, update_data: dict[str, Any]) -> UserInDB:
        """Update user by ID."""
        allowed = {
            "full_name",
            "phone",
            "preferred_language",
            "avatar_url",
            "building_id",
            "contractor_id",
            "is_active",
            "is_verified",
            "last_login",
            "role",
            "onboarded_at",
        }
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            user = await self.get_user(user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")
            return user

        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").update(filtered).eq("id", user_id).execute()
            row = result.data[0] if result.data else None
        else:
            query, args = self._build_safe_update("users", filtered, "id", user_id)
            await self._pg_execute(query, *args)
            row = await self._pg_fetch_one("SELECT * FROM users WHERE id = $1", user_id)
        if row:
            return UserInDB(**_row_to_user(row))
        user = await self.get_user(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        return user

    async def update_user_password(self, user_id: str, hashed_password: str) -> None:
        """Update user password by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("users").update({"hashed_password": hashed_password}).eq("id", user_id).execute()
        else:
            await self._pg_execute(
                "UPDATE users SET hashed_password = $1 WHERE id = $2",
                hashed_password,
                user_id,
            )

    async def get_building(self, building_id: str) -> dict[str, Any] | None:
        """Get building details by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("buildings").select("*").eq("id", building_id).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM buildings WHERE id = $1", building_id)

    async def get_building_by_phone(self, phone: str) -> str | None:
        """Look up building ID from a phone number."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("building_id").eq("phone", phone).limit(1).execute()
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT building_id FROM users WHERE phone = $1", phone)
        return row["building_id"] if row and row.get("building_id") else None

    async def is_user_in_building(self, user_id: str, building_id: str) -> bool:
        """Check if user is a resident of the building (via users.building_id or building_residents)."""
        if self._use_supabase_client():
            client = await self._get_client()
            # Check users.building_id
            result = (
                await client.table("users")
                .select("id")
                .eq("id", user_id)
                .eq("building_id", building_id)
                .limit(1)
                .execute()
            )
            if result.data:
                return True
            # Check building_residents
            result = (
                await client.table("building_residents")
                .select("id")
                .eq("user_id", user_id)
                .eq("building_id", building_id)
                .limit(1)
                .execute()
            )
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM users WHERE id = $1 AND building_id = $2",
            user_id,
            building_id,
        )
        if row:
            return True
        row = await self._pg_fetch_one(
            "SELECT 1 FROM building_residents WHERE user_id = $1 AND building_id = $2",
            user_id,
            building_id,
        )
        return row is not None

    async def create_building(self, building_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new building."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("buildings").insert(building_data).execute()
            return result.data[0] if result.data else building_data
        await self._pg_execute(
            """INSERT INTO buildings (id, name, address, city, region, total_units, floors, year_built, admin_user_id,
               resident_count, active_offers, completed_offers, total_savings, whatsapp_group_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)""",
            building_data["id"],
            building_data["name"],
            building_data["address"],
            building_data["city"],
            building_data["region"],
            building_data.get("total_units", 0),
            building_data.get("floors", 1),
            building_data.get("year_built"),
            building_data["admin_user_id"],
            building_data.get("resident_count", 0),
            building_data.get("active_offers", 0),
            building_data.get("completed_offers", 0),
            building_data.get("total_savings", 0),
            building_data.get("whatsapp_group_id"),
        )
        return await self.get_building(building_data["id"]) or building_data

    async def list_buildings(
        self,
        filters: dict[str, Any],
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List buildings with optional filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("buildings").select("*", count="exact")
            if filters.get("city"):
                q = q.eq("city", filters["city"])
            if filters.get("region"):
                q = q.eq("region", filters["region"])
            if filters.get("user_id"):
                q = q.eq("admin_user_id", filters["user_id"])
            q = q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1)
            result = await q.execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        if filters.get("city"):
            args.append(filters["city"])
            where_parts.append("city = $%d" % len(args))
        if filters.get("region"):
            args.append(filters["region"])
            where_parts.append("region = $%d" % len(args))
        if filters.get("user_id"):
            args.append(filters["user_id"])
            args.append(filters["user_id"])
            where_parts.append(
                "(admin_user_id = $%d OR id IN (SELECT building_id FROM building_residents WHERE user_id = $%d))"
                % (len(args) - 1, len(args))
            )
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM buildings WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM buildings WHERE " + where_sql + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def update_building(self, building_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update a building."""
        allowed = {
            "name",
            "address",
            "city",
            "region",
            "total_units",
            "floors",
            "year_built",
            "whatsapp_group_id",
            "resident_count",
            "active_offers",
            "completed_offers",
            "total_savings",
        }
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            b = await self.get_building(building_id)
            return b or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("buildings").update(filtered).eq("id", building_id).execute()
        else:
            query, args = self._build_safe_update("buildings", filtered, "id", building_id)
            await self._pg_execute(query, *args)
        return await self.get_building(building_id) or {}

    async def delete_building(self, building_id: str) -> None:
        """Delete a building (and resident links). Caller must check count_active_offers first."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("building_residents").delete().eq("building_id", building_id).execute()
            await client.table("buildings").delete().eq("id", building_id).execute()
        else:
            await self._pg_execute("DELETE FROM building_residents WHERE building_id = $1", building_id)
            await self._pg_execute("DELETE FROM buildings WHERE id = $1", building_id)

    async def add_resident_to_building(
        self,
        user_id: str,
        building_id: str,
        unit_number: str,
        floor: int,
        is_owner: bool = True,
    ) -> dict[str, Any]:
        """Add a resident to a building."""
        from uuid import uuid4

        rid = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("building_residents")
                .insert(
                    {
                        "id": rid,
                        "user_id": user_id,
                        "building_id": building_id,
                        "unit_number": unit_number,
                        "floor": floor,
                        "is_owner": is_owner,
                    }
                )
                .execute()
            )
            return result.data[0] if result.data else {}
        await self._pg_execute(
            "INSERT INTO building_residents "
            "(id, user_id, building_id, unit_number, floor, is_owner) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            rid,
            user_id,
            building_id,
            unit_number,
            floor,
            is_owner,
        )
        return {
            "id": rid,
            "user_id": user_id,
            "building_id": building_id,
            "unit_number": unit_number,
            "floor": floor,
            "is_owner": is_owner,
        }

    async def remove_resident_from_building(self, user_id: str, building_id: str) -> None:
        """Remove a resident from a building."""
        if self._use_supabase_client():
            client = await self._get_client()
            await (
                client.table("building_residents")
                .delete()
                .eq("user_id", user_id)
                .eq("building_id", building_id)
                .execute()
            )
        else:
            await self._pg_execute(
                "DELETE FROM building_residents WHERE user_id = $1 AND building_id = $2",
                user_id,
                building_id,
            )

    async def get_building_residents(
        self, building_id: str, page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """List residents of a building. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("building_residents")
                .select("*, users(id, full_name, email, phone)")
                .eq("building_id", building_id)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            count = (
                await client.table("building_residents")
                .select("id", count="exact")
                .eq("building_id", building_id)
                .limit(1)
                .execute()
            )
            total = getattr(count, "count", len(result.data or []))
            return (result.data or [], total if isinstance(total, int) else len(result.data or []))
        total_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM building_residents WHERE building_id = $1", building_id
        )
        total = total_row["c"] if total_row else 0
        rows = await self._pg_fetch_all(
            "SELECT br.*, u.full_name, u.email, u.phone "
            "FROM building_residents br "
            "JOIN users u ON u.id = br.user_id "
            "WHERE br.building_id = $1 "
            "ORDER BY br.joined_at DESC LIMIT $2 OFFSET $3",
            building_id,
            page_size,
            (page - 1) * page_size,
        )
        return (rows or [], total)

    async def is_unit_taken(self, building_id: str, unit_number: str) -> bool:
        """Check if a unit number is already taken in the building."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("building_residents")
                .select("id")
                .eq("building_id", building_id)
                .eq("unit_number", unit_number)
                .limit(1)
                .execute()
            )
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM building_residents WHERE building_id = $1 AND unit_number = $2",
            building_id,
            unit_number,
        )
        return row is not None

    async def count_active_offers(self, building_id: str) -> int:
        """Count active offers for a building."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("offers")
                .select("id", count="exact")
                .eq("building_id", building_id)
                .eq("status", "active")
                .execute()
            )
            return getattr(result, "count", 0) or 0
        row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM offers WHERE building_id = $1 AND status = 'active'",
            building_id,
        )
        return row["c"] if row else 0

    async def get_building_stats(self, building_id: str) -> dict[str, Any]:
        """Get aggregate stats for a building."""
        b = await self.get_building(building_id)
        if not b:
            return {}
        active = await self.count_active_offers(building_id)
        residents_row = (
            await self._pg_fetch_one("SELECT COUNT(*) AS c FROM building_residents WHERE building_id = $1", building_id)
            if not self._use_supabase_client()
            else None
        )
        resident_count = residents_row["c"] if residents_row else b.get("resident_count", 0)
        if self._use_supabase_client():
            client = await self._get_client()
            r = (
                await client.table("building_residents")
                .select("id", count="exact")
                .eq("building_id", building_id)
                .limit(1)
                .execute()
            )
            resident_count = getattr(r, "count", resident_count) or resident_count
        return {
            "building_id": building_id,
            "resident_count": resident_count,
            "active_offers": active,
            "completed_offers": b.get("completed_offers", 0),
            "total_savings": b.get("total_savings", 0),
        }

    async def create_invitation(
        self,
        building_id: str,
        email: str,
        invited_by: str,
        status: str = "pending",
        expires_at: Any = None,
    ) -> dict[str, Any]:
        """Create an invitation to join a building."""
        from uuid import uuid4

        inv_id = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("invitations")
                .insert(
                    {
                        "id": inv_id,
                        "building_id": building_id,
                        "email": email,
                        "invited_by": invited_by,
                        "status": status,
                        "expires_at": expires_at,
                    }
                )
                .execute()
            )
            return result.data[0] if result.data else {}
        await self._pg_execute(
            "INSERT INTO invitations "
            "(id, building_id, email, invited_by, status, expires_at) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            inv_id,
            building_id,
            email,
            invited_by,
            status,
            expires_at,
        )
        return {
            "id": inv_id,
            "building_id": building_id,
            "email": email,
            "invited_by": invited_by,
            "status": status,
            "expires_at": expires_at,
        }

    async def get_active_offers(self, building_id: str) -> list[dict[str, Any]]:
        """Get active offers for a building."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("offers")
                .select("*, contractors(business_name, rating, verified)")
                .eq("building_id", building_id)
                .eq("status", "active")
                .order("created_at", desc=True)
                .execute()
            )
            return result.data or []
        rows = await self._pg_fetch_all(
            """SELECT o.* FROM offers o
               WHERE o.building_id = $1 AND o.status = 'active'
               ORDER BY o.created_at DESC""",
            building_id,
        )
        return rows or []

    async def create_offer(self, offer_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offers").insert(offer_data).execute()
            return result.data[0] if result.data else offer_data
        await self._pg_execute(
            """INSERT INTO offers (id, title, description, category, base_price, min_participants, max_participants,
               deadline, building_id, created_by, status, current_participants, matched_contractor_id, pricing_tiers)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)""",
            offer_data["id"],
            offer_data["title"],
            offer_data["description"],
            offer_data["category"],
            offer_data["base_price"],
            offer_data.get("min_participants", 5),
            offer_data.get("max_participants", 50),
            offer_data.get("deadline"),
            offer_data["building_id"],
            offer_data["created_by"],
            offer_data.get("status", "draft"),
            offer_data.get("current_participants", 0),
            offer_data.get("matched_contractor_id"),
            offer_data.get("pricing_tiers") or [],
        )
        return await self.get_offer(offer_data["id"]) or offer_data

    async def list_offers(
        self,
        filters: dict[str, Any],
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List offers with optional filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("offers").select("*", count="exact")
            if filters.get("building_id"):
                q = q.eq("building_id", filters["building_id"])
            if filters.get("category"):
                q = q.eq("category", filters["category"])
            if filters.get("status"):
                q = q.eq("status", filters["status"])
            result = (
                await q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        if filters.get("building_id"):
            args.append(filters["building_id"])
            where_parts.append("building_id = $%d" % len(args))
        if filters.get("category"):
            args.append(filters["category"])
            where_parts.append("category = $%d" % len(args))
        if filters.get("status"):
            args.append(filters["status"])
            where_parts.append("status = $%d" % len(args))
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM offers WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM offers WHERE " + where_sql + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def get_offer(self, offer_id: str) -> dict[str, Any] | None:
        """Get a single offer by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offers").select("*").eq("id", offer_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM offers WHERE id = $1", offer_id)

    async def update_offer(self, offer_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update an offer."""
        allowed = {
            "title",
            "description",
            "category",
            "base_price",
            "min_participants",
            "max_participants",
            "deadline",
            "status",
            "current_participants",
            "matched_contractor_id",
            "pricing_tiers",
        }
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return await self.get_offer(offer_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("offers").update(filtered).eq("id", offer_id).execute()
        else:
            query, args = self._build_safe_update("offers", filtered, "id", offer_id)
            await self._pg_execute(query, *args)
        return await self.get_offer(offer_id) or {}

    async def has_user_joined_offer(self, user_id: str, offer_id: str) -> bool:
        """Check if user has already joined the offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("offer_participants")
                .select("id")
                .eq("user_id", user_id)
                .eq("offer_id", offer_id)
                .limit(1)
                .execute()
            )
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM offer_participants WHERE user_id = $1 AND offer_id = $2",
            user_id,
            offer_id,
        )
        return row is not None

    async def join_offer(self, user_id: str, offer_id: str, unit_count: int = 1) -> None:
        """Add user as participant and increment current_participants (atomic)."""
        pid = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            # Atomic Postgres function eliminates the read-modify-write race
            await client.rpc(
                "join_offer_atomic",
                {
                    "p_id": pid,
                    "p_offer_id": offer_id,
                    "p_user_id": user_id,
                    "p_unit_count": unit_count,
                },
            ).execute()
        else:
            pool = await self._get_client()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        "INSERT INTO offer_participants (id, offer_id, user_id, unit_count) VALUES ($1, $2, $3, $4)",
                        pid,
                        offer_id,
                        user_id,
                        unit_count,
                    )
                    result = await conn.execute(
                        "UPDATE offers SET current_participants = current_participants + $1 "
                        "WHERE id = $2 AND status IN ('pending', 'matching') "
                        "AND current_participants < max_participants",
                        unit_count,
                        offer_id,
                    )
                    if result == "UPDATE 0":
                        raise ValueError("Offer not joinable, full, or does not exist")

    async def leave_offer(self, user_id: str, offer_id: str) -> None:
        """Remove user from offer and decrement current_participants (atomic)."""
        if self._use_supabase_client():
            client = await self._get_client()
            part = (
                await client.table("offer_participants")
                .select("unit_count")
                .eq("user_id", user_id)
                .eq("offer_id", offer_id)
                .limit(1)
                .execute()
            )
            uc = part.data[0]["unit_count"] if part.data else 1
            await client.table("offer_participants").delete().eq("user_id", user_id).eq("offer_id", offer_id).execute()
            offer = await self.get_offer(offer_id)
            cur = max(0, ((offer.get("current_participants") or 0) if offer is not None else 0) - uc)
            await client.table("offers").update({"current_participants": cur}).eq("id", offer_id).execute()
        else:
            pool = await self._get_client()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    row = await conn.fetchrow(
                        "SELECT unit_count FROM offer_participants WHERE user_id = $1 AND offer_id = $2 FOR UPDATE",
                        user_id,
                        offer_id,
                    )
                    uc = row["unit_count"] if row else 1
                    await conn.execute(
                        "DELETE FROM offer_participants WHERE user_id = $1 AND offer_id = $2",
                        user_id,
                        offer_id,
                    )
                    await conn.execute(
                        "UPDATE offers SET current_participants = GREATEST(0, current_participants - $1) WHERE id = $2",
                        uc,
                        offer_id,
                    )

    async def get_offer_participants(self, offer_id: str) -> list[dict[str, Any]]:
        """Get all participants of an offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("offer_participants")
                .select("*, users(id, full_name, email)")
                .eq("offer_id", offer_id)
                .execute()
            )
            return result.data or []
        return (
            await self._pg_fetch_all(
                "SELECT op.*, u.full_name, u.email "
                "FROM offer_participants op "
                "JOIN users u ON u.id = op.user_id "
                "WHERE op.offer_id = $1",
                offer_id,
            )
            or []
        )

    async def get_user_orders(self, user_id: str, limit: int = 5) -> list[dict[str, Any]]:
        """Get recent orders for a user."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("orders")
                .select("*, contractors(business_name), buildings(address)")
                .eq("resident_id", user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data or []
        return []

    async def get_market_data(self, category: str, region: str, months: int = 6) -> dict[str, Any]:
        """Get market pricing data for a category and region."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.rpc(
                "get_market_data",
                {"p_category": category, "p_region": region, "p_months": months},
            ).execute()
            if result.data and len(result.data) > 0:
                return result.data[0]
        return {
            "avg_price": 0,
            "median_price": 0,
            "min_price": 0,
            "max_price": 0,
            "price_stddev": 0,
            "avg_participants": 0,
            "sample_size": 0,
        }

    async def create_support_ticket(self, ticket_data: dict[str, Any]) -> dict[str, Any]:
        """Create a support ticket for human escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("support_tickets").insert(ticket_data).execute()
            return result.data[0] if result.data else ticket_data
        return ticket_data

    async def log_conversation(
        self,
        user_id: str,
        message: str,
        response: dict,
        metadata: dict,
    ) -> None:
        """Log a conversation exchange."""
        if self._use_supabase_client():
            client = await self._get_client()
            await (
                client.table("conversation_logs")
                .insert(
                    {
                        "user_id": user_id,
                        "message": message,
                        "response": response,
                        "metadata": metadata,
                    }
                )
                .execute()
            )
        else:
            await self._pg_execute(
                """INSERT INTO conversation_logs (id, user_id, message, response, metadata)
                   VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)""",
                str(uuid4()),
                user_id,
                message,
                json.dumps(response),
                json.dumps(metadata),
            )

    async def get_conversation_history(
        self,
        user_id: str,
        limit: int = 50,
        before: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return (items, total) for a user's conversation_logs.

        Each row represents one exchange (user message + assistant response).
        ``before`` is an ISO-8601 timestamp used as an exclusive upper bound for
        cursor-based pagination (oldest-first, so "before" means "created_at <").
        """
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("conversation_logs").select("*", count="exact").eq("user_id", user_id)
            if before:
                q = q.lt("created_at", before)
            q = q.order("created_at", desc=False).limit(limit)
            result = await q.execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)

        # Raw postgres path
        args: list[Any] = [user_id]
        extra = ""
        if before:
            args.append(before)
            extra = f" AND created_at < ${len(args)}"
        count_row = await self._pg_fetch_one(
            f"SELECT COUNT(*) AS c FROM conversation_logs WHERE user_id = $1{extra}", *args
        )
        total = count_row["c"] if count_row else 0
        args.append(limit)
        rows = await self._pg_fetch_all(
            f"SELECT * FROM conversation_logs WHERE user_id = $1{extra} ORDER BY created_at ASC LIMIT ${len(args)}",
            *args,
        )
        return (rows or [], total)

    async def create_contractor(self, contractor_data: dict[str, Any], password: str) -> dict[str, Any]:
        """Create a contractor (user + contractor row)."""
        from uuid import uuid4

        from src.api.middleware.auth import hash_password

        contractor_id = contractor_data.get("id") or str(uuid4())
        user_id = str(uuid4())
        hashed = hash_password(password)
        categories = contractor_data.get("categories") or []
        regions = contractor_data.get("regions") or []
        if categories and hasattr(categories[0], "value"):
            categories = [c.value for c in categories]
        if regions and hasattr(regions[0], "value"):
            regions = [r.value for r in regions]
        user_data = {
            "id": user_id,
            "email": contractor_data["email"],
            "hashed_password": hashed,
            "full_name": contractor_data.get("contact_name", contractor_data.get("business_name", "")),
            "phone": contractor_data["phone"],
            "role": "contractor",
            "is_active": True,
            "is_verified": False,
            "contractor_id": contractor_id,
        }
        await self.create_user(user_data)
        row = {
            "id": contractor_id,
            "user_id": user_id,
            "business_name": contractor_data["business_name"],
            "contact_name": contractor_data.get("contact_name", contractor_data["business_name"]),
            "email": contractor_data["email"],
            "phone": contractor_data["phone"],
            "description": contractor_data.get("description", ""),
            "categories": categories,
            "regions": regions,
            "years_experience": contractor_data.get("years_experience", 0),
            "employee_count": contractor_data.get("employee_count", 1),
            "website": contractor_data.get("website"),
            "verification_status": contractor_data.get("verification_status", "pending"),
            "trust_score": contractor_data.get("trust_score", 0),
            "license_number": contractor_data.get("license_number"),
        }
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractors").insert(row).execute()
            return result.data[0] if result.data else row
        await self._pg_execute(
            """INSERT INTO contractors
               (id, user_id, business_name, contact_name, email,
                phone, description, categories, regions,
                years_experience, employee_count, website,
                verification_status, trust_score, license_number)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                       $10, $11, $12, $13, $14, $15)""",
            row["id"],
            row["user_id"],
            row["business_name"],
            row["contact_name"],
            row["email"],
            row["phone"],
            row["description"],
            row["categories"],
            row["regions"],
            row["years_experience"],
            row["employee_count"],
            row["website"],
            row["verification_status"],
            row["trust_score"],
            row["license_number"],
        )
        return await self.get_contractor(contractor_id) or row

    async def list_contractors(
        self, filters: dict[str, Any], page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """List contractors with optional filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("contractors").select("*", count="exact")
            if filters.get("category") or filters.get("categories"):
                cat = filters.get("category") or (filters.get("categories") or [None])[0]
                if cat:
                    q = q.contains("categories", [cat])
            if filters.get("region") or filters.get("regions"):
                reg = filters.get("region") or (filters.get("regions") or [None])[0]
                if reg:
                    q = q.contains("regions", [reg])
            if filters.get("min_trust_score") is not None:
                q = q.gte("trust_score", filters["min_trust_score"])
            if filters.get("verification_status"):
                q = q.eq("verification_status", filters["verification_status"])
            result = (
                await q.order("trust_score", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        if filters.get("category") or filters.get("categories"):
            c = filters.get("category") or (filters.get("categories") or [None])[0]
            if c:
                args.append(c)
                where_parts.append("$%d = ANY(categories)" % len(args))
        if filters.get("region") or filters.get("regions"):
            r = filters.get("region") or (filters.get("regions") or [None])[0]
            if r:
                args.append(r)
                where_parts.append("$%d = ANY(regions)" % len(args))
        if filters.get("min_trust_score") is not None:
            args.append(filters["min_trust_score"])
            where_parts.append("trust_score >= $%d" % len(args))
        if filters.get("verification_status"):
            args.append(filters["verification_status"])
            where_parts.append("verification_status = $%d" % len(args))
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM contractors WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM contractors WHERE "
            + where_sql
            + " ORDER BY trust_score DESC NULLS LAST LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def get_contractor(self, contractor_id: str) -> dict[str, Any] | None:
        """Get a single contractor by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractors").select("*").eq("id", contractor_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM contractors WHERE id = $1", contractor_id)

    async def get_contractors_by_ids(self, contractor_ids: list[str]) -> list[dict[str, Any]]:
        """Get contractors by list of IDs (preserve order)."""
        if not contractor_ids:
            return []
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractors").select("*").in_("id", contractor_ids).execute()
            data = result.data or []
            order = {cid: i for i, cid in enumerate(contractor_ids)}
            return sorted(data, key=lambda x: order.get(x["id"], 999))
        placeholders = ", ".join("$%d" % (i + 1) for i in range(len(contractor_ids)))
        rows = await self._pg_fetch_all("SELECT * FROM contractors WHERE id IN (" + placeholders + ")", *contractor_ids)
        order = {cid: i for i, cid in enumerate(contractor_ids)}
        return sorted(rows or [], key=lambda x: order.get(x["id"], 999))

    async def update_contractor(self, contractor_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update a contractor."""
        allowed = {
            "business_name",
            "contact_name",
            "phone",
            "description",
            "categories",
            "regions",
            "years_experience",
            "employee_count",
            "website",
            "verification_status",
            "trust_score",
            "trust_score_breakdown",
            "license_number",
            "license_verified",
            "insurance_expiry",
            "insurance_verified",
            "certifications",
            "average_rating",
            "total_reviews",
            "completed_projects",
            "response_rate",
            "average_response_time_hours",
        }
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return await self.get_contractor(contractor_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("contractors").update(filtered).eq("id", contractor_id).execute()
        else:
            query, args = self._build_safe_update("contractors", filtered, "id", contractor_id)
            await self._pg_execute(query, *args)
        return await self.get_contractor(contractor_id) or {}

    async def get_contractor_reviews(
        self, contractor_id: str, page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """List reviews for a contractor. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("contractor_reviews")
                .select("*", count="exact")
                .eq("contractor_id", contractor_id)
                .order("created_at", desc=True)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        count_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM contractor_reviews WHERE contractor_id = $1", contractor_id
        )
        total = count_row["c"] if count_row else 0
        rows = await self._pg_fetch_all(
            "SELECT * FROM contractor_reviews WHERE contractor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            contractor_id,
            page_size,
            (page - 1) * page_size,
        )
        return (rows or [], total)

    async def has_user_completed_offer_with_contractor(self, user_id: str, contractor_id: str) -> bool:
        """Check if user has completed an offer with this contractor (e.g. can leave review)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("contractor_reviews")
                .select("id")
                .eq("user_id", user_id)
                .eq("contractor_id", contractor_id)
                .limit(1)
                .execute()
            )
            if result.data:
                return True
            result = (
                await client.table("offer_participants")
                .select("op.id")
                .eq("op.user_id", user_id)
                .eq("o.matched_contractor_id", contractor_id)
                .execute()
            )
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM offer_participants op "
            "JOIN offers o ON o.id = op.offer_id "
            "WHERE op.user_id = $1 "
            "AND o.matched_contractor_id = $2 "
            "AND o.status = 'completed' LIMIT 1",
            user_id,
            contractor_id,
        )
        return row is not None

    async def create_review(self, review_data: dict[str, Any]) -> dict[str, Any]:
        """Create a contractor review."""
        from uuid import uuid4

        rid = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_reviews").insert({**review_data, "id": rid}).execute()
            return result.data[0] if result.data else {**review_data, "id": rid}
        await self._pg_execute(
            "INSERT INTO contractor_reviews "
            "(id, contractor_id, user_id, offer_id, rating, comment) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            rid,
            review_data["contractor_id"],
            review_data["user_id"],
            review_data["offer_id"],
            review_data["rating"],
            review_data.get("comment"),
        )
        return {**review_data, "id": rid}

    async def update_contractor_rating(self, contractor_id: str) -> None:
        """Recalculate and update contractor average_rating and total_reviews."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("contractor_reviews").select("rating").eq("contractor_id", contractor_id).execute()
            )
            reviews = result.data or []
            if not reviews:
                return
            avg = sum(r["rating"] for r in reviews) / len(reviews)
            await (
                client.table("contractors")
                .update({"average_rating": avg, "total_reviews": len(reviews)})
                .eq("id", contractor_id)
                .execute()
            )
        else:
            row = await self._pg_fetch_one(
                "SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM contractor_reviews WHERE contractor_id = $1",
                contractor_id,
            )
            if row and row["cnt"]:
                await self._pg_execute(
                    "UPDATE contractors SET average_rating = $1, total_reviews = $2 WHERE id = $3",
                    float(row["avg"]),
                    row["cnt"],
                    contractor_id,
                )

    async def get_contractor_stats(self, contractor_id: str) -> dict[str, Any]:
        """Get aggregate stats for a contractor."""
        c = await self.get_contractor(contractor_id)
        if not c:
            return {}
        return {
            "contractor_id": contractor_id,
            "active_offers": 0,
            "completed_projects": c.get("completed_projects", 0),
            "total_revenue": 0,
            "average_rating": c.get("average_rating", 0),
            "trust_score": c.get("trust_score", 0),
            "total_reviews": c.get("total_reviews", 0),
        }

    async def create_escalation(self, escalation_data: dict[str, Any]) -> dict[str, Any]:
        """Create an escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalations").insert(escalation_data).execute()
            return result.data[0] if result.data else escalation_data
        await self._pg_execute(
            """INSERT INTO escalations
               (id, user_id, conversation_id, source_agent,
                reason, priority, summary, status, assigned_to,
                context, agent_reasoning, resolution_notes,
                resolved_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                       $10, $11, $12, $13)""",
            escalation_data["id"],
            escalation_data["user_id"],
            escalation_data["conversation_id"],
            escalation_data["source_agent"],
            escalation_data["reason"],
            escalation_data.get("priority", "medium"),
            escalation_data["summary"],
            escalation_data.get("status", "open"),
            escalation_data.get("assigned_to"),
            escalation_data.get("context") or {},
            escalation_data.get("agent_reasoning"),
            escalation_data.get("resolution_notes"),
            escalation_data.get("resolved_at"),
        )
        return await self.get_escalation(escalation_data["id"]) or escalation_data

    async def list_escalations(
        self, filters: dict[str, Any], page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """List escalations with filters. Returns (items, total).

        Filter values may be a single string or a list of strings for
        multi-value filtering (e.g. status=["open","in_progress"]).
        """
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("escalations").select("*", count="exact")
            for col in ("status", "priority", "source_agent", "reason"):
                val = filters.get(col)
                if val:
                    if isinstance(val, list):
                        q = q.in_(col, val)
                    else:
                        q = q.eq(col, val)
            if filters.get("assigned_to"):
                q = q.eq("assigned_to", filters["assigned_to"])
            if filters.get("date_from"):
                q = q.gte("created_at", filters["date_from"].isoformat())
            if filters.get("date_to"):
                q = q.lte("created_at", filters["date_to"].isoformat())
            result = (
                await q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        for col in ("status", "priority", "source_agent", "reason"):
            val = filters.get(col)
            if val:
                if isinstance(val, list):
                    placeholders = ", ".join("$%d" % (len(args) + i + 1) for i in range(len(val)))
                    args.extend(val)
                    where_parts.append("%s IN (%s)" % (col, placeholders))
                else:
                    args.append(val)
                    where_parts.append("%s = $%d" % (col, len(args)))
        if filters.get("assigned_to"):
            args.append(filters["assigned_to"])
            where_parts.append("assigned_to = $%d" % len(args))
        if filters.get("date_from"):
            args.append(filters["date_from"])
            where_parts.append("created_at >= $%d" % len(args))
        if filters.get("date_to"):
            args.append(filters["date_to"])
            where_parts.append("created_at <= $%d" % len(args))
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM escalations WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM escalations WHERE "
            + where_sql
            + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def get_escalation(self, escalation_id: str) -> dict[str, Any] | None:
        """Get a single escalation by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalations").select("*").eq("id", escalation_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM escalations WHERE id = $1", escalation_id)

    async def update_escalation(self, escalation_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update an escalation."""
        allowed = {"status", "priority", "assigned_to", "context", "resolution_notes", "resolved_at"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return await self.get_escalation(escalation_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("escalations").update(filtered).eq("id", escalation_id).execute()
        else:
            query, args = self._build_safe_update("escalations", filtered, "id", escalation_id)
            await self._pg_execute(query, *args)
        return await self.get_escalation(escalation_id) or {}

    async def get_escalation_stats(self) -> dict[str, Any]:
        """Get escalation statistics matching the EscalationStats response model."""
        from datetime import date

        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=UTC)

        if self._use_supabase_client():
            client = await self._get_client()
            open_r = await client.table("escalations").select("id", count="exact").eq("status", "open").execute()
            in_progress_r = (
                await client.table("escalations").select("id", count="exact").eq("status", "in_progress").execute()
            )
            resolved_today_r = (
                await client.table("escalations")
                .select("id", count="exact")
                .eq("status", "resolved")
                .gte("resolved_at", today_start.isoformat())
                .execute()
            )
            # Priority breakdown
            by_priority: dict[str, int] = {}
            for prio in ("low", "medium", "high", "critical"):
                r = await client.table("escalations").select("id", count="exact").eq("priority", prio).execute()
                cnt = getattr(r, "count", 0) or 0
                if cnt:
                    by_priority[prio] = cnt
            # Source breakdown
            by_source: dict[str, int] = {}
            for src in ("router", "matching", "pricing", "vetting", "support", "outreach", "analytics", "system"):
                r = await client.table("escalations").select("id", count="exact").eq("source_agent", src).execute()
                cnt = getattr(r, "count", 0) or 0
                if cnt:
                    by_source[src] = cnt
            # Resolution time (avg hours for resolved)
            res_time_r = (
                await client.table("escalations").select("created_at,resolved_at").eq("status", "resolved").execute()
            )
            avg_hours = _compute_avg_resolution_hours(res_time_r.data or [])
            return {
                "total_open": getattr(open_r, "count", 0) or 0,
                "total_in_progress": getattr(in_progress_r, "count", 0) or 0,
                "total_resolved_today": getattr(resolved_today_r, "count", 0) or 0,
                "average_resolution_time_hours": avg_hours,
                "by_priority": by_priority,
                "by_source": by_source,
                "by_reason": {},
            }
        # asyncpg path
        open_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM escalations WHERE status = 'open'")
        in_progress_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM escalations WHERE status = 'in_progress'")
        resolved_today_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM escalations WHERE status = 'resolved' AND resolved_at >= $1",
            today_start,
        )
        avg_row = await self._pg_fetch_one(
            "SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) AS avg_h "
            "FROM escalations WHERE status = 'resolved' AND resolved_at IS NOT NULL"
        )
        priority_rows = await self._pg_fetch_all("SELECT priority, COUNT(*) AS c FROM escalations GROUP BY priority")
        source_rows = await self._pg_fetch_all(
            "SELECT source_agent, COUNT(*) AS c FROM escalations GROUP BY source_agent"
        )
        reason_rows = await self._pg_fetch_all("SELECT reason, COUNT(*) AS c FROM escalations GROUP BY reason")
        return {
            "total_open": open_row["c"] if open_row else 0,
            "total_in_progress": in_progress_row["c"] if in_progress_row else 0,
            "total_resolved_today": resolved_today_row["c"] if resolved_today_row else 0,
            "average_resolution_time_hours": float(avg_row["avg_h"]) if avg_row and avg_row.get("avg_h") else 0.0,
            "by_priority": {r["priority"]: r["c"] for r in priority_rows},
            "by_source": {r["source_agent"]: r["c"] for r in source_rows},
            "by_reason": {r["reason"]: r["c"] for r in reason_rows},
        }

    async def add_escalation_message(
        self, escalation_id: str, message_id: str, sender_type: str, sender_id: str, content: str
    ) -> None:
        """Add a message to an escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            await (
                client.table("escalation_messages")
                .insert(
                    {
                        "id": message_id,
                        "escalation_id": escalation_id,
                        "sender_type": sender_type,
                        "sender_id": sender_id,
                        "content": content,
                    }
                )
                .execute()
            )
        else:
            await self._pg_execute(
                "INSERT INTO escalation_messages "
                "(id, escalation_id, sender_type, sender_id, content) "
                "VALUES ($1, $2, $3, $4, $5)",
                message_id,
                escalation_id,
                sender_type,
                sender_id,
                content,
            )

    async def get_escalation_messages(self, escalation_id: str) -> list[dict[str, Any]]:
        """Get all messages for an escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("escalation_messages")
                .select("*")
                .eq("escalation_id", escalation_id)
                .order("created_at")
                .execute()
            )
            return result.data or []
        return (
            await self._pg_fetch_all(
                "SELECT * FROM escalation_messages WHERE escalation_id = $1 ORDER BY created_at",
                escalation_id,
            )
            or []
        )

    async def get_contractor_documents(self, contractor_id: str) -> list[dict[str, Any]]:
        """Get uploaded documents for a contractor."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_documents").select("*").eq("contractor_id", contractor_id).execute()
            return result.data or []
        return []

    # ------------------------------------------------------------------
    # File Uploads
    # ------------------------------------------------------------------

    async def create_file_upload(self, data: dict[str, Any]) -> dict[str, Any]:
        """Insert a file_uploads record."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("file_uploads").insert(data).execute()
            return result.data[0] if result.data else data
        await self._pg_execute(
            """INSERT INTO file_uploads
               (id, user_id, bucket, file_name, file_type, file_size,
                storage_path, thumbnail_path, analysis_status, analysis_result,
                building_id, metadata)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
            data["id"],
            data["user_id"],
            data["bucket"],
            data["file_name"],
            data["file_type"],
            data["file_size"],
            data["storage_path"],
            data.get("thumbnail_path"),
            data.get("analysis_status", "pending"),
            json.dumps(data.get("analysis_result")) if data.get("analysis_result") else None,
            data.get("building_id"),
            json.dumps(data.get("metadata", {})),
        )
        return data

    async def get_file_upload(self, file_id: str) -> dict[str, Any] | None:
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("file_uploads").select("*").eq("id", file_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM file_uploads WHERE id = $1", file_id)

    async def update_file_upload(self, file_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("file_uploads").update(update_data).eq("id", file_id).execute()
        else:
            allowed = {"analysis_status", "analysis_result", "thumbnail_path", "metadata"}
            filtered = {k: v for k, v in update_data.items() if k in allowed}
            if not filtered:
                return await self.get_file_upload(file_id) or {}
            set_parts = []
            args: list[Any] = []
            for k, v in filtered.items():
                args.append(json.dumps(v) if isinstance(v, (dict, list)) else v)
                set_parts.append(f"{k} = ${len(args)}")
            args.append(file_id)
            await self._pg_execute(
                f"UPDATE file_uploads SET {', '.join(set_parts)} WHERE id = ${len(args)}",
                *args,
            )
        return await self.get_file_upload(file_id) or {}

    async def delete_file_upload(self, file_id: str) -> None:
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("file_uploads").delete().eq("id", file_id).execute()
        else:
            await self._pg_execute("DELETE FROM file_uploads WHERE id = $1", file_id)

    async def list_file_uploads(
        self,
        user_id: str,
        bucket: str | None = None,
        building_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("file_uploads").select("*").eq("user_id", user_id)
            if bucket:
                q = q.eq("bucket", bucket)
            if building_id:
                q = q.eq("building_id", building_id)
            result = await q.order("created_at", desc=True).execute()
            return result.data or []
        where_parts = ["user_id = $1"]
        args: list[Any] = [user_id]
        if bucket:
            args.append(bucket)
            where_parts.append(f"bucket = ${len(args)}")
        if building_id:
            args.append(building_id)
            where_parts.append(f"building_id = ${len(args)}")
        return await self._pg_fetch_all(
            "SELECT * FROM file_uploads WHERE " + " AND ".join(where_parts) + " ORDER BY created_at DESC",
            *args,
        )

    # ------------------------------------------------------------------
    # Admin: Users, Offers, Settings, Audit Logs
    # ------------------------------------------------------------------

    async def get_admin_users(
        self,
        page: int = 1,
        page_size: int = 20,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Paginated user list for admin panel."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("users").select("*", count="exact")
            if role:
                q = q.eq("role", role)
            if is_active is not None:
                q = q.eq("is_active", is_active)
            result = (
                await q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)

        where_parts: list[str] = []
        args: list[Any] = []
        if role:
            args.append(role)
            where_parts.append("role = $%d" % len(args))
        if is_active is not None:
            args.append(is_active)
            where_parts.append("is_active = $%d" % len(args))
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM users WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM users WHERE " + where_sql + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def get_all_offers_admin(
        self,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        category: str | None = None,
        flagged: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Admin offer list with optional filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("offers").select("*", count="exact")
            if status:
                q = q.eq("status", status)
            if category:
                q = q.eq("category", category)
            if flagged is True:
                q = q.eq("status", "flagged")
            result = (
                await q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)

        where_parts: list[str] = []
        args: list[Any] = []
        if status:
            args.append(status)
            where_parts.append("status = $%d" % len(args))
        if category:
            args.append(category)
            where_parts.append("category = $%d" % len(args))
        if flagged is True:
            where_parts.append("status = 'flagged'")
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM offers WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM offers WHERE " + where_sql + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def get_system_settings(self) -> list[dict[str, Any]]:
        """Return all system settings rows."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("system_settings").select("*").execute()
            return result.data or []
        return await self._pg_fetch_all("SELECT * FROM system_settings ORDER BY key")

    async def upsert_system_setting(
        self,
        key: str,
        value: Any,
        description: str | None = None,
        updated_by: str | None = None,
    ) -> dict[str, Any]:
        """Insert or update a system setting by key."""
        setting_id = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("system_settings").select("*").eq("key", key).limit(1).execute()
            if result.data:
                row = result.data[0]
                update_payload: dict[str, Any] = {"value": value}
                if description is not None:
                    update_payload["description"] = description
                if updated_by:
                    update_payload["updated_by"] = updated_by
                await client.table("system_settings").update(update_payload).eq("id", row["id"]).execute()
                return {**row, **update_payload}
            insert_payload = {
                "id": setting_id,
                "key": key,
                "value": value,
                "description": description,
                "updated_by": updated_by,
            }
            res = await client.table("system_settings").insert(insert_payload).execute()
            return res.data[0] if res.data else insert_payload

        existing = await self._pg_fetch_one("SELECT * FROM system_settings WHERE key = $1", key)
        if existing:
            set_parts = ['"value" = $1']
            args: list[Any] = [json.dumps(value)]
            if description is not None:
                args.append(description)
                set_parts.append('"description" = $%d' % len(args))
            if updated_by:
                args.append(updated_by)
                set_parts.append('"updated_by" = $%d' % len(args))
            args.append(existing["id"])
            await self._pg_execute(
                "UPDATE system_settings SET " + ", ".join(set_parts) + " WHERE id = $%d" % len(args),
                *args,
            )
            return await self._pg_fetch_one("SELECT * FROM system_settings WHERE id = $1", existing["id"]) or existing
        await self._pg_execute(
            """INSERT INTO system_settings (id, key, value, description, updated_by)
               VALUES ($1, $2, $3::jsonb, $4, $5)""",
            setting_id,
            key,
            json.dumps(value),
            description,
            updated_by,
        )
        return await self._pg_fetch_one("SELECT * FROM system_settings WHERE id = $1", setting_id) or {
            "id": setting_id,
            "key": key,
            "value": value,
        }

    async def create_audit_log(self, data: dict[str, Any]) -> dict[str, Any]:
        """Insert an audit log entry."""
        log_id = data.get("id") or str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("audit_logs").insert({**data, "id": log_id}).execute()
            return result.data[0] if result.data else {**data, "id": log_id}
        await self._pg_execute(
            """INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)""",
            log_id,
            data["user_id"],
            data["action"],
            data.get("resource_type"),
            data.get("resource_id"),
            json.dumps(data.get("details", {})),
            data.get("ip_address"),
        )
        return {**data, "id": log_id}

    async def list_audit_logs(
        self,
        page: int = 1,
        page_size: int = 20,
        action: str | None = None,
        resource_type: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Paginated audit logs with optional filters."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("audit_logs").select("*", count="exact")
            if action:
                q = q.eq("action", action)
            if resource_type:
                q = q.eq("resource_type", resource_type)
            result = (
                await q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)

        where_parts: list[str] = []
        args: list[Any] = []
        if action:
            args.append(action)
            where_parts.append("action = $%d" % len(args))
        if resource_type:
            args.append(resource_type)
            where_parts.append("resource_type = $%d" % len(args))
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM audit_logs WHERE " + where_sql, *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM audit_logs WHERE " + where_sql + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    # ------------------------------------------------------------------
    # Agent Audit Log
    # ------------------------------------------------------------------

    async def create_agent_audit_entry(self, data: dict[str, Any]) -> None:
        """Insert an agent decision into agent_audit_log (fire-and-forget)."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("agent_audit_log").insert(data).execute()
            return
        await self._pg_execute(
            """INSERT INTO agent_audit_log
               (id, session_id, user_id, agent_name, action, input_summary,
                output_summary, model_used, tokens_used, latency_ms,
                requires_human_review, reasoning_chain, cited_sources,
                alternatives_considered, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)""",
            data["id"],
            data.get("session_id"),
            data.get("user_id"),
            data["agent_name"],
            data["action"],
            data.get("input_summary"),
            data.get("output_summary"),
            data.get("model_used"),
            data.get("tokens_used"),
            data.get("latency_ms"),
            data.get("requires_human_review", False),
            json.dumps(data.get("reasoning_chain") or []),
            json.dumps(data.get("cited_sources") or []),
            json.dumps(data.get("alternatives_considered") or []),
            data.get("created_at"),
        )

    async def list_agent_audit_log(
        self,
        page: int = 1,
        page_size: int = 20,
        agent_name: str | None = None,
        requires_human_review: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Paginated agent audit log with optional filters."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("agent_audit_log").select("*", count="exact")
            if agent_name:
                q = q.eq("agent_name", agent_name)
            if requires_human_review is not None:
                q = q.eq("requires_human_review", requires_human_review)
            result = (
                await q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
            )
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)

        where_parts: list[str] = []
        args: list[Any] = []
        if agent_name:
            args.append(agent_name)
            where_parts.append(f"agent_name = ${len(args)}")
        if requires_human_review is not None:
            args.append(requires_human_review)
            where_parts.append(f"requires_human_review = ${len(args)}")
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one(f"SELECT COUNT(*) AS c FROM agent_audit_log WHERE {where_sql}", *args)
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            f"SELECT * FROM agent_audit_log WHERE {where_sql} ORDER BY created_at DESC LIMIT ${n1} OFFSET ${n2}",
            *args,
        )
        return (rows or [], total)

    # ------------------------------------------------------------------
    # Outreach Queue
    # ------------------------------------------------------------------

    async def create_outreach_pending(self, data: dict[str, Any]) -> dict[str, Any]:
        """Insert a pending outreach message into the approval queue."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("outreach_queue").insert(data).execute()
            return result.data[0] if result.data else data
        await self._pg_execute(
            """INSERT INTO outreach_queue
               (id, user_id, campaign_type, message, variant, status, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            data["id"],
            data["user_id"],
            data["campaign_type"],
            data["message"],
            data.get("variant"),
            data.get("status", "pending_approval"),
            data.get("created_at"),
        )
        return data

    async def list_outreach_queue(self, status: str = "pending_approval") -> list[dict[str, Any]]:
        """List outreach messages filtered by status."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("outreach_queue")
                .select("*")
                .eq("status", status)
                .order("created_at", desc=True)
                .execute()
            )
            return result.data or []
        return await self._pg_fetch_all(
            "SELECT * FROM outreach_queue WHERE status = $1 ORDER BY created_at DESC",
            status,
        )

    async def update_outreach_queue_status(
        self,
        pending_id: str,
        status: str,
        approved_by: str | None = None,
    ) -> dict[str, Any] | None:
        """Update the status of an outreach queue entry."""
        from datetime import UTC, datetime

        now = datetime.now(UTC)
        if self._use_supabase_client():
            client = await self._get_client()
            update: dict[str, Any] = {"status": status}
            if approved_by:
                update["approved_by"] = approved_by
                update["approved_at"] = now.isoformat()
            if status == "sent":
                update["sent_at"] = now.isoformat()
            result = await client.table("outreach_queue").update(update).eq("id", pending_id).execute()
            return result.data[0] if result.data else None
        if approved_by:
            await self._pg_execute(
                "UPDATE outreach_queue SET status=$1, approved_by=$2, approved_at=$3 WHERE id=$4",
                status,
                approved_by,
                now,
                pending_id,
            )
        elif status == "sent":
            await self._pg_execute(
                "UPDATE outreach_queue SET status=$1, sent_at=$2 WHERE id=$3",
                status,
                now,
                pending_id,
            )
        else:
            await self._pg_execute(
                "UPDATE outreach_queue SET status=$1 WHERE id=$2",
                status,
                pending_id,
            )
        return await self._pg_fetch_one("SELECT * FROM outreach_queue WHERE id=$1", pending_id)

    async def get_outreach_pending(self, pending_id: str) -> dict[str, Any] | None:
        """Get a single outreach queue entry by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("outreach_queue").select("*").eq("id", pending_id).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM outreach_queue WHERE id=$1", pending_id)

    # ------------------------------------------------------------------
    # Invoices
    # ------------------------------------------------------------------

    async def create_invoice(self, data: dict[str, Any], conn: Any = None) -> dict[str, Any]:
        """Insert an invoice record. Pass conn to reuse an existing transaction connection."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("invoices").insert(data).execute()
            return result.data[0] if result.data else data
        sql = """INSERT INTO invoices
               (id, invoice_number, offer_id, contractor_id, subtotal,
                tax_rate, tax, platform_fee_rate, platform_fee, total,
                status, paid_at, transaction_id, payment_method, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)"""
        args = (
            data["id"],
            data.get("invoice_number"),
            data["offer_id"],
            data.get("contractor_id"),
            data.get("subtotal", data.get("amount", 0)),
            data.get("tax_rate", 0.17),
            data.get("tax", 0),
            data.get("platform_fee_rate", 0.05),
            data.get("platform_fee", 0),
            data.get("total", data.get("amount", 0)),
            data.get("status", "pending"),
            data.get("paid_at"),
            data.get("transaction_id"),
            data.get("payment_method"),
            data.get("created_at"),
        )
        if conn is not None:
            await conn.execute(sql, *args)
        else:
            await self._pg_execute(sql, *args)
        return await self.get_invoice(data["id"]) or data

    async def get_invoice(self, invoice_id: str) -> dict[str, Any] | None:
        """Get an invoice by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("invoices").select("*").eq("id", invoice_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM invoices WHERE id = $1", invoice_id)

    async def update_invoice(self, invoice_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update an invoice."""
        allowed = {"status", "paid_at", "transaction_id", "payment_method"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return await self.get_invoice(invoice_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("invoices").update(filtered).eq("id", invoice_id).execute()
        else:
            set_parts: list[str] = []
            args: list[Any] = []
            for i, (k, v) in enumerate(filtered.items(), 1):
                set_parts.append(f'"{k}" = ${i}')
                args.append(v)
            args.append(invoice_id)
            await self._pg_execute(
                "UPDATE invoices SET " + ", ".join(set_parts) + " WHERE id = $%d" % len(args),
                *args,
            )
        return await self.get_invoice(invoice_id) or {}

    async def list_invoices_for_user(self, user_id: str) -> list[dict[str, Any]]:
        """Get invoices where the user is a participant (via payment_splits)."""
        if self._use_supabase_client():
            client = await self._get_client()
            # Get invoice IDs from payment_splits for this user
            splits = await client.table("payment_splits").select("invoice_id").eq("user_id", user_id).execute()
            if not splits.data:
                return []
            invoice_ids = list({s["invoice_id"] for s in splits.data})
            result = (
                await client.table("invoices")
                .select("*")
                .in_("id", invoice_ids)
                .order("created_at", desc=True)
                .execute()
            )
            return result.data or []
        return (
            await self._pg_fetch_all(
                """SELECT DISTINCT i.* FROM invoices i
               JOIN payment_splits ps ON ps.invoice_id = i.id
               WHERE ps.user_id = $1
               ORDER BY i.created_at DESC""",
                user_id,
            )
            or []
        )

    async def get_invoice_by_offer(self, offer_id: str) -> dict[str, Any] | None:
        """Get the invoice for a specific offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("invoices").select("*").eq("offer_id", offer_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM invoices WHERE offer_id = $1", offer_id)

    async def get_invoice_for_offer(self, user_id: str, offer_id: str) -> dict[str, Any] | None:
        """Get the invoice for a specific offer and user (via payment_splits)."""
        if self._use_supabase_client():
            client = await self._get_client()
            # First find the invoice for this offer
            invoice_result = await client.table("invoices").select("*").eq("offer_id", offer_id).limit(1).execute()
            if not invoice_result.data:
                return None
            invoice = invoice_result.data[0]
            # Verify this user is a participant via payment_splits
            splits = await (
                client.table("payment_splits")
                .select("id")
                .eq("invoice_id", invoice["id"])
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if splits.data:
                return invoice
            # Also return if user initiated the payment directly
            payments = await (
                client.table("payments")
                .select("id")
                .eq("invoice_id", invoice["id"])
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            return invoice if payments.data else None
        return await self._pg_fetch_one(
            """SELECT i.* FROM invoices i
               LEFT JOIN payment_splits ps ON ps.invoice_id = i.id AND ps.user_id = $1
               LEFT JOIN payments p ON p.invoice_id = i.id AND p.user_id = $1
               WHERE i.offer_id = $2 AND (ps.id IS NOT NULL OR p.id IS NOT NULL)
               LIMIT 1""",
            user_id,
            offer_id,
        )

    # ------------------------------------------------------------------
    # Payments
    # ------------------------------------------------------------------

    async def create_payment(self, data: dict[str, Any], conn: Any = None) -> dict[str, Any]:
        """Insert a payment record. Pass conn to reuse an existing transaction connection."""
        if self._use_supabase_client():
            client = await self._get_client()
            # Filter to only columns that exist in the payments table
            insert_data = {
                k: v
                for k, v in data.items()
                if k
                in {
                    "id",
                    "invoice_id",
                    "user_id",
                    "offer_id",
                    "amount",
                    "currency",
                    "status",
                    "transaction_id",
                    "payment_method",
                    "payment_method_id",
                    "provider_data",
                    "created_at",
                }
            }
            result = await client.table("payments").insert(insert_data).execute()
            return result.data[0] if result.data else data
        sql_pay = """INSERT INTO payments
               (id, invoice_id, user_id, offer_id, amount, currency, status,
                transaction_id, payment_method, provider_data, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"""
        pay_args = (
            data["id"],
            data.get("invoice_id"),
            data["user_id"],
            data.get("offer_id"),
            data["amount"],
            data.get("currency", "ILS"),
            data.get("status", "pending"),
            data.get("transaction_id"),
            data.get("payment_method"),
            json.dumps(data.get("provider_data", {})),
            data.get("created_at"),
        )
        if conn is not None:
            await conn.execute(sql_pay, *pay_args)
        else:
            await self._pg_execute(sql_pay, *pay_args)
        return await self.get_payment(data["id"]) or data

    async def get_payment(self, payment_id: str) -> dict[str, Any] | None:
        """Get a payment by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("payments").select("*").eq("id", payment_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM payments WHERE id = $1", payment_id)

    async def update_payment(self, payment_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update a payment record."""
        allowed = {"status", "transaction_id", "payment_method", "provider_data"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return await self.get_payment(payment_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("payments").update(filtered).eq("id", payment_id).execute()
        else:
            set_parts: list[str] = []
            args: list[Any] = []
            for i, (k, v) in enumerate(filtered.items(), 1):
                val = json.dumps(v) if isinstance(v, (dict, list)) else v
                set_parts.append(f'"{k}" = ${i}')
                args.append(val)
            args.append(payment_id)
            await self._pg_execute(
                "UPDATE payments SET " + ", ".join(set_parts) + " WHERE id = $%d" % len(args),
                *args,
            )
        return await self.get_payment(payment_id) or {}

    async def list_payments_for_user(self, user_id: str) -> list[dict[str, Any]]:
        """Get all payments for a user."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("payments")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return result.data or []
        return (
            await self._pg_fetch_all(
                "SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC",
                user_id,
            )
            or []
        )

    async def get_payment_by_transaction(self, transaction_id: str) -> dict[str, Any] | None:
        """Look up a payment by its provider transaction ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("payments").select("*").eq("transaction_id", transaction_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM payments WHERE transaction_id = $1", transaction_id)

    # ------------------------------------------------------------------
    # Payment Splits
    # ------------------------------------------------------------------

    async def create_payment_split(self, data: dict[str, Any]) -> dict[str, Any]:
        """Insert a payment split record."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("payment_splits").insert(data).execute()
            return result.data[0] if result.data else data
        await self._pg_execute(
            """INSERT INTO payment_splits
               (id, invoice_id, user_id, amount, unit_count, status, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)""",
            data["id"],
            data["invoice_id"],
            data["user_id"],
            data["amount"],
            data.get("unit_count", 1),
            data.get("status", "pending"),
            data.get("created_at"),
        )
        return data

    async def list_payment_splits(self, payment_id: str) -> list[dict[str, Any]]:
        """Get all splits for a payment/invoice."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("payment_splits").select("*").eq("invoice_id", payment_id).execute()
            return result.data or []
        return (
            await self._pg_fetch_all(
                "SELECT * FROM payment_splits WHERE invoice_id = $1",
                payment_id,
            )
            or []
        )

    async def get_next_invoice_number(self) -> str:
        """Query max invoice_number and return the next sequential value (zero-padded 5 digits)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("invoices")
                .select("invoice_number")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if result.data:
                last = result.data[0]["invoice_number"]  # e.g. "INV-2026-00003"
                try:
                    seq = int(last.rsplit("-", 1)[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1
        else:
            row = await self._pg_fetch_one("SELECT invoice_number FROM invoices ORDER BY created_at DESC LIMIT 1")
            if row:
                try:
                    seq = int(row["invoice_number"].rsplit("-", 1)[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1
        return f"{seq:05d}"

    async def health_check(self) -> bool:
        """Check if PostgreSQL is accessible."""
        try:
            if self._use_supabase_client():
                client = await self._get_client()
                await client.table("users").select("id").limit(1).execute()
            else:
                await self._pg_fetch_one("SELECT id FROM users LIMIT 1")
            return True
        except Exception:
            logger.exception("PostgreSQL health check failed")
            return False


_postgres_client: PostgresClient | None = None


def get_postgres_client() -> PostgresClient:
    """Get or create the singleton PostgresClient instance."""
    global _postgres_client
    if _postgres_client is None:
        _postgres_client = PostgresClient()
    return _postgres_client
