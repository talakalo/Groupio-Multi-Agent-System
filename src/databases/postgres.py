"""PostgreSQL/Supabase client for relational data operations."""

import json
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

import bcrypt
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

    def _hash_password(self, password: str) -> str:
        """Hash password for storage."""
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    async def create_contractor(
        self, contractor_data: dict[str, Any], password: str
    ) -> dict[str, Any]:
        """Create a user and contractor record."""
        user_id = str(uuid4())
        contractor_id = contractor_data["id"]
        hashed = self._hash_password(password)
        categories = contractor_data.get("categories", [])
        regions = contractor_data.get("regions", [])
        cat_list = [c if isinstance(c, str) else getattr(c, "value", c) for c in categories]
        reg_list = [r if isinstance(r, str) else getattr(r, "value", r) for r in regions]
        user_data = {
            "id": user_id,
            "email": contractor_data["email"],
            "hashed_password": hashed,
            "full_name": contractor_data.get("contact_name", contractor_data["email"]),
            "phone": contractor_data["phone"],
            "role": "contractor",
            "is_active": True,
            "is_verified": False,
            "contractor_id": contractor_id,
        }
        await self.create_user(user_data)
        await self.update_user(user_id, {"contractor_id": contractor_id})
        if self._use_supabase_client():
            client = await self._get_client()
            insert_data = {
                "id": contractor_id,
                "user_id": user_id,
                "business_name": contractor_data["business_name"],
                "contact_name": contractor_data.get("contact_name", ""),
                "email": contractor_data["email"],
                "phone": contractor_data["phone"],
                "description": contractor_data.get("description", ""),
                "categories": cat_list,
                "regions": reg_list,
                "years_experience": contractor_data.get("years_experience", 0),
                "employee_count": contractor_data.get("employee_count", 1),
                "website": contractor_data.get("website"),
                "verification_status": contractor_data.get("verification_status", "pending"),
                "trust_score": float(contractor_data.get("trust_score", 0)),
                "license_number": contractor_data.get("license_number"),
            }
            result = await client.table("contractors").insert(insert_data).execute()
            return result.data[0] if result.data else insert_data
        await self._pg_execute(
            """INSERT INTO contractors (id, user_id, business_name, contact_name, email, phone, description,
               categories, regions, years_experience, employee_count, website, verification_status, trust_score, license_number)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)""",
            contractor_id, user_id, contractor_data["business_name"], contractor_data.get("contact_name", ""),
            contractor_data["email"], contractor_data["phone"], contractor_data.get("description", ""),
            cat_list, reg_list, contractor_data.get("years_experience", 0), contractor_data.get("employee_count", 1),
            contractor_data.get("website"), contractor_data.get("verification_status", "pending"),
            float(contractor_data.get("trust_score", 0)), contractor_data.get("license_number"),
        )
        return await self._pg_fetch_one("SELECT * FROM contractors WHERE id = $1", contractor_id) or contractor_data

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
            if filters.get("verification_status"):
                q = q.eq("verification_status", filters["verification_status"])
            if filters.get("min_trust_score") is not None:
                q = q.gte("trust_score", filters["min_trust_score"])
            if filters.get("category"):
                q = q.contains("categories", [filters["category"]])
            if filters.get("region"):
                q = q.contains("regions", [filters["region"]])
            q = q.order("trust_score", desc=True).range((page - 1) * page_size, page * page_size - 1)
            result = await q.execute()
            total = result.count if result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        if filters.get("verification_status"):
            args.append(filters["verification_status"])
            where_parts.append(f"verification_status = ${len(args)}")
        if filters.get("min_trust_score") is not None:
            args.append(filters["min_trust_score"])
            where_parts.append(f"trust_score >= ${len(args)}")
        where_sql = " AND ".join(where_parts) if where_parts else "TRUE"
        if filters.get("category"):
            args.append(filters["category"])
            where_sql += f" AND ${len(args)} = ANY(categories)"
        if filters.get("region"):
            args.append(filters["region"])
            where_sql += f" AND ${len(args)} = ANY(regions)"
        total_row = await self._pg_fetch_one(f"SELECT COUNT(*) AS c FROM contractors WHERE {where_sql}", *args)
        total = int(total_row["c"]) if total_row else 0
        n = len(args)
        args.extend([page_size, (page - 1) * page_size])
        rows = await self._pg_fetch_all(
            f"SELECT * FROM contractors WHERE {where_sql} ORDER BY trust_score DESC NULLS LAST LIMIT ${n+1} OFFSET ${n+2}",
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
        return await self._pg_fetch_all(f"SELECT * FROM contractors WHERE id IN ({placeholders})", *contractor_ids)

    async def update_contractor(
        self, contractor_id: str, update_data: dict[str, Any]
    ) -> dict[str, Any]:
        """Update a contractor."""
        allowed = {"business_name", "contact_name", "phone", "description", "categories", "regions", "years_experience", "employee_count", "website", "verification_status", "trust_score", "trust_score_breakdown", "license_number", "license_verified", "insurance_expiry", "insurance_verified"}
        filtered = {k: v for k, v in update_data.items() if k in allowed}
        for k in ("categories", "regions"):
            if k in filtered and filtered[k] is not None:
                v = filtered[k]
                filtered[k] = [x if isinstance(x, str) else getattr(x, "value", x) for x in v]
        if not filtered:
            return await self.get_contractor(contractor_id) or {}
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("contractors").update(filtered).eq("id", contractor_id).execute()
            return await self.get_contractor(contractor_id) or {}
        set_parts = [f'"{k}" = ${i}' for i, k in enumerate(filtered, 1)]
        args = list(filtered.values()) + [contractor_id]
        await self._pg_execute(
            f"UPDATE contractors SET {', '.join(set_parts)} WHERE id = ${len(args)}",
            *args,
        )
        return await self.get_contractor(contractor_id) or {}

    async def get_contractor_reviews(
        self, contractor_id: str, page: int = 1, page_size: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """Get reviews for a contractor. Returns (items, total)."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("contractor_reviews")
                .select("*")
                .eq("contractor_id", contractor_id)
                .order("created_at", desc=True)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            count_r = await client.table("contractor_reviews").select("id", count="exact").eq("contractor_id", contractor_id).execute()
            total = count_r.count or 0
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

    async def has_user_completed_offer_with_contractor(self, user_id: str, contractor_id: str) -> bool:
        """Check if user has completed an offer with this contractor (e.g. for leaving a review)."""
        if self._use_supabase_client():
            client = await self._get_client()
            offers_result = await client.table("offers").select("id").eq("matched_contractor_id", contractor_id).execute()
            offer_ids = [r["id"] for r in (offers_result.data or [])]
            if not offer_ids:
                return False
            part_result = await client.table("offer_participants").select("id").eq("user_id", user_id).in_("offer_id", offer_ids).limit(1).execute()
            return bool(part_result.data)
        row = await self._pg_fetch_one(
            """SELECT 1 FROM offer_participants op
               JOIN offers o ON o.id = op.offer_id AND o.matched_contractor_id = $2
               WHERE op.user_id = $1 LIMIT 1""",
            user_id, contractor_id,
        )
        return row is not None

    async def create_review(self, review_data: dict[str, Any]) -> dict[str, Any]:
        """Create a contractor review."""
        rid = str(uuid4())
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_reviews").insert({**review_data, "id": rid}).execute()
            return result.data[0] if result.data else {**review_data, "id": rid}
        await self._pg_execute(
            "INSERT INTO contractor_reviews (id, contractor_id, user_id, offer_id, rating, comment) VALUES ($1, $2, $3, $4, $5, $6)",
            rid,
            review_data["contractor_id"],
            review_data["user_id"],
            review_data["offer_id"],
            review_data["rating"],
            review_data.get("comment"),
        )
        return await self._pg_fetch_one("SELECT * FROM contractor_reviews WHERE id = $1", rid) or review_data

    async def update_contractor_rating(self, contractor_id: str) -> None:
        """Recalculate and update contractor average_rating and total_reviews."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("contractor_reviews").select("rating").eq("contractor_id", contractor_id).execute()
            reviews = result.data or []
            if not reviews:
                return
            avg = sum(r["rating"] for r in reviews) / len(reviews)
            await client.table("contractors").update({"average_rating": avg, "total_reviews": len(reviews)}).eq("id", contractor_id).execute()
        else:
            row = await self._pg_fetch_one(
                "SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM contractor_reviews WHERE contractor_id = $1",
                contractor_id,
            )
            if row and row["cnt"]:
                await self._pg_execute(
                    "UPDATE contractors SET average_rating = $1, total_reviews = $2 WHERE id = $3",
                    float(row["avg"]), row["cnt"], contractor_id,
                )

    async def get_contractor_stats(self, contractor_id: str) -> dict[str, Any]:
        """Get aggregate stats for a contractor."""
        if self._use_supabase_client():
            client = await self._get_client()
            c = await self.get_contractor(contractor_id)
            if not c:
                return {}
            result = await client.table("offers").select("id", count="exact").eq("matched_contractor_id", contractor_id).execute()
            return {"activeOffers": result.count or 0, "completedProjects": c.get("completed_projects", 0), "totalRevenue": 0, "averageRating": c.get("average_rating", 0), "trustScore": c.get("trust_score", 0)}
        c = await self.get_contractor(contractor_id)
        if not c:
            return {}
        row = await self._pg_fetch_one(
            "SELECT COUNT(*) AS active_offers FROM offers WHERE matched_contractor_id = $1 AND status = 'active'",
            contractor_id,
        )
        return {
            "activeOffers": int(row["active_offers"]) if row else 0,
            "completedProjects": c.get("completed_projects", 0),
            "totalRevenue": 0,
            "averageRating": c.get("average_rating", 0),
            "trustScore": c.get("trust_score", 0),
        }

    async def create_escalation(self, escalation_data: dict[str, Any]) -> dict[str, Any]:
        """Create an escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalations").insert(escalation_data).execute()
            return result.data[0] if result.data else escalation_data
        e = escalation_data
        await self._pg_execute(
            """INSERT INTO escalations (id, user_id, conversation_id, source_agent, reason, priority, summary, status, assigned_to, context, agent_reasoning, resolution_notes, resolved_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
            e["id"], e["user_id"], e["conversation_id"], e["source_agent"], e["reason"],
            e.get("priority", "medium"), e["summary"], e.get("status", "open"), e.get("assigned_to"),
            e.get("context") or {}, e.get("agent_reasoning"), e.get("resolution_notes"), e.get("resolved_at"),
        )
        return await self._pg_fetch_one("SELECT * FROM escalations WHERE id = $1", e["id"]) or e

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
            if filters.get("status"):
                q = q.eq("status", filters["status"] if isinstance(filters["status"], str) else filters["status"])
            if filters.get("priority"):
                q = q.eq("priority", filters["priority"])
            if filters.get("assigned_to"):
                q = q.eq("assigned_to", filters["assigned_to"])
            if filters.get("source_agent"):
                q = q.eq("source_agent", filters["source_agent"])
            q = q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1)
            result = await q.execute()
            total = result.count if result.count is not None else len(result.data or [])
            return (result.data or [], total)
        where_parts = []
        args: list[Any] = []
        if filters.get("status"):
            args.append(filters["status"] if isinstance(filters["status"], str) else getattr(filters["status"], "value", filters["status"]))
            where_parts.append(f"status = ${len(args)}")
        if filters.get("priority"):
            args.append(filters["priority"])
            where_parts.append(f"priority = ${len(args)}")
        if filters.get("assigned_to"):
            args.append(filters["assigned_to"])
            where_parts.append(f"assigned_to = ${len(args)}")
        where_sql = " AND ".join(where_parts) if where_parts else "TRUE"
        total_row = await self._pg_fetch_one(f"SELECT COUNT(*) AS c FROM escalations WHERE {where_sql}", *args)
        total = int(total_row["c"]) if total_row else 0
        n = len(args)
        args.extend([page_size, (page - 1) * page_size])
        rows = await self._pg_fetch_all(
            f"SELECT * FROM escalations WHERE {where_sql} ORDER BY created_at DESC LIMIT ${n+1} OFFSET ${n+2}",
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
            return await self.get_escalation(escalation_id) or {}
        set_parts = [f'"{k}" = ${i}' for i, k in enumerate(filtered, 1)]
        args = list(filtered.values()) + [escalation_id]
        await self._pg_execute(
            f"UPDATE escalations SET {', '.join(set_parts)} WHERE id = ${len(args)}",
            *args,
        )
        return await self.get_escalation(escalation_id) or {}

    async def get_escalation_stats(self) -> dict[str, Any]:
        """Get escalation statistics."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = await client.table("escalations").select("status").execute()
            data = result.data or []
            total = len(data)
            by_status = {}
            for r in data:
                s = r.get("status", "open")
                by_status[s] = by_status.get(s, 0) + 1
            return {"total": total, "by_status": by_status}
        rows = await self._pg_fetch_all("SELECT status FROM escalations")
        total = len(rows)
        by_status = {}
        for r in rows:
            s = r.get("status", "open")
            by_status[s] = by_status.get(s, 0) + 1
        return {"total": total, "by_status": by_status}

    async def add_escalation_message(
        self, escalation_id: str, message_id: str, sender_type: str, sender_id: str, content: str
    ) -> None:
        """Add a message to an escalation."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("escalation_messages").insert({
                "id": message_id, "escalation_id": escalation_id, "sender_type": sender_type,
                "sender_id": sender_id, "content": content,
            }).execute()
        else:
            await self._pg_execute(
                "INSERT INTO escalation_messages (id, escalation_id, sender_type, sender_id, content) VALUES ($1, $2, $3, $4, $5)",
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
