"""PostgreSQL/Supabase client for relational data operations."""

import logging
from typing import Any

from supabase import AsyncClient, acreate_client
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class PostgresClient:
    """Supabase/PostgreSQL client for relational data operations."""

    def __init__(self) -> None:
        self._client: AsyncClient | None = None

    async def _get_client(self) -> AsyncClient:
        """Lazily initialize the async Supabase client."""
        if self._client is None:
            settings = get_settings()
            self._client = await acreate_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_KEY,
            )
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def execute_query(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        """Execute a raw SQL query via Supabase RPC.

        For more complex queries, use the Supabase `rpc` method with a
        database function, or use the table-level query builder below.
        """
        client = await self._get_client()
        result = await client.rpc("execute_sql", {"query": query, "params": params or {}}).execute()
        return result.data if result.data else []

    async def get_user_profile(self, user_id: str) -> dict[str, Any] | None:
        """Get a user profile by ID."""
        client = await self._get_client()
        result = await client.table("residents").select("*").eq("id", user_id).execute()
        return result.data[0] if result.data else None

    async def get_building(self, building_id: str) -> dict[str, Any] | None:
        """Get building details by ID."""
        client = await self._get_client()
        result = await client.table("buildings").select("*").eq("id", building_id).execute()
        return result.data[0] if result.data else None

    async def get_building_by_phone(self, phone: str) -> str | None:
        """Look up building ID from a phone number."""
        client = await self._get_client()
        result = (
            await client.table("residents")
            .select("building_id")
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        return result.data[0]["building_id"] if result.data else None

    async def get_active_offers(self, building_id: str) -> list[dict[str, Any]]:
        """Get active offers for a building."""
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

    async def get_user_orders(
        self, user_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """Get recent orders for a user."""
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

    async def get_market_data(
        self, category: str, region: str, months: int = 6
    ) -> dict[str, Any]:
        """Get market pricing data for a category and region."""
        client = await self._get_client()
        result = await client.rpc(
            "get_market_data",
            {
                "p_category": category,
                "p_region": region,
                "p_months": months,
            },
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
        client = await self._get_client()
        result = (
            await client.table("support_tickets").insert(ticket_data).execute()
        )
        return result.data[0] if result.data else ticket_data

    async def log_conversation(
        self,
        user_id: str,
        message: str,
        response: dict,
        metadata: dict,
    ) -> None:
        """Log a conversation exchange."""
        client = await self._get_client()
        await client.table("conversation_logs").insert(
            {
                "user_id": user_id,
                "message": message,
                "response": response,
                "metadata": metadata,
            }
        ).execute()

    async def get_contractor_documents(
        self, contractor_id: str
    ) -> list[dict[str, Any]]:
        """Get uploaded documents for a contractor."""
        client = await self._get_client()
        result = (
            await client.table("contractor_documents")
            .select("*")
            .eq("contractor_id", contractor_id)
            .execute()
        )
        return result.data or []

    async def health_check(self) -> bool:
        """Check if Supabase/PostgreSQL is accessible."""
        try:
            client = await self._get_client()
            await client.table("residents").select("id").limit(1).execute()
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
