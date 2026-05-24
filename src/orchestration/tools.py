"""Shared agent tools registry and utilities."""

import logging
from datetime import UTC, datetime
from typing import Any

from src.databases.graph_store import get_graph_store
from src.databases.postgres import get_postgres_client
from src.integrations.gov.client import get_gov_client
from src.rag.pipeline import get_rag_pipeline
from src.services.enrichment import get_enrichment_service

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry of tools available to agents.

    Each tool is a callable that performs a specific operation
    (database query, API call, calculation, etc.).
    """

    def __init__(self) -> None:
        self._tools: dict[str, Any] = {}
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        """Register all default tools."""
        self._tools = {
            "vector_search": self._vector_search,
            "graph_query": self._graph_query,
            "sql_query": self._sql_query,
            "get_order_status": self._get_order_status,
            "get_offer_details": self._get_offer_details,
            "get_market_data": self._get_market_data,
            "calculate_match_score": self._calculate_match_score,
            "analyze_sentiment": self._analyze_sentiment,
            "escalate_to_human": self._escalate_to_human,
            "create_support_ticket": self._create_support_ticket,
            "normalize_address": self._normalize_address,
            "verify_contractor_license": self._verify_contractor_license,
            "verify_contractor_registration": self._verify_contractor_registration,
            "get_municipality_info": self._get_municipality_info,
        }

    def get_tool(self, name: str) -> Any:
        """Get a tool by name."""
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        """List all registered tool names."""
        return list(self._tools.keys())

    # -- Tool Implementations --

    async def _vector_search(
        self,
        query: str,
        namespace: str,
        top_k: int = 10,
        filters: dict | None = None,
        strategy: str = "semantic",
    ) -> list[dict[str, Any]]:
        """Search the vector database."""
        rag = get_rag_pipeline()
        return await rag.retrieve(
            query=query,
            namespace=namespace,
            filters=filters,
            top_k=top_k,
            strategy=strategy,
        )

    async def _graph_query(self, query: str, params: dict | None = None) -> list[dict[str, Any]]:
        """Execute a Cypher query on the graph database."""
        graph = get_graph_store()
        return await graph.execute(query, params)

    async def _sql_query(self, query: str, params: dict | None = None) -> list[dict]:
        """Execute a SQL query on PostgreSQL."""
        db = get_postgres_client()
        return await db.execute_query(query, params)

    async def _get_order_status(self, user_id: str, limit: int = 5) -> list[dict[str, Any]]:
        """Get order status for a user."""
        db = get_postgres_client()
        return await db.get_user_orders(user_id, limit)

    async def _get_offer_details(self, building_id: str) -> list[dict[str, Any]]:
        """Get active offers for a building."""
        db = get_postgres_client()
        return await db.get_active_offers(building_id)

    async def _get_market_data(self, category: str, region: str) -> dict[str, Any]:
        """Get market pricing data."""
        db = get_postgres_client()
        return await db.get_market_data(category, region)

    async def _calculate_match_score(self, contractor: dict, request: dict) -> float:
        """Calculate contractor match score."""
        weights = {
            "semantic_similarity": 0.25,
            "graph_score": 0.25,
            "rating": 0.20,
            "price_competitiveness": 0.15,
            "availability": 0.10,
            "response_time": 0.05,
        }
        return sum(contractor.get(k, 0) * w for k, w in weights.items())

    async def _analyze_sentiment(self, text: str) -> float:
        """Analyze text sentiment."""
        from src.utils.llm_client import get_llm_client

        llm = get_llm_client()
        return await llm.analyze_sentiment(text)

    async def _escalate_to_human(
        self,
        user_id: str,
        conversation_id: str,
        reason: str,
        priority: str = "normal",
    ) -> dict[str, Any]:
        """Create escalation ticket."""
        return await self._create_support_ticket(
            user_id=user_id,
            conversation_id=conversation_id,
            reason=reason,
            priority=priority,
        )

    async def _create_support_ticket(
        self,
        user_id: str,
        conversation_id: str,
        reason: str,
        priority: str = "normal",
    ) -> dict[str, Any]:
        """Create a support ticket."""
        db = get_postgres_client()
        from src.utils.monitoring import generate_request_id

        ticket_data = {
            "id": generate_request_id(),
            "user_id": user_id,
            "conversation_id": conversation_id,
            "reason": reason,
            "priority": priority,
            "status": "open",
        }
        return await db.create_support_ticket(ticket_data)

    async def _normalize_address(self, address: str, city: str) -> dict[str, Any]:
        """Normalize address to canonical form. Returns address, city, street, municipality, confidence, source."""
        svc = get_enrichment_service()
        result = svc.normalize_address(address, city)
        return {
            "address": result.address,
            "city": result.city,
            "street": result.street,
            "house_number": result.house_number,
            "municipality": result.municipality,
            "confidence": result.confidence,
            "source": result.source,
        }

    async def _verify_contractor_license(
        self,
        license_number: str,
        business_name: str | None = None,
    ) -> dict[str, Any]:
        """Verify contractor license against government registry. Returns verified, confidence, source, verified_at."""
        svc = get_enrichment_service()
        result = svc.verify_contractor_license(license_number, business_name)
        return {
            "verified": result.verified,
            "confidence": result.confidence,
            "source": result.source,
            "verified_at": result.verified_at.isoformat(),
            "raw_response": result.raw_response,
        }

    async def _verify_contractor_registration(
        self,
        contractor_id: str,
        business_name: str,
        company_id: str | None = None,
    ) -> dict[str, Any]:
        """Look up contractor in the ICA companies registry and persist the result.

        Calls data.gov.il via GovDataClient.lookup_company, writes a row to
        contractor_verification_metadata, and returns a structured result dict.
        source is always "data_gov_il_companies".
        Absence of a match is confidence=0 — it is NOT counted as negative evidence.
        """
        source = "data_gov_il_companies"
        gov = get_gov_client()
        db = get_postgres_client()

        result = gov.lookup_company(name=business_name, company_id=company_id, limit=5)

        verified = False
        confidence = 0.0
        raw_response: dict | None = None

        if result.ok and result.value:
            best = result.value[0]
            verified = best.is_active
            confidence = 0.75 if best.is_active else 0.4
            raw_response = {
                "company_id": best.company_id,
                "name": best.name,
                "status": best.status,
                "city": best.city,
                "address": best.address,
                "cache_hit": result.cache_hit,
            }

        try:
            await db.upsert_contractor_verification(
                contractor_id=contractor_id,
                source=source,
                verified=verified,
                confidence=confidence,
                raw_response=raw_response or {},
            )
        except Exception as exc:
            logger.warning("Failed to persist verification for contractor %s: %s", contractor_id, exc)

        return {
            "contractor_id": contractor_id,
            "source": source,
            "verified": verified,
            "confidence": confidence,
            "verified_at": datetime.now(UTC).isoformat(),
            "raw_response": raw_response,
            "found": result.ok and bool(result.value),
        }

    async def _get_municipality_info(self, city: str) -> dict[str, Any] | None:
        """Get municipality metadata for a city. Returns None if not found."""
        svc = get_enrichment_service()
        result = svc.get_municipality_info(city)
        if result is None:
            return None
        return {
            "city": result.city,
            "municipality_name": result.municipality_name,
            "district": result.district,
            "region": result.region,
        }


_tool_registry: ToolRegistry | None = None


def get_tool_registry() -> ToolRegistry:
    """Get or create the singleton ToolRegistry."""
    global _tool_registry
    if _tool_registry is None:
        _tool_registry = ToolRegistry()
    return _tool_registry
