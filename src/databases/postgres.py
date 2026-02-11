"""PostgreSQL/Supabase client for relational data operations."""

import json
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings
from src.models.user import UserInDB

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
        "created_at": row.get("created_at") or datetime.utcnow(),
        "updated_at": row.get("updated_at") or datetime.utcnow(),
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
                settings.SUPABASE_URL
                and settings.SUPABASE_KEY
                and not force_local
            )
        return self._use_supabase

    async def _get_client(self) -> Any:
        """Lazily initialize the database client."""
        if self._use_supabase_client():
            if self._supabase_client is None:
                from supabase import AsyncClient, acreate_client

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
            result = await client.rpc("execute_sql", {"query": query, "params": params or {}}).execute()
            return result.data if result.data else []
        # Local: not supported for generic RPC
        return []

    async def get_user_profile(self, user_id: str) -> dict[str, Any] | None:
        """Get a user profile by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("users").select("*").eq("id", user_id).execute()
            return result.data[0] if result.data else None
        row = await self._pg_fetch_one(
            "SELECT * FROM users WHERE id = $1", user_id
        )
        return row

    async def get_user_by_email(self, email: str) -> UserInDB | None:
        """Get user by email."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("users").select("*").eq("email", email).limit(1).execute()
            )
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT * FROM users WHERE email = $1", email)
        return UserInDB(**_row_to_user(row)) if row else None

    async def get_user_by_phone(self, phone: str) -> UserInDB | None:
        """Get user by phone."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("users").select("*").eq("phone", phone).limit(1).execute()
            )
            row = result.data[0] if result.data else None
        else:
            row = await self._pg_fetch_one("SELECT * FROM users WHERE phone = $1", phone)
        return UserInDB(**_row_to_user(row)) if row else None

    async def get_user(self, user_id: str) -> UserInDB | None:
        """Get user by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("users").select("*").eq("id", user_id).limit(1).execute()
            )
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
            }
            result = await client.table("users").insert(insert_data).execute()
            row = result.data[0] if result.data else None
        else:
            await self._pg_execute(
                """INSERT INTO users (id, email, hashed_password, full_name, phone, role,
                   preferred_language, is_active, is_verified, building_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
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
            )
            row = await self._pg_fetch_one("SELECT * FROM users WHERE id = $1", user_data["id"])
        if not row:
            raise RuntimeError("Failed to create user")
        return UserInDB(**_row_to_user(row))

    async def update_user(
        self, user_id: str, update_data: dict[str, Any]
    ) -> UserInDB:
        """Update user by ID."""
        allowed = {
            "full_name", "phone", "preferred_language", "avatar_url",
            "building_id", "contractor_id", "is_active", "is_verified",
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
            result = (
                await client.table("users")
                .update(filtered)
                .eq("id", user_id)
                .execute()
            )
            row = result.data[0] if result.data else None
        else:
            # Build SET clause for asyncpg
            set_parts = []
            args: list[Any] = []
            for i, (k, v) in enumerate(filtered.items(), 1):
                set_parts.append(f'"{k}" = ${i}')
                args.append(v)
            args.append(user_id)
            where_pos = len(args)
            set_clause = ", ".join(set_parts)
            await self._pg_execute(
                f"UPDATE users SET {set_clause} WHERE id = ${where_pos}",
                *args,
            )
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
            await client.table("users").update(
                {"hashed_password": hashed_password}
            ).eq("id", user_id).execute()
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
            row = await self._pg_fetch_one(
                "SELECT building_id FROM users WHERE phone = $1", phone
            )
        return row["building_id"] if row and row.get("building_id") else None

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

    async def get_user_orders(
        self, user_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
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

    async def get_market_data(
        self, category: str, region: str, months: int = 6
    ) -> dict[str, Any]:
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

    async def create_support_ticket(
        self, ticket_data: dict[str, Any]
    ) -> dict[str, Any]:
        """Create a support ticket for human escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("support_tickets").insert(ticket_data).execute()
            )
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
            await client.table("conversation_logs").insert(
                {"user_id": user_id, "message": message, "response": response, "metadata": metadata}
            ).execute()
        else:
            conv_id = str(uuid4())
            meta_json = json.dumps(metadata or {})
            resp_content = json.dumps(response) if isinstance(response, dict) else str(response)
            await self._pg_execute(
                """INSERT INTO chat_messages (id, conversation_id, user_id, sender_type, content, metadata)
                   VALUES ($1, $2, $3, 'user', $4, $5::jsonb)""",
                str(uuid4()), conv_id, user_id, message, meta_json,
            )
            await self._pg_execute(
                """INSERT INTO chat_messages (id, conversation_id, user_id, sender_type, content, metadata)
                   VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb)""",
                str(uuid4()), conv_id, user_id, resp_content, meta_json,
            )

    async def get_contractor_documents(
        self, contractor_id: str
    ) -> list[dict[str, Any]]:
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
