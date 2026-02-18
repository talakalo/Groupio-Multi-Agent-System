"""PostgreSQL/Supabase client for relational data operations."""

import json
import logging
import re
from datetime import datetime
from typing import Any
from uuid import uuid4

from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings
from src.models.user import UserInDB

# Regex for safe SQL column names (letters, digits, underscores)
_SAFE_COLUMN_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

logger = logging.getLogger(__name__)


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
        "created_at": row.get("created_at") or datetime.now(datetime.UTC),
        "updated_at": row.get("updated_at") or datetime.now(datetime.UTC),
    }


class PostgresClient:
    """PostgreSQL client - uses Supabase when configured, else local PostgreSQL via asyncpg."""

    def __init__(self) -> None:
        self._supabase_client: Any = None
        self._asyncpg_pool: Any = None
        self._use_supabase: bool | None = None

    def _use_supabase_client(self) -> bool:
        """Use Supabase when URL is set and USE_LOCAL_POSTGRES not set, else local PostgreSQL."""
        if self._use_supabase is None:
            settings = get_settings()
            force_local = (settings.USE_LOCAL_POSTGRES or "").lower() in ("1", "true", "yes")
            self._use_supabase = bool(
                settings.SUPABASE_URL and settings.SUPABASE_KEY and not force_local
            )
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
                min_size=1,
                max_size=10,
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

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def execute_query(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        """Execute a raw SQL query."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.rpc(
                "execute_sql", {"query": query, "params": params or {}}
            ).execute()
            return result.data if result.data else []
        # Local: not supported for generic RPC
        return []

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
            result = (
                await client.table("users")
                .select("hashed_password")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one(
                "SELECT hashed_password FROM users WHERE id = $1", user_id
            )
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
            await (
                client.table("users")
                .update({"hashed_password": hashed_password})
                .eq("id", user_id)
                .execute()
            )
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
            result = (
                await client.table("users")
                .select("building_id")
                .eq("phone", phone)
                .limit(1)
                .execute()
            )
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
            total = (
                result.count
                if hasattr(result, "count") and result.count is not None
                else len(result.data or [])
            )
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
        count_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM buildings WHERE " + where_sql, *args
        )
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM buildings WHERE "
            + where_sql
            + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
            *args,
        )
        return (rows or [], total)

    async def update_building(
        self, building_id: str, update_data: dict[str, Any]
    ) -> dict[str, Any]:
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
            await (
                client.table("building_residents").delete().eq("building_id", building_id).execute()
            )
            await client.table("buildings").delete().eq("id", building_id).execute()
        else:
            await self._pg_execute(
                "DELETE FROM building_residents WHERE building_id = $1", building_id
            )
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
            "INSERT INTO building_residents (id, user_id, building_id, unit_number, floor, is_owner) "
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
            "SELECT br.*, u.full_name, u.email, u.phone FROM building_residents br "
            "JOIN users u ON u.id = br.user_id WHERE br.building_id = $1 "
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
            await self._pg_fetch_one(
                "SELECT COUNT(*) AS c FROM building_residents WHERE building_id = $1", building_id
            )
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
            "INSERT INTO invitations (id, building_id, email, invited_by, status, expires_at) "
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
                await q.order("created_at", desc=True)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            total = (
                result.count
                if hasattr(result, "count") and result.count is not None
                else len(result.data or [])
            )
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
        count_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM offers WHERE " + where_sql, *args
        )
        total = count_row["c"] if count_row else 0
        args.extend([page_size, (page - 1) * page_size])
        n1, n2 = len(args) - 1, len(args)
        rows = await self._pg_fetch_all(
            "SELECT * FROM offers WHERE "
            + where_sql
            + " ORDER BY created_at DESC LIMIT $%d OFFSET $%d" % (n1, n2),
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
        """Add user as participant and increment current_participants."""
        from uuid import uuid4

        pid = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            await (
                client.table("offer_participants")
                .insert(
                    {"id": pid, "offer_id": offer_id, "user_id": user_id, "unit_count": unit_count}
                )
                .execute()
            )
            offer = await self.get_offer(offer_id)
            cur = (offer.get("current_participants") or 0) + unit_count
            await (
                client.table("offers")
                .update({"current_participants": cur})
                .eq("id", offer_id)
                .execute()
            )
        else:
            await self._pg_execute(
                "INSERT INTO offer_participants (id, offer_id, user_id, unit_count) VALUES ($1, $2, $3, $4)",
                pid,
                offer_id,
                user_id,
                unit_count,
            )
            await self._pg_execute(
                "UPDATE offers SET current_participants = current_participants + $1 WHERE id = $2",
                unit_count,
                offer_id,
            )

    async def leave_offer(self, user_id: str, offer_id: str) -> None:
        """Remove user from offer and decrement current_participants."""
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
            await (
                client.table("offer_participants")
                .delete()
                .eq("user_id", user_id)
                .eq("offer_id", offer_id)
                .execute()
            )
            offer = await self.get_offer(offer_id)
            cur = max(0, (offer.get("current_participants") or 0) - uc)
            await (
                client.table("offers")
                .update({"current_participants": cur})
                .eq("id", offer_id)
                .execute()
            )
        else:
            row = await self._pg_fetch_one(
                "SELECT unit_count FROM offer_participants WHERE user_id = $1 AND offer_id = $2",
                user_id,
                offer_id,
            )
            uc = row["unit_count"] if row else 1
            await self._pg_execute(
                "DELETE FROM offer_participants WHERE user_id = $1 AND offer_id = $2",
                user_id,
                offer_id,
            )
            await self._pg_execute(
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
                "SELECT op.*, u.full_name, u.email FROM offer_participants op "
                "JOIN users u ON u.id = op.user_id WHERE op.offer_id = $1",
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

    async def create_contractor(
        self, contractor_data: dict[str, Any], password: str
    ) -> dict[str, Any]:
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
            "full_name": contractor_data.get(
                "contact_name", contractor_data.get("business_name", "")
            ),
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
            "INSERT INTO contractors (id, user_id, business_name, contact_name, email, phone, "
            "description, categories, regions, years_experience, employee_count, website, "
            "verification_status, trust_score, license_number) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
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
                await q.order("trust_score", desc=True)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            total = (
                result.count
                if hasattr(result, "count") and result.count is not None
                else len(result.data or [])
            )
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
        count_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM contractors WHERE " + where_sql, *args
        )
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
            result = (
                await client.table("contractors")
                .select("*")
                .eq("id", contractor_id)
                .limit(1)
                .execute()
            )
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM contractors WHERE id = $1", contractor_id)

    async def get_contractors_by_ids(self, contractor_ids: list[str]) -> list[dict[str, Any]]:
        """Get contractors by list of IDs (preserve order)."""
        if not contractor_ids:
            return []
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("contractors").select("*").in_("id", contractor_ids).execute()
            )
            data = result.data or []
            order = {cid: i for i, cid in enumerate(contractor_ids)}
            return sorted(data, key=lambda x: order.get(x["id"], 999))
        placeholders = ", ".join("$%d" % (i + 1) for i in range(len(contractor_ids)))
        rows = await self._pg_fetch_all(
            "SELECT * FROM contractors WHERE id IN (" + placeholders + ")", *contractor_ids
        )
        order = {cid: i for i, cid in enumerate(contractor_ids)}
        return sorted(rows or [], key=lambda x: order.get(x["id"], 999))

    async def update_contractor(
        self, contractor_id: str, update_data: dict[str, Any]
    ) -> dict[str, Any]:
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
            query, args = self._build_safe_update(
                "contractors", filtered, "id", contractor_id
            )
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
            total = (
                result.count
                if hasattr(result, "count") and result.count is not None
                else len(result.data or [])
            )
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

    async def has_user_completed_offer_with_contractor(
        self, user_id: str, contractor_id: str
    ) -> bool:
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
            "SELECT 1 FROM offer_participants op JOIN offers o ON o.id = op.offer_id "
            "WHERE op.user_id = $1 AND o.matched_contractor_id = $2 AND o.status = 'completed' LIMIT 1",
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
            result = (
                await client.table("contractor_reviews")
                .insert({**review_data, "id": rid})
                .execute()
            )
            return result.data[0] if result.data else {**review_data, "id": rid}
        await self._pg_execute(
            "INSERT INTO contractor_reviews (id, contractor_id, user_id, offer_id, rating, comment) "
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
                await client.table("contractor_reviews")
                .select("rating")
                .eq("contractor_id", contractor_id)
                .execute()
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
            "INSERT INTO escalations (id, user_id, conversation_id, source_agent, reason, priority, "
            "summary, status, assigned_to, context, agent_reasoning, resolution_notes, resolved_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
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
        """List escalations with filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("escalations").select("*", count="exact")
            if filters.get("status"):
                q = q.eq("status", filters["status"])
            if filters.get("priority"):
                q = q.eq("priority", filters["priority"])
            if filters.get("source_agent"):
                q = q.eq("source_agent", filters["source_agent"])
            if filters.get("assigned_to"):
                q = q.eq("assigned_to", filters["assigned_to"])
            result = (
                await q.order("created_at", desc=True)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            total = (
                result.count
                if hasattr(result, "count") and result.count is not None
                else len(result.data or [])
            )
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        if filters.get("status"):
            args.append(filters["status"])
            where_parts.append("status = $%d" % len(args))
        if filters.get("priority"):
            args.append(filters["priority"])
            where_parts.append("priority = $%d" % len(args))
        if filters.get("source_agent"):
            args.append(filters["source_agent"])
            where_parts.append("source_agent = $%d" % len(args))
        if filters.get("assigned_to"):
            args.append(filters["assigned_to"])
            where_parts.append("assigned_to = $%d" % len(args))
        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        count_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM escalations WHERE " + where_sql, *args
        )
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
            result = (
                await client.table("escalations")
                .select("*")
                .eq("id", escalation_id)
                .limit(1)
                .execute()
            )
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM escalations WHERE id = $1", escalation_id)

    async def update_escalation(
        self, escalation_id: str, update_data: dict[str, Any]
    ) -> dict[str, Any]:
        """Update an escalation."""
        allowed = {"status", "assigned_to", "context", "resolution_notes", "resolved_at"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return await self.get_escalation(escalation_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("escalations").update(filtered).eq("id", escalation_id).execute()
        else:
            query, args = self._build_safe_update(
                "escalations", filtered, "id", escalation_id
            )
            await self._pg_execute(query, *args)
        return await self.get_escalation(escalation_id) or {}

    async def get_escalation_stats(self) -> dict[str, Any]:
        """Get escalation statistics."""
        if self._use_supabase_client():
            client = await self._get_client()
            open_r = (
                await client.table("escalations")
                .select("id", count="exact")
                .eq("status", "open")
                .execute()
            )
            resolved_r = (
                await client.table("escalations")
                .select("id", count="exact")
                .eq("status", "resolved")
                .execute()
            )
            return {
                "open": getattr(open_r, "count", 0) or 0,
                "resolved": getattr(resolved_r, "count", 0) or 0,
            }
        open_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM escalations WHERE status = 'open'"
        )
        resolved_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM escalations WHERE status = 'resolved'"
        )
        return {
            "open": open_row["c"] if open_row else 0,
            "resolved": resolved_row["c"] if resolved_row else 0,
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
                "INSERT INTO escalation_messages (id, escalation_id, sender_type, sender_id, content) "
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
            result = (
                await client.table("contractor_documents")
                .select("*")
                .eq("contractor_id", contractor_id)
                .execute()
            )
            return result.data or []
        return []

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
