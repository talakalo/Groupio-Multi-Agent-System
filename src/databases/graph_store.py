"""Neo4j graph database operations for relationship modeling."""

import logging
from typing import Any

from neo4j import AsyncGraphDatabase, AsyncDriver
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class GraphStore:
    """Neo4j graph database client for relationship queries."""

    def __init__(self) -> None:
        settings = get_settings()
        self._driver: AsyncDriver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )

    async def close(self) -> None:
        """Close the driver connection."""
        await self._driver.close()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def execute(
        self, query: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Execute a Cypher query and return results."""
        async with self._driver.session() as session:
            result = await session.run(query, params or {})
            records = [dict(record) for record in await result.data()]
            return records

    async def find_matching_contractors(
        self,
        building_type: str,
        region: str,
        category: str | None = None,
        min_success_rate: float = 0.85,
        min_projects: int = 3,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Find contractors with proven track records in similar buildings."""
        query = """
        MATCH (c:Contractor)-[comp:COMPLETED]->(b:Building)
        WHERE b.type = $building_type
          AND b.region = $region
          AND comp.success_rate >= $min_success_rate
        """
        params: dict[str, Any] = {
            "building_type": building_type,
            "region": region,
            "min_success_rate": min_success_rate,
            "min_projects": min_projects,
            "limit": limit,
        }

        if category:
            query += " AND $category IN c.categories"
            params["category"] = category

        query += """
        WITH c, COUNT(b) as projects, AVG(comp.success_rate) as avg_success
        WHERE projects >= $min_projects
        RETURN c {.*, projects: projects, avg_success: avg_success}
        ORDER BY avg_success DESC
        LIMIT $limit
        """

        return await self.execute(query, params)

    async def get_building_neighbors_on_offer(
        self, offer_id: str
    ) -> list[dict[str, Any]]:
        """Get residents who joined a specific offer."""
        query = """
        MATCH (r:Resident)-[j:JOINED]->(o:Offer {id: $offer_id})
        MATCH (r)-[:LIVES_IN]->(b:Building)
        RETURN r {.*, join_status: j.status, joined_at: j.joined_at},
               b.address as building_address
        ORDER BY j.joined_at
        """
        return await self.execute(query, {"offer_id": offer_id})

    async def get_contractor_reputation(
        self, contractor_id: str
    ) -> dict[str, Any]:
        """Calculate contractor reputation from graph patterns."""
        query = """
        MATCH (c:Contractor {id: $contractor_id})
        OPTIONAL MATCH (c)-[comp:COMPLETED]->(b:Building)
        OPTIONAL MATCH (r:Resident)-[rev:REVIEWED]->(c)
        WITH c,
             COUNT(DISTINCT b) as total_projects,
             AVG(comp.success_rate) as avg_success_rate,
             COUNT(DISTINCT rev) as total_reviews,
             AVG(rev.rating) as avg_review_rating
        RETURN {
            contractor_id: c.id,
            business_name: c.business_name,
            total_projects: total_projects,
            avg_success_rate: COALESCE(avg_success_rate, 0),
            total_reviews: total_reviews,
            avg_review_rating: COALESCE(avg_review_rating, 0),
            verified: c.verified,
            rating: c.rating
        } as reputation
        """
        results = await self.execute(query, {"contractor_id": contractor_id})
        return results[0]["reputation"] if results else {}

    async def detect_suspicious_patterns(
        self, contractor_id: str
    ) -> list[dict[str, Any]]:
        """Detect suspicious patterns for fraud detection."""
        query = """
        MATCH (c:Contractor {id: $contractor_id})
        OPTIONAL MATCH (c)-[comp:COMPLETED]->(b:Building)
        WHERE comp.success_rate < 0.5
        WITH c, COUNT(b) as failed_projects

        OPTIONAL MATCH (r:Resident)-[rev:REVIEWED {rating: 1}]->(c)
        WITH c, failed_projects, COUNT(rev) as one_star_reviews

        OPTIONAL MATCH (c)-[:CREATED]->(o:Offer {status: 'cancelled'})
        WITH c, failed_projects, one_star_reviews, COUNT(o) as cancelled_offers

        RETURN {
            contractor_id: c.id,
            failed_projects: failed_projects,
            one_star_reviews: one_star_reviews,
            cancelled_offers: cancelled_offers,
            suspicious: (failed_projects > 2
                         OR one_star_reviews > 5
                         OR cancelled_offers > 3)
        } as patterns
        """
        results = await self.execute(query, {"contractor_id": contractor_id})
        return results[0]["patterns"] if results else {}

    async def get_contractor_building_history(
        self, contractor_id: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        """Get a contractor's past project history with buildings."""
        query = """
        MATCH (c:Contractor {id: $contractor_id})-[comp:COMPLETED]->(b:Building)
        RETURN b {.*,
            success_rate: comp.success_rate,
            completion_date: comp.completion_date,
            final_price: comp.final_price
        }
        ORDER BY comp.completion_date DESC
        LIMIT $limit
        """
        return await self.execute(
            query, {"contractor_id": contractor_id, "limit": limit}
        )

    async def recommend_contractors_by_network(
        self, building_id: str, category: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """Recommend contractors based on network effects.

        Find contractors who performed well in buildings with similar
        characteristics or that share residents with the target building.
        """
        query = """
        MATCH (target:Building {id: $building_id})
        MATCH (c:Contractor)-[comp:COMPLETED]->(similar:Building)
        WHERE similar.region = target.region
          AND similar.type = target.type
          AND $category IN c.categories
          AND comp.success_rate >= 0.8
          AND c.verified = true
        WITH c, COUNT(DISTINCT similar) as similar_projects,
             AVG(comp.success_rate) as avg_success
        ORDER BY similar_projects DESC, avg_success DESC
        LIMIT $limit
        RETURN c {.*, similar_projects: similar_projects, avg_success: avg_success}
        """
        return await self.execute(
            query,
            {
                "building_id": building_id,
                "category": category,
                "limit": limit,
            },
        )

    async def create_schema(self) -> None:
        """Create constraints and indexes for the graph schema."""
        constraints = [
            "CREATE CONSTRAINT resident_id IF NOT EXISTS "
            "FOR (r:Resident) REQUIRE r.id IS UNIQUE",
            "CREATE CONSTRAINT building_id IF NOT EXISTS "
            "FOR (b:Building) REQUIRE b.id IS UNIQUE",
            "CREATE CONSTRAINT contractor_id IF NOT EXISTS "
            "FOR (c:Contractor) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT offer_id IF NOT EXISTS "
            "FOR (o:Offer) REQUIRE o.id IS UNIQUE",
        ]

        indexes = [
            "CREATE INDEX contractor_region IF NOT EXISTS "
            "FOR (c:Contractor) ON (c.regions)",
            "CREATE INDEX building_region IF NOT EXISTS "
            "FOR (b:Building) ON (b.region)",
            "CREATE INDEX offer_status IF NOT EXISTS "
            "FOR (o:Offer) ON (o.status)",
        ]

        for stmt in constraints + indexes:
            try:
                await self.execute(stmt)
                logger.info("Executed: %s", stmt[:60])
            except Exception:
                logger.warning("Schema statement skipped: %s", stmt[:60])

    async def health_check(self) -> bool:
        """Check if Neo4j is accessible."""
        try:
            await self.execute("RETURN 1 as n")
            return True
        except Exception:
            logger.exception("Neo4j health check failed")
            return False


_graph_store: GraphStore | None = None


def get_graph_store() -> GraphStore:
    """Get or create the singleton GraphStore instance."""
    global _graph_store
    if _graph_store is None:
        _graph_store = GraphStore()
    return _graph_store
