"""Qdrant vector store operations for semantic search."""

import logging
from typing import Any

from qdrant_client import AsyncQdrantClient, models
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

COLLECTIONS = {
    "contractors": {
        "vector_size": 1536,
        "distance": models.Distance.COSINE,
    },
    "buildings": {
        "vector_size": 1536,
        "distance": models.Distance.COSINE,
    },
    "knowledge_base": {
        "vector_size": 1536,
        "distance": models.Distance.COSINE,
    },
    "conversations": {
        "vector_size": 1536,
        "distance": models.Distance.COSINE,
    },
}


class VectorStore:
    """Qdrant vector database client for semantic search operations."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
        )
        self._batch_size = 1000

    async def ensure_collections(self) -> None:
        """Create all required collections if they don't exist."""
        existing = {c.name for c in (await self.client.get_collections()).collections}

        for name, config in COLLECTIONS.items():
            if name not in existing:
                await self.client.create_collection(
                    collection_name=name,
                    vectors_config=models.VectorParams(
                        size=config["vector_size"],
                        distance=config["distance"],
                    ),
                )
                logger.info("Created collection %s", name)
            else:
                logger.info("Collection %s already exists", name)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def upsert(
        self,
        collection: str,
        ids: list[str | int],
        vectors: list[list[float]],
        payloads: list[dict[str, Any]],
    ) -> None:
        """Upsert vectors in batches with retry logic."""
        points = [
            models.PointStruct(id=id_, vector=vec, payload=payload)
            for id_, vec, payload in zip(ids, vectors, payloads)
        ]

        for i in range(0, len(points), self._batch_size):
            batch = points[i : i + self._batch_size]
            await self.client.upsert(collection_name=collection, points=batch)
            logger.debug(
                "Upserted batch %d-%d to %s",
                i,
                i + len(batch),
                collection,
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def search(
        self,
        collection: str,
        query_vector: list[float],
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
        score_threshold: float | None = None,
    ) -> list[dict[str, Any]]:
        """Semantic search with optional metadata filtering."""
        query_filter = self._build_filter(filters) if filters else None

        results = await self.client.search(
            collection_name=collection,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter,
            score_threshold=score_threshold,
        )

        return [
            {
                "id": str(hit.id),
                "score": hit.score,
                "text": hit.payload.get("text", ""),
                "metadata": {
                    k: v for k, v in hit.payload.items() if k != "text"
                },
            }
            for hit in results
        ]

    async def hybrid_search(
        self,
        collection: str,
        query_vector: list[float],
        keyword_query: str,
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
        semantic_weight: float = 0.7,
    ) -> list[dict[str, Any]]:
        """Combine semantic search with keyword matching.

        Uses a two-pass approach: semantic search followed by keyword
        filtering and re-scoring.
        """
        # Semantic search with higher top_k for re-ranking
        semantic_results = await self.search(
            collection=collection,
            query_vector=query_vector,
            top_k=top_k * 3,
            filters=filters,
        )

        keyword_weight = 1.0 - semantic_weight
        keywords = set(keyword_query.lower().split())

        scored_results = []
        for result in semantic_results:
            text_lower = result["text"].lower()
            keyword_matches = sum(1 for kw in keywords if kw in text_lower)
            keyword_score = keyword_matches / max(len(keywords), 1)

            combined_score = (
                result["score"] * semantic_weight + keyword_score * keyword_weight
            )
            result["score"] = combined_score
            result["keyword_score"] = keyword_score
            scored_results.append(result)

        scored_results.sort(key=lambda x: x["score"], reverse=True)
        return scored_results[:top_k]

    async def delete(
        self,
        collection: str,
        ids: list[str | int] | None = None,
        filters: dict[str, Any] | None = None,
    ) -> None:
        """Delete vectors by ID or filter."""
        if ids:
            await self.client.delete(
                collection_name=collection,
                points_selector=models.PointIdsList(points=ids),
            )
        elif filters:
            query_filter = self._build_filter(filters)
            await self.client.delete(
                collection_name=collection,
                points_selector=models.FilterSelector(filter=query_filter),
            )

    async def get_collection_info(self, collection: str) -> dict[str, Any]:
        """Get collection statistics."""
        info = await self.client.get_collection(collection)
        return {
            "name": collection,
            "vectors_count": info.vectors_count,
            "points_count": info.points_count,
            "status": info.status.value,
        }

    async def health_check(self) -> bool:
        """Check if Qdrant is accessible."""
        try:
            await self.client.get_collections()
            return True
        except Exception:
            logger.exception("Qdrant health check failed")
            return False

    @staticmethod
    def _build_filter(filters: dict[str, Any]) -> models.Filter:
        """Build a Qdrant filter from a dictionary of conditions."""
        conditions = []
        for key, value in filters.items():
            if isinstance(value, list):
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchAny(any=value),
                    )
                )
            elif isinstance(value, bool):
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchValue(value=value),
                    )
                )
            elif isinstance(value, dict):
                if "gte" in value:
                    conditions.append(
                        models.FieldCondition(
                            key=key,
                            range=models.Range(gte=value["gte"]),
                        )
                    )
                if "lte" in value:
                    conditions.append(
                        models.FieldCondition(
                            key=key,
                            range=models.Range(lte=value["lte"]),
                        )
                    )
            else:
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchValue(value=value),
                    )
                )

        return models.Filter(must=conditions)


_vector_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Get or create the singleton VectorStore instance."""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store
