"""PostgreSQL/Supabase client for relational data operations."""

import json
import logging
import uuid
from datetime import datetime
from typing import Any

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

    async def is_user_in_building(self, user_id: str, building_id: str) -> bool:
        """Check if user is a resident of the building (users.building_id or building_residents)."""
        if self._use_supabase_client():
            client = await self._get_client()
            # Check users.building_id
            result = await client.table("users").select("id").eq("id", user_id).eq("building_id", building_id).limit(1).execute()
            if result.data:
                return True
            # Check building_residents
            result = await client.table("building_residents").select("id").eq("user_id", user_id).eq("building_id", building_id).limit(1).execute()
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM users WHERE id = $1 AND building_id = $2",
            user_id, building_id,
        )
        if row:
            return True
        row = await self._pg_fetch_one(
            "SELECT 1 FROM building_residents WHERE user_id = $1 AND building_id = $2",
            user_id, building_id,
        )
        return row is not None

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
            conv_id = (metadata or {}).get("conversation_id", "log")
            msg_id = str(uuid.uuid4())
            await self._pg_execute(
                """INSERT INTO chat_messages (id, conversation_id, user_id, sender_type, content, metadata)
                   VALUES ($1, $2, $3, 'user', $4, $5)""",
                msg_id, conv_id, user_id, message, {"response": response, "metadata": metadata},
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

    # ---- Buildings ----

    async def create_building(self, building_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new building."""
        bid = building_data.get("id") or str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            data = {**building_data, "id": bid}
            result = await client.table("buildings").insert(data).execute()
            return result.data[0] if result.data else data
        await self._pg_execute(
            """INSERT INTO buildings (id, name, address, city, region, total_units, floors, year_built, admin_user_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
            bid,
            building_data["name"],
            building_data["address"],
            building_data["city"],
            building_data["region"].value if hasattr(building_data["region"], "value") else building_data["region"],
            building_data["total_units"],
            building_data["floors"],
            building_data.get("year_built"),
            building_data["admin_user_id"],
        )
        return (await self._pg_fetch_one("SELECT * FROM buildings WHERE id = $1", bid)) or building_data

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
                r = filters["region"]
                q = q.eq("region", r.value if hasattr(r, "value") else r)
            if filters.get("user_id"):
                q = q.eq("admin_user_id", filters["user_id"])
            q = q.range((page - 1) * page_size, page * page_size - 1).order("created_at", desc=True)
            result = await q.execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts, args = [], []
        if filters.get("city"):
            where_parts.append("city = $%d" % (len(args) + 1))
            args.append(filters["city"])
        if filters.get("region"):
            r = filters["region"]
            where_parts.append("region = $%d" % (len(args) + 1))
            args.append(r.value if hasattr(r, "value") else r)
        if filters.get("user_id"):
            where_parts.append("admin_user_id = $%d" % (len(args) + 1))
            args.append(filters["user_id"])
        where = " AND ".join(where_parts) if where_parts else "1=1"
        total_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM buildings WHERE " + where, *args
        )
        total = int(total_row["c"]) if total_row else 0
        n = len(args)
        args.extend([(page - 1) * page_size, page_size])
        rows = await self._pg_fetch_all(
            f"SELECT * FROM buildings WHERE {where} ORDER BY created_at DESC LIMIT ${n+1} OFFSET ${n+2}",
            *args,
        )
        return (rows, total)

    async def update_building(self, building_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update a building."""
        allowed = {"name", "address", "city", "region", "total_units", "floors", "year_built"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            row = await self.get_building(building_id)
            return row or {}
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("buildings").update(filtered).eq("id", building_id).execute()
            return result.data[0] if result.data else {}
        set_parts, args = [], []
        for i, (k, v) in enumerate(filtered.items(), 1):
            set_parts.append(f'"{k}" = ${i}')
            args.append(v.value if hasattr(v, "value") else v)
        args.append(building_id)
        await self._pg_execute(
            f"UPDATE buildings SET {', '.join(set_parts)} WHERE id = ${len(args)}", *args
        )
        return (await self._pg_fetch_one("SELECT * FROM buildings WHERE id = $1", building_id)) or {}

    async def delete_building(self, building_id: str) -> None:
        """Delete a building."""
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
        rid = str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("building_residents").insert({
                "id": rid, "user_id": user_id, "building_id": building_id,
                "unit_number": unit_number, "floor": floor, "is_owner": is_owner,
            }).execute()
            return result.data[0] if result.data else {}
        await self._pg_execute(
            """INSERT INTO building_residents (id, user_id, building_id, unit_number, floor, is_owner)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            rid, user_id, building_id, unit_number, floor, is_owner,
        )
        return (await self._pg_fetch_one("SELECT * FROM building_residents WHERE id = $1", rid)) or {}

    async def remove_resident_from_building(self, user_id: str, building_id: str) -> None:
        """Remove a resident from a building."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("building_residents").delete().eq("user_id", user_id).eq("building_id", building_id).execute()
        else:
            await self._pg_execute(
                "DELETE FROM building_residents WHERE user_id = $1 AND building_id = $2",
                user_id, building_id,
            )

    async def get_building_residents(
        self, building_id: str, page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """Get residents of a building. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("building_residents").select("*, users!inner(id, full_name, email, phone)", count="exact").eq("building_id", building_id).range((page - 1) * page_size, page * page_size - 1).execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        total_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM building_residents WHERE building_id = $1", building_id
        )
        total = int(total_row["c"]) if total_row else 0
        rows = await self._pg_fetch_all(
            "SELECT br.*, u.full_name, u.email, u.phone FROM building_residents br JOIN users u ON u.id = br.user_id WHERE br.building_id = $1 ORDER BY br.joined_at DESC LIMIT $2 OFFSET $3",
            building_id, page_size, (page - 1) * page_size,
        )
        return (rows, total)

    async def is_unit_taken(self, building_id: str, unit_number: str) -> bool:
        """Check if a unit number is already taken in the building."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("building_residents").select("id").eq("building_id", building_id).eq("unit_number", unit_number).limit(1).execute()
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM building_residents WHERE building_id = $1 AND unit_number = $2",
            building_id, unit_number,
        )
        return row is not None

    async def count_active_offers(self, building_id: str) -> int:
        """Count active offers for a building."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offers").select("id", count="exact").eq("building_id", building_id).eq("status", "active").execute()
            return result.count or 0
        row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM offers WHERE building_id = $1 AND status = 'active'",
            building_id,
        )
        return int(row["c"]) if row else 0

    async def get_building_stats(self, building_id: str) -> dict[str, Any]:
        """Get building statistics."""
        building = await self.get_building(building_id)
        if not building:
            return {}
        active = await self.count_active_offers(building_id)
        return {
            **building,
            "active_offers_count": active,
        }

    async def create_invitation(
        self,
        building_id: str,
        email: str,
        invited_by: str,
        status: str = "pending",
        expires_at: datetime | None = None,
    ) -> dict[str, Any]:
        """Create a building invitation."""
        inv_id = str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("invitations").insert({
                "id": inv_id, "building_id": building_id, "email": email,
                "invited_by": invited_by, "status": status, "expires_at": expires_at,
            }).execute()
            return result.data[0] if result.data else {}
        await self._pg_execute(
            """INSERT INTO invitations (id, building_id, email, invited_by, status, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            inv_id, building_id, email, invited_by, status, expires_at,
        )
        return (await self._pg_fetch_one("SELECT * FROM invitations WHERE id = $1", inv_id)) or {}

    # ---- Offers ----

    async def create_offer(self, offer_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new offer."""
        oid = offer_data.get("id") or str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            data = {**offer_data, "id": oid}
            if "category" in data and hasattr(data["category"], "value"):
                data["category"] = data["category"].value
            if "status" in data and hasattr(data["status"], "value"):
                data["status"] = data["status"].value
            result = await client.table("offers").insert(data).execute()
            return result.data[0] if result.data else data
        cat = offer_data.get("category")
        status = offer_data.get("status", "draft")
        if hasattr(cat, "value"):
            cat = cat.value
        if hasattr(status, "value"):
            status = status.value
        await self._pg_execute(
            """INSERT INTO offers (id, title, description, category, base_price, min_participants, max_participants, deadline, building_id, created_by, status, current_participants, pricing_tiers)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12)""",
            oid,
            offer_data.get("title", ""),
            offer_data.get("description", ""),
            cat,
            offer_data.get("base_price", 0),
            offer_data.get("min_participants", 5),
            offer_data.get("max_participants", 50),
            offer_data.get("deadline"),
            offer_data.get("building_id"),
            offer_data.get("created_by"),
            status,
            json.dumps(offer_data.get("pricing_tiers") or []),
        )
        return (await self._pg_fetch_one("SELECT * FROM offers WHERE id = $1", oid)) or offer_data

    async def list_offers(
        self,
        filters: dict[str, Any],
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List offers with filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("offers").select("*", count="exact")
            if filters.get("building_id"):
                q = q.eq("building_id", filters["building_id"])
            if filters.get("category"):
                c = filters["category"]
                q = q.eq("category", c.value if hasattr(c, "value") else c)
            if filters.get("status"):
                s = filters["status"]
                q = q.eq("status", s.value if hasattr(s, "value") else s)
            q = q.range((page - 1) * page_size, page * page_size - 1).order("created_at", desc=True)
            result = await q.execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts, args = [], []
        for key in ("building_id", "category", "status"):
            if filters.get(key):
                v = filters[key]
                where_parts.append(f'"{key}" = ${len(args)+1}')
                args.append(v.value if hasattr(v, "value") else v)
        where = " AND ".join(where_parts) if where_parts else "1=1"
        total_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM offers WHERE " + where, *args)
        total = int(total_row["c"]) if total_row else 0
        n = len(args)
        args.extend([(page - 1) * page_size, page_size])
        rows = await self._pg_fetch_all(
            f"SELECT * FROM offers WHERE {where} ORDER BY created_at DESC LIMIT ${n+1} OFFSET ${n+2}",
            *args,
        )
        return (rows, total)

    async def get_offer(self, offer_id: str) -> dict[str, Any] | None:
        """Get an offer by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offers").select("*").eq("id", offer_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM offers WHERE id = $1", offer_id)

    async def update_offer(self, offer_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update an offer."""
        allowed = {"title", "description", "base_price", "min_participants", "max_participants", "deadline", "status", "matched_contractor_id", "current_participants", "pricing_tiers"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return (await self.get_offer(offer_id)) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            payload = dict(filtered)
            for k in ("status",):
                if k in payload and hasattr(payload[k], "value"):
                    payload[k] = payload[k].value
            result = await client.table("offers").update(payload).eq("id", offer_id).execute()
            return result.data[0] if result.data else {}
        set_parts, args = [], []
        for i, (k, v) in enumerate(filtered.items(), 1):
            set_parts.append(f'"{k}" = ${i}')
            args.append(v.value if hasattr(v, "value") else v)
        args.append(offer_id)
        await self._pg_execute(
            f"UPDATE offers SET {', '.join(set_parts)} WHERE id = ${len(args)}", *args
        )
        return (await self._pg_fetch_one("SELECT * FROM offers WHERE id = $1", offer_id)) or {}

    async def has_user_joined_offer(self, user_id: str, offer_id: str) -> bool:
        """Check if user has joined an offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offer_participants").select("id").eq("offer_id", offer_id).eq("user_id", user_id).limit(1).execute()
            return bool(result.data)
        row = await self._pg_fetch_one(
            "SELECT 1 FROM offer_participants WHERE offer_id = $1 AND user_id = $2",
            offer_id, user_id,
        )
        return row is not None

    async def join_offer(self, user_id: str, offer_id: str, unit_count: int = 1) -> None:
        """Add user as participant to an offer."""
        pid = str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("offer_participants").insert({"id": pid, "offer_id": offer_id, "user_id": user_id, "unit_count": unit_count}).execute()
            await client.table("offers").update({"current_participants": client.rpc("increment", {"row_id": offer_id, "column": "current_participants"})}).eq("id", offer_id).execute()
        else:
            await self._pg_execute(
                "INSERT INTO offer_participants (id, offer_id, user_id, unit_count) VALUES ($1, $2, $3, $4)",
                pid, offer_id, user_id, unit_count,
            )
            await self._pg_execute(
                "UPDATE offers SET current_participants = COALESCE(current_participants, 0) + 1 WHERE id = $1",
                offer_id,
            )

    async def leave_offer(self, user_id: str, offer_id: str) -> None:
        """Remove user from an offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("offer_participants").delete().eq("offer_id", offer_id).eq("user_id", user_id).execute()
            # Decrement current_participants
            offer = await self.get_offer(offer_id)
            if offer and offer.get("current_participants", 0) > 0:
                await client.table("offers").update({"current_participants": offer["current_participants"] - 1}).eq("id", offer_id).execute()
        else:
            await self._pg_execute(
                "DELETE FROM offer_participants WHERE offer_id = $1 AND user_id = $2",
                offer_id, user_id,
            )
            await self._pg_execute(
                "UPDATE offers SET current_participants = GREATEST(COALESCE(current_participants, 0) - 1, 0) WHERE id = $1",
                offer_id,
            )

    async def get_offer_participants(self, offer_id: str) -> list[dict[str, Any]]:
        """Get participants of an offer."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offer_participants").select("*, users(id, full_name, email)").eq("offer_id", offer_id).execute()
            return result.data or []
        return await self._pg_fetch_all(
            "SELECT op.*, u.full_name, u.email FROM offer_participants op JOIN users u ON u.id = op.user_id WHERE op.offer_id = $1",
            offer_id,
        )

    # ---- Contractors ----

    async def create_contractor(self, contractor_data: dict[str, Any], password: str) -> dict[str, Any]:
        """Create contractor and linked user. Password is hashed and stored in users."""
        from src.api.middleware.auth import hash_password
        cid = contractor_data.get("id") or str(uuid.uuid4())
        uid = str(uuid.uuid4())
        hashed = hash_password(password)
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("users").insert({
                "id": uid, "email": contractor_data["email"], "hashed_password": hashed,
                "full_name": contractor_data.get("contact_name", contractor_data.get("business_name", "")),
                "phone": contractor_data["phone"], "role": "contractor", "contractor_id": cid,
            }).execute()
            data = {**contractor_data, "id": cid, "user_id": uid}
            if "verification_status" in data and hasattr(data["verification_status"], "value"):
                data["verification_status"] = data["verification_status"].value
            result = await client.table("contractors").insert(data).execute()
            return result.data[0] if result.data else data
        await self._pg_execute(
            """INSERT INTO users (id, email, hashed_password, full_name, phone, role, contractor_id)
               VALUES ($1, $2, $3, $4, $5, 'contractor', $6)""",
            uid, contractor_data["email"], hashed,
            contractor_data.get("contact_name", contractor_data.get("business_name", "")),
            contractor_data["phone"], cid,
        )
        cat = contractor_data.get("categories", [])
        reg = contractor_data.get("regions", [])
        if cat and hasattr(cat[0], "value"):
            cat = [c.value for c in cat]
        if reg and hasattr(reg[0], "value"):
            reg = [r.value for r in reg]
        await self._pg_execute(
            """INSERT INTO contractors (id, user_id, business_name, contact_name, email, phone, description, categories, regions, years_experience, employee_count, website, verification_status, trust_score)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)""",
            cid, uid,
            contractor_data.get("business_name", ""),
            contractor_data.get("contact_name", ""),
            contractor_data["email"], contractor_data["phone"],
            contractor_data.get("description", ""),
            cat, reg,
            contractor_data.get("years_experience", 0),
            contractor_data.get("employee_count", 1),
            contractor_data.get("website"),
            contractor_data.get("verification_status", "pending"),
            contractor_data.get("trust_score", 0),
        )
        return (await self._pg_fetch_one("SELECT * FROM contractors WHERE id = $1", cid)) or contractor_data

    async def list_contractors(
        self,
        filters: dict[str, Any],
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List contractors with filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("contractors").select("*", count="exact")
            if filters.get("category"):
                q = q.contains("categories", [filters["category"]])
            if filters.get("region"):
                q = q.contains("regions", [filters["region"]])
            if filters.get("verification_status"):
                q = q.eq("verification_status", filters["verification_status"])
            q = q.range((page - 1) * page_size, page * page_size - 1).order("trust_score", desc=True)
            result = await q.execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts, args = [], []
        if filters.get("verification_status"):
            where_parts.append("verification_status = $%d" % (len(args) + 1))
            args.append(filters["verification_status"])
        where = " AND ".join(where_parts) if where_parts else "1=1"
        total_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM contractors WHERE " + where, *args)
        total = int(total_row["c"]) if total_row else 0
        n = len(args)
        args.extend([(page - 1) * page_size, page_size])
        rows = await self._pg_fetch_all(
            f"SELECT * FROM contractors WHERE {where} ORDER BY trust_score DESC NULLS LAST LIMIT ${n+1} OFFSET ${n+2}",
            *args,
        )
        return (rows, total)

    async def get_contractor(self, contractor_id: str) -> dict[str, Any] | None:
        """Get a contractor by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractors").select("*").eq("id", contractor_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM contractors WHERE id = $1", contractor_id)

    async def get_contractors_by_ids(self, contractor_ids: list[str]) -> list[dict[str, Any]]:
        """Get multiple contractors by IDs."""
        if not contractor_ids:
            return []
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractors").select("*").in_("id", contractor_ids).execute()
            return result.data or []
        placeholders = ", ".join(f"${i+1}" for i in range(len(contractor_ids)))
        return await self._pg_fetch_all(
            f"SELECT * FROM contractors WHERE id IN ({placeholders})",
            *contractor_ids,
        )

    async def update_contractor(self, contractor_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update a contractor."""
        allowed = {"business_name", "contact_name", "email", "phone", "description", "categories", "regions", "years_experience", "employee_count", "website", "verification_status", "trust_score", "trust_score_breakdown", "license_number", "license_verified", "insurance_expiry", "insurance_verified", "average_rating", "total_reviews", "completed_projects"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return (await self.get_contractor(contractor_id)) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractors").update(filtered).eq("id", contractor_id).execute()
            return result.data[0] if result.data else {}
        set_parts, args = [], []
        for i, (k, v) in enumerate(filtered.items(), 1):
            if k in ("categories", "regions") and isinstance(v, list):
                v = [x.value if hasattr(x, "value") else x for x in v]
            set_parts.append(f'"{k}" = ${i}')
            args.append(v)
        args.append(contractor_id)
        await self._pg_execute(
            f"UPDATE contractors SET {', '.join(set_parts)} WHERE id = ${len(args)}", *args
        )
        return (await self._pg_fetch_one("SELECT * FROM contractors WHERE id = $1", contractor_id)) or {}

    async def get_contractor_reviews(
        self, contractor_id: str, page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """Get reviews for a contractor. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_reviews").select("*", count="exact").eq("contractor_id", contractor_id).range((page - 1) * page_size, page * page_size - 1).order("created_at", desc=True).execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        total_row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS c FROM contractor_reviews WHERE contractor_id = $1", contractor_id
        )
        total = int(total_row["c"]) if total_row else 0
        rows = await self._pg_fetch_all(
            "SELECT * FROM contractor_reviews WHERE contractor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            contractor_id, page_size, (page - 1) * page_size,
        )
        return (rows, total)

    async def has_user_completed_offer_with_contractor(
        self, user_id: str, contractor_id: str, offer_id: str
    ) -> bool:
        """Check if user has completed an offer with this contractor (e.g. for review eligibility)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("offer_participants").select("id").eq("user_id", user_id).eq("offer_id", offer_id).execute()
            if not result.data:
                return False
            offer = await self.get_offer(offer_id)
            return (offer or {}).get("status") == "completed" and (offer or {}).get("matched_contractor_id") == contractor_id
        op = await self._pg_fetch_one(
            "SELECT 1 FROM offer_participants WHERE user_id = $1 AND offer_id = $2",
            user_id, offer_id,
        )
        if not op:
            return False
        offer = await self.get_offer(offer_id)
        return (offer or {}).get("status") == "completed" and (offer or {}).get("matched_contractor_id") == contractor_id

    async def create_review(self, review_data: dict[str, Any]) -> dict[str, Any]:
        """Create a contractor review."""
        rid = str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_reviews").insert({**review_data, "id": rid}).execute()
            return result.data[0] if result.data else {}
        await self._pg_execute(
            "INSERT INTO contractor_reviews (id, contractor_id, user_id, offer_id, rating, comment) VALUES ($1, $2, $3, $4, $5, $6)",
            rid,
            review_data["contractor_id"],
            review_data["user_id"],
            review_data["offer_id"],
            review_data["rating"],
            review_data.get("comment"),
        )
        return (await self._pg_fetch_one("SELECT * FROM contractor_reviews WHERE id = $1", rid)) or {}

    async def update_contractor_rating(self, contractor_id: str) -> None:
        """Recalculate and update contractor average_rating and total_reviews."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_reviews").select("rating").eq("contractor_id", contractor_id).execute()
            reviews = result.data or []
        else:
            reviews = await self._pg_fetch_all(
                "SELECT rating FROM contractor_reviews WHERE contractor_id = $1",
                contractor_id,
            )
        if not reviews:
            return
        avg = sum(r["rating"] for r in reviews) / len(reviews)
        await self.update_contractor(contractor_id, {"average_rating": round(avg, 2), "total_reviews": len(reviews)})

    async def get_contractor_stats(self, contractor_id: str) -> dict[str, Any]:
        """Get contractor statistics."""
        c = await self.get_contractor(contractor_id)
        if not c:
            return {}
        reviews, total_reviews = await self.get_contractor_reviews(contractor_id, page=1, page_size=1)
        return {
            **c,
            "total_reviews": total_reviews,
            "average_rating": c.get("average_rating", 0),
            "completed_projects": c.get("completed_projects", 0),
        }

    # ---- Escalations ----

    async def create_escalation(self, escalation_data: dict[str, Any]) -> dict[str, Any]:
        """Create an escalation."""
        eid = escalation_data.get("id") or str(uuid.uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            data = {**escalation_data, "id": eid}
            for k in ("source_agent", "reason", "priority", "status"):
                if k in data and hasattr(data[k], "value"):
                    data[k] = data[k].value
            result = await client.table("escalations").insert(data).execute()
            return result.data[0] if result.data else data
        src = escalation_data.get("source_agent")
        reason = escalation_data.get("reason")
        prio = escalation_data.get("priority", "medium")
        status = escalation_data.get("status", "open")
        if hasattr(src, "value"): src = src.value
        if hasattr(reason, "value"): reason = reason.value
        if hasattr(prio, "value"): prio = prio.value
        if hasattr(status, "value"): status = status.value
        await self._pg_execute(
            """INSERT INTO escalations (id, user_id, conversation_id, source_agent, reason, priority, summary, status, assigned_to, context, agent_reasoning, resolution_notes, resolved_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
            eid,
            escalation_data["user_id"],
            escalation_data["conversation_id"],
            src, reason, escalation_data.get("summary", ""), status,
            escalation_data.get("assigned_to"),
            json.dumps(escalation_data.get("context") or {}),
            escalation_data.get("agent_reasoning"),
            escalation_data.get("resolution_notes"),
            escalation_data.get("resolved_at"),
        )
        return (await self._pg_fetch_one("SELECT * FROM escalations WHERE id = $1", eid)) or escalation_data

    async def list_escalations(
        self,
        filters: dict[str, Any],
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List escalations with filters. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            q = client.table("escalations").select("*", count="exact")
            for key in ("status", "priority", "source_agent", "assigned_to"):
                if filters.get(key):
                    q = q.eq(key, filters[key].value if hasattr(filters[key], "value") else filters[key])
            q = q.range((page - 1) * page_size, page * page_size - 1).order("created_at", desc=True)
            result = await q.execute()
            total = result.count if hasattr(result, "count") and result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts, args = [], []
        for key in ("status", "priority", "source_agent", "assigned_to"):
            if filters.get(key):
                v = filters[key]
                where_parts.append(f'"{key}" = ${len(args)+1}')
                args.append(v.value if hasattr(v, "value") else v)
        where = " AND ".join(where_parts) if where_parts else "1=1"
        total_row = await self._pg_fetch_one("SELECT COUNT(*) AS c FROM escalations WHERE " + where, *args)
        total = int(total_row["c"]) if total_row else 0
        n = len(args)
        args.extend([(page - 1) * page_size, page_size])
        rows = await self._pg_fetch_all(
            f"SELECT * FROM escalations WHERE {where} ORDER BY created_at DESC LIMIT ${n+1} OFFSET ${n+2}",
            *args,
        )
        return (rows, total)

    async def get_escalation(self, escalation_id: str) -> dict[str, Any] | None:
        """Get an escalation by ID."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalations").select("*").eq("id", escalation_id).limit(1).execute()
            return result.data[0] if result.data else None
        return await self._pg_fetch_one("SELECT * FROM escalations WHERE id = $1", escalation_id)

    async def update_escalation(self, escalation_id: str, update_data: dict[str, Any]) -> dict[str, Any]:
        """Update an escalation."""
        allowed = {"status", "priority", "assigned_to", "resolution_notes", "resolved_at"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        if not filtered:
            return (await self.get_escalation(escalation_id)) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            payload = {k: (v.value if hasattr(v, "value") else v) for k, v in filtered.items()}
            result = await client.table("escalations").update(payload).eq("id", escalation_id).execute()
            return result.data[0] if result.data else {}
        set_parts, args = [], []
        for i, (k, v) in enumerate(filtered.items(), 1):
            set_parts.append(f'"{k}" = ${i}')
            args.append(v.value if hasattr(v, "value") else v)
        args.append(escalation_id)
        await self._pg_execute(
            f"UPDATE escalations SET {', '.join(set_parts)} WHERE id = ${len(args)}", *args
        )
        return (await self._pg_fetch_one("SELECT * FROM escalations WHERE id = $1", escalation_id)) or {}

    async def get_escalation_stats(self) -> dict[str, Any]:
        """Get escalation statistics."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalations").select("status").execute()
            data = result.data or []
            by_status: dict[str, int] = {}
            for row in data:
                s = row.get("status", "unknown")
                by_status[s] = by_status.get(s, 0) + 1
        else:
            data = await self._pg_fetch_all(
                "SELECT status, COUNT(*) AS count FROM escalations GROUP BY status"
            )
            by_status = {str(row.get("status", "unknown")): int(row.get("count", 0)) for row in data}
        return {"by_status": by_status, "total": sum(by_status.values())}

    async def add_escalation_message(
        self, escalation_id: str, message_id: str, sender_type: str, sender_id: str, content: str
    ) -> None:
        """Add a message to an escalation thread."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("escalation_messages").insert({
                "id": message_id, "escalation_id": escalation_id, "sender_type": sender_type,
                "sender_id": sender_id, "content": content,
            }).execute()
        else:
            await self._pg_execute(
                """INSERT INTO escalation_messages (id, escalation_id, sender_type, sender_id, content)
                   VALUES ($1, $2, $3, $4, $5)""",
                message_id, escalation_id, sender_type, sender_id, content,
            )

    async def get_escalation_messages(self, escalation_id: str) -> list[dict[str, Any]]:
        """Get all messages for an escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalation_messages").select("*").eq("escalation_id", escalation_id).order("created_at").execute()
            return result.data or []
        return await self._pg_fetch_all(
            "SELECT * FROM escalation_messages WHERE escalation_id = $1 ORDER BY created_at",
            escalation_id,
        )

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
