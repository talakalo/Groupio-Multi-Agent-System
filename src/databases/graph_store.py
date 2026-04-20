"""Neo4j graph database operations for relationship modeling."""

import logging
from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase
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
            max_connection_pool_size=50,
            connection_acquisition_timeout=30,
        )

    async def close(self) -> None:
        """Close the driver connection."""
        await self._driver.close()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def execute(self, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
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

    async def get_building_neighbors_on_offer(self, offer_id: str) -> list[dict[str, Any]]:
        """Get residents who joined a specific offer."""
        query = """
        MATCH (r:Resident)-[j:JOINED]->(o:Offer {id: $offer_id})
        MATCH (r)-[:LIVES_IN]->(b:Building)
        RETURN r {.*, join_status: j.status, joined_at: j.joined_at},
               b.address as building_address
        ORDER BY j.joined_at
        """
        return await self.execute(query, {"offer_id": offer_id})

    async def get_contractor_reputation(self, contractor_id: str) -> dict[str, Any]:
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

    async def detect_suspicious_patterns(self, contractor_id: str) -> list[dict[str, Any]]:
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

    async def get_contractor_building_history(self, contractor_id: str, limit: int = 10) -> list[dict[str, Any]]:
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
        return await self.execute(query, {"contractor_id": contractor_id, "limit": limit})

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
            "CREATE CONSTRAINT resident_id IF NOT EXISTS FOR (r:Resident) REQUIRE r.id IS UNIQUE",
            "CREATE CONSTRAINT building_id IF NOT EXISTS FOR (b:Building) REQUIRE b.id IS UNIQUE",
            "CREATE CONSTRAINT contractor_id IF NOT EXISTS FOR (c:Contractor) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT offer_id IF NOT EXISTS FOR (o:Offer) REQUIRE o.id IS UNIQUE",
            # Viral invite chain
            "CREATE CONSTRAINT invite_event_id IF NOT EXISTS FOR (e:InviteEvent) REQUIRE e.id IS UNIQUE",
        ]

        indexes = [
            "CREATE INDEX contractor_region IF NOT EXISTS FOR (c:Contractor) ON (c.regions)",
            "CREATE INDEX building_region IF NOT EXISTS FOR (b:Building) ON (b.region)",
            "CREATE INDEX offer_status IF NOT EXISTS FOR (o:Offer) ON (o.status)",
            # Viral invite chain indexes
            "CREATE INDEX building_type_region IF NOT EXISTS FOR (b:Building) ON (b.building_type, b.region)",
            "CREATE INDEX resident_city IF NOT EXISTS FOR (r:Resident) ON (r.city)",
            # Materialised edge indexes
            "CREATE INDEX similar_to_score IF NOT EXISTS FOR ()-[r:SIMILAR_TO]-() ON (r.similarity_score)",
            "CREATE INDEX influenced_score IF NOT EXISTS FOR ()-[r:INFLUENCED]-() ON (r.influence_score)",
        ]

        for stmt in constraints + indexes:
            try:
                await self.execute(stmt)
                logger.info("Executed: %s", stmt[:60])
            except Exception:
                logger.warning("Schema statement skipped: %s", stmt[:60])

    # -----------------------------------------------------------------------
    # Feature 1: Viral Invite Chain
    # -----------------------------------------------------------------------

    async def record_invite_event(
        self,
        inviter_id: str,
        invitee_id: str,
        offer_id: str,
        channel: str = "whatsapp",
    ) -> dict[str, Any]:
        """Record an invite from one resident to another for an offer (idempotent)."""
        query = """
        MATCH (inviter:Resident {id: $inviter_id}), (invitee:Resident {id: $invitee_id})
        MERGE (inviter)-[r:INVITED {offer_id: $offer_id, invitee_id: $invitee_id}]->(invitee)
        ON CREATE SET r.channel = $channel,
                      r.created_at = datetime(),
                      r.converted = false
        RETURN {
            inviter_id: inviter.id,
            invitee_id: invitee.id,
            offer_id: r.offer_id,
            channel: r.channel,
            converted: r.converted
        } as invite
        """
        results = await self.execute(
            query,
            {
                "inviter_id": inviter_id,
                "invitee_id": invitee_id,
                "offer_id": offer_id,
                "channel": channel,
            },
        )
        return results[0]["invite"] if results else {}

    async def mark_invite_converted(self, invitee_id: str, offer_id: str) -> None:
        """Mark all INVITED edges pointing at invitee for this offer as converted."""
        query = """
        MATCH (:Resident)-[r:INVITED {offer_id: $offer_id, invitee_id: $invitee_id}]->
              (:Resident {id: $invitee_id})
        SET r.converted = true,
            r.converted_at = datetime()
        """
        await self.execute(query, {"invitee_id": invitee_id, "offer_id": offer_id})

    async def get_viral_invite_chain(
        self,
        offer_id: str,
        resident_id: str,
        max_depth: int = 4,
    ) -> dict[str, Any]:
        """Return the invite tree rooted at resident_id for the given offer."""
        query = """
        MATCH (root:Resident {id: $resident_id})
        OPTIONAL MATCH path = (root)-[:INVITED*1..$max_depth {offer_id: $offer_id}]->(invitee:Resident)
        WITH root,
             COLLECT(DISTINCT {
                 id: invitee.id,
                 first_name: split(coalesce(invitee.name, ''), ' ')[0],
                 converted: EXISTS((invitee)-[:JOINED]->(:Offer {id: $offer_id}))
             }) as chain_nodes,
             COUNT(DISTINCT invitee) as total_invites,
             COUNT(DISTINCT CASE WHEN EXISTS((invitee)-[:JOINED]->(:Offer {id: $offer_id}))
                   THEN invitee END) as conversions
        RETURN {
            root_id: root.id,
            chain_nodes: chain_nodes,
            total_invites: total_invites,
            conversions: conversions,
            depth: $max_depth
        } as chain
        """
        results = await self.execute(
            query,
            {"resident_id": resident_id, "offer_id": offer_id, "max_depth": max_depth},
        )
        if results:
            return results[0]["chain"]
        return {"root_id": resident_id, "chain_nodes": [], "total_invites": 0, "conversions": 0, "depth": max_depth}

    async def get_invite_momentum_for_offer(
        self,
        offer_id: str,
        building_id: str,
    ) -> dict[str, Any]:
        """Return per-building invite and join stats for a given offer."""
        query = """
        MATCH (r:Resident)-[:LIVES_IN]->(b:Building {id: $building_id})
        OPTIONAL MATCH (r)-[inv:INVITED {offer_id: $offer_id}]->(:Resident)
        OPTIONAL MATCH (r)-[j:JOINED]->(o:Offer {id: $offer_id})
        WITH
            COUNT(DISTINCT r) as building_residents,
            COUNT(DISTINCT CASE WHEN j IS NOT NULL THEN r END) as joined_count,
            COUNT(DISTINCT inv) as total_invites,
            COUNT(DISTINCT CASE WHEN inv.converted = true THEN inv END) as converted_invites
        RETURN {
            building_residents: building_residents,
            joined_count: joined_count,
            total_invites: total_invites,
            converted_invites: converted_invites
        } as momentum
        """
        results = await self.execute(query, {"offer_id": offer_id, "building_id": building_id})
        if results:
            return results[0]["momentum"]
        return {"building_residents": 0, "joined_count": 0, "total_invites": 0, "converted_invites": 0}

    # -----------------------------------------------------------------------
    # Feature 2: Building Similarity Clusters
    # -----------------------------------------------------------------------

    async def compute_and_store_similarity_edges(
        self,
        region: str | None = None,
        batch_size: int = 500,
    ) -> int:
        """Compute and materialise SIMILAR_TO edges between buildings. Returns edge count written.

        PERF-11: when ``ENABLE_GDS_SIMILARITY`` is on, keeps only the top-K
        highest-scoring neighbours per building (configurable via
        ``GDS_SIMILARITY_TOP_K`` / ``GDS_SIMILARITY_MIN_SCORE``). This turns
        the worst-case O(n^2) edge set into O(n * k), which keeps Neo4j
        storage/edge count linear with building count. The default (flag off)
        preserves the original exhaustive computation for safety.
        """
        from src.config.settings import get_settings

        settings = get_settings()
        region_filter = "AND a.region = $region AND b.region = $region" if region else ""
        params: dict[str, Any] = {}
        if region:
            params["region"] = region

        if settings.ENABLE_GDS_SIMILARITY:
            params["min_score"] = float(settings.GDS_SIMILARITY_MIN_SCORE)
            params["top_k"] = int(settings.GDS_SIMILARITY_TOP_K)
            query = f"""
            MATCH (a:Building), (b:Building)
            WHERE a.id < b.id
              AND a.region = b.region
              AND a.building_type = b.building_type
              AND abs(coalesce(a.units, 0) - coalesce(b.units, 0)) <=
                  coalesce(a.units, 1) * 0.3
              {region_filter}
            WITH a, b,
                 0.4 + CASE WHEN a.building_type = b.building_type THEN 0.3 ELSE 0.0 END as structural_score
            OPTIONAL MATCH (ra:Resident)-[:LIVES_IN]->(a)
            OPTIONAL MATCH (rb:Resident)-[:LIVES_IN]->(b)
            OPTIONAL MATCH (ra)-[:JOINED]->(shared:Offer)<-[:JOINED]-(rb)
            WITH a, b, structural_score,
                 COUNT(DISTINCT shared) as shared_offers
            WITH a, b,
                 structural_score + (toFloat(shared_offers) * 0.1) as raw_score
            WHERE raw_score >= $min_score
            WITH a, collect({{peer: b, score: raw_score}}) AS peers
            UNWIND [p IN peers[0..$top_k] | p] AS pick
            WITH a, pick.peer AS b, pick.score AS raw_score
            MERGE (a)-[s:SIMILAR_TO]->(b)
            SET s.similarity_score = raw_score,
                s.computed_at = datetime(),
                s.basis = ['region', 'building_type', 'unit_count', 'shared_offers']
            RETURN COUNT(s) as edges_written
            """
            results = await self.execute(query, params)
            return int(results[0]["edges_written"]) if results else 0

        query = f"""
        MATCH (a:Building), (b:Building)
        WHERE a.id < b.id
          AND a.region = b.region
          AND a.building_type = b.building_type
          AND abs(coalesce(a.units, 0) - coalesce(b.units, 0)) <=
              coalesce(a.units, 1) * 0.3
          {region_filter}
        WITH a, b,
             0.4 + CASE WHEN a.building_type = b.building_type THEN 0.3 ELSE 0.0 END as structural_score
        OPTIONAL MATCH (ra:Resident)-[:LIVES_IN]->(a)
        OPTIONAL MATCH (rb:Resident)-[:LIVES_IN]->(b)
        OPTIONAL MATCH (ra)-[:JOINED]->(shared:Offer)<-[:JOINED]-(rb)
        WITH a, b, structural_score,
             COUNT(DISTINCT shared) as shared_offers
        WITH a, b,
             structural_score + (toFloat(shared_offers) * 0.1) as raw_score
        WHERE raw_score >= 0.5
        MERGE (a)-[s:SIMILAR_TO]->(b)
        SET s.similarity_score = raw_score,
            s.computed_at = datetime(),
            s.basis = ['region', 'building_type', 'unit_count', 'shared_offers']
        RETURN COUNT(s) as edges_written
        """
        results = await self.execute(query, params)
        return int(results[0]["edges_written"]) if results else 0

    async def get_building_similarity_clusters(
        self,
        building_id: str,
        category: str | None = None,
        limit: int = 20,
        min_similarity_score: float = 0.6,
    ) -> list[dict[str, Any]]:
        """Return similar buildings and their offer participation history.

        Uses materialised SIMILAR_TO edges when available; falls back to a
        structural query when no edges exist yet.
        """
        # Try materialised path first
        primary_query = """
        MATCH (target:Building {id: $building_id})-[s:SIMILAR_TO]->(similar:Building)
        WHERE s.similarity_score >= $min_score
        MATCH (r:Resident)-[:LIVES_IN]->(similar)
        MATCH (r)-[:JOINED]->(o:Offer)
        WHERE ($category IS NULL OR o.category = $category)
          AND o.status IN ['completed', 'matched', 'matching']
        WITH similar, s.similarity_score as score, o.category as category,
             COUNT(DISTINCT o) as offers_joined,
             COUNT(DISTINCT r) as residents_joined
        RETURN {
            building_id: similar.id,
            address: similar.address,
            region: similar.region,
            similarity_score: score,
            category: category,
            offers_joined: offers_joined,
            residents_joined: residents_joined
        } as cluster
        ORDER BY score DESC, offers_joined DESC
        LIMIT $limit
        """
        results = await self.execute(
            primary_query,
            {
                "building_id": building_id,
                "min_score": min_similarity_score,
                "category": category,
                "limit": limit,
            },
        )
        if results:
            return [r["cluster"] for r in results]

        # Fallback: structural similarity without materialised edges
        fallback_query = """
        MATCH (target:Building {id: $building_id})
        MATCH (similar:Building)
        WHERE similar.id <> $building_id
          AND similar.region = target.region
          AND similar.building_type = target.building_type
          AND abs(coalesce(similar.units, 0) - coalesce(target.units, 0)) <=
              coalesce(target.units, 1) * 0.3
        MATCH (r:Resident)-[:LIVES_IN]->(similar)
        MATCH (r)-[:JOINED]->(o:Offer)
        WHERE ($category IS NULL OR o.category = $category)
          AND o.status IN ['completed', 'matched', 'matching']
        WITH similar, o.category as category,
             COUNT(DISTINCT o) as offers_joined,
             COUNT(DISTINCT r) as residents_joined
        RETURN {
            building_id: similar.id,
            address: similar.address,
            region: similar.region,
            similarity_score: null,
            category: category,
            offers_joined: offers_joined,
            residents_joined: residents_joined
        } as cluster
        ORDER BY offers_joined DESC
        LIMIT $limit
        """
        results = await self.execute(
            fallback_query,
            {"building_id": building_id, "category": category, "limit": limit},
        )
        return [r["cluster"] for r in results]

    # -----------------------------------------------------------------------
    # Feature 3: Resident Influence Score
    # -----------------------------------------------------------------------

    async def get_resident_influence_score(self, resident_id: str) -> dict[str, Any]:
        """Return raw influence score components and total for one resident."""
        query = """
        MATCH (r:Resident {id: $resident_id})
        OPTIONAL MATCH (r)-[inv:INVITED]->(:Resident)
        WITH r,
             COUNT(inv) as invites_sent,
             COUNT(CASE WHEN inv.converted = true THEN 1 END) as conversions
        OPTIONAL MATCH (r)-[rev:REVIEWED]->(c:Contractor)
        WITH r, invites_sent, conversions,
             COUNT(rev) as reviews_written,
             SUM(coalesce(rev.upvotes, 0)) as total_upvotes
        WITH r, invites_sent, conversions, reviews_written, total_upvotes,
             CASE WHEN invites_sent > 0
                  THEN toFloat(conversions) / invites_sent
                  ELSE 0.0
             END as conversion_rate
        WITH r, invites_sent, conversions, reviews_written, total_upvotes,
             conversion_rate,
             (toFloat(invites_sent) * conversion_rate) +
             (toFloat(reviews_written) * toFloat(total_upvotes)) as influence_score
        RETURN {
            resident_id: r.id,
            invites_sent: invites_sent,
            conversions: conversions,
            conversion_rate: conversion_rate,
            reviews_written: reviews_written,
            total_upvotes: total_upvotes,
            influence_score: influence_score
        } as score
        """
        results = await self.execute(query, {"resident_id": resident_id})
        return results[0]["score"] if results else {}

    async def get_top_influencers_by_city(
        self,
        city: str,
        top_n: int = 20,
        min_score: float = 5.0,
    ) -> list[dict[str, Any]]:
        """Return top-N influencers in a city using materialised INFLUENCED edges."""
        query = """
        MATCH (r:Resident)-[:LIVES_IN]->(b:Building)
        WHERE b.city = $city
        OPTIONAL MATCH (r)-[inf:INFLUENCED]->(:Offer)
        WITH r, b,
             COALESCE(SUM(inf.influence_score), 0) as total_score,
             COALESCE(SUM(inf.invite_count), 0) as total_invites,
             COALESCE(SUM(inf.conversion_count), 0) as total_conversions
        WHERE total_score >= $min_score
        ORDER BY total_score DESC
        LIMIT $top_n
        RETURN {
            resident_id: r.id,
            name: r.name,
            city: b.city,
            total_score: total_score,
            total_invites: total_invites,
            total_conversions: total_conversions
        } as influencer
        """
        results = await self.execute(query, {"city": city, "min_score": min_score, "top_n": top_n})
        return [r["influencer"] for r in results]

    async def refresh_influence_scores_for_city(self, city: str) -> int:
        """Recompute and materialise INFLUENCED edges for all residents in a city.

        Returns the number of edges written/updated.
        """
        query = """
        MATCH (r:Resident)-[:LIVES_IN]->(b:Building {city: $city})
        MATCH (r)-[inv:INVITED]->(invitee:Resident)
        WITH r,
             COUNT(inv) as invites_sent,
             COUNT(CASE WHEN inv.converted = true THEN 1 END) as conversions
        OPTIONAL MATCH (r)-[rev:REVIEWED]->(:Contractor)
        WITH r, invites_sent, conversions,
             COUNT(rev) as reviews_written,
             SUM(coalesce(rev.upvotes, 0)) as total_upvotes
        WITH r, invites_sent, conversions, reviews_written, total_upvotes,
             (toFloat(invites_sent) *
              CASE WHEN invites_sent > 0 THEN toFloat(conversions)/invites_sent ELSE 0.0 END)
             + (toFloat(reviews_written) * toFloat(total_upvotes)) as score
        MATCH (o:Offer)<-[:JOINED]-(r)
        MERGE (r)-[inf:INFLUENCED]->(o)
        SET inf.influence_score = score,
            inf.invite_count = invites_sent,
            inf.conversion_count = conversions,
            inf.review_count = reviews_written,
            inf.upvote_count = total_upvotes,
            inf.updated_at = datetime()
        RETURN COUNT(inf) as edges_written
        """
        results = await self.execute(query, {"city": city})
        return int(results[0]["edges_written"]) if results else 0

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
