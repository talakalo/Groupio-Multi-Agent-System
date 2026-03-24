"""Pinecone managed vector store — drop-in alternative to VectorStore (Qdrant).

Implements the same interface as VectorStore so all call-sites can use it
without modification via the get_vector_store() factory.

One Pinecone serverless index with four namespaces replaces the four Qdrant
collections:  contractors | buildings | knowledge_base | conversations
"""

import asyncio
import logging
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

# All collections use 1536-dim cosine (text-embedding-3-large)
NAMESPACES = ["contractors", "buildings", "knowledge_base", "conversations"]
VECTOR_DIM = 1536


def _build_pinecone_filter(filters: dict[str, Any]) -> dict[str, Any]:
    """Convert the shared filter dict format to Pinecone metadata filter syntax."""
    pc_filter: dict[str, Any] = {}
    for key, value in filters.items():
        if isinstance(value, list):
            pc_filter[key] = {"$in": value}
        elif isinstance(value, dict):
            range_cond: dict[str, Any] = {}
            if "gte" in value:
                range_cond["$gte"] = value["gte"]
            if "lte" in value:
                range_cond["$lte"] = value["lte"]
            pc_filter[key] = range_cond
        else:
            pc_filter[key] = {"$eq": value}
    return pc_filter


class PineconeVectorStore:
    """Pinecone managed vector store with the same interface as VectorStore."""

    def __init__(self) -> None:
        from pinecone import Pinecone  # type: ignore[import-untyped]

        settings = get_settings()
        self._settings = settings
        self._pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        self._index_name = settings.PINECONE_INDEX_NAME
        self._index = None  # resolved lazily in _get_index()
        self._batch_size = 100  # Pinecone upsert limit per request

    def _get_index(self):  # type: ignore[no-untyped-def]
        if self._index is None:
            self._index = self._pc.Index(self._index_name)
        return self._index

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def ensure_collections(self) -> None:
        """Create the Pinecone index if it does not already exist.

        Namespaces are created automatically on first upsert, so only the
        index itself needs explicit provisioning.
        """
        existing_names = [idx.name for idx in self._pc.list_indexes()]
        if self._index_name not in existing_names:
            from pinecone import ServerlessSpec  # type: ignore[import-untyped]

            await asyncio.to_thread(
                self._pc.create_index,
                name=self._index_name,
                dimension=VECTOR_DIM,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
            logger.info("Created Pinecone index '%s'", self._index_name)
        else:
            logger.info("Pinecone index '%s' already exists", self._index_name)

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    async def upsert(
        self,
        collection: str,
        ids: list[str | int],
        vectors: list[list[float]],
        payloads: list[dict[str, Any]],
    ) -> None:
        """Upsert vectors into a namespace (collection) in batches."""
        index = self._get_index()
        records = [
            {"id": str(id_), "values": vec, "metadata": payload} for id_, vec, payload in zip(ids, vectors, payloads)
        ]

        def _upsert_batch(batch: list[dict[str, Any]]) -> None:
            index.upsert(vectors=batch, namespace=collection)

        for i in range(0, len(records), self._batch_size):
            batch = records[i : i + self._batch_size]
            await asyncio.to_thread(_upsert_batch, batch)
            logger.debug("Upserted batch %d–%d to namespace '%s'", i, i + len(batch), collection)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    async def search(
        self,
        collection: str,
        query_vector: list[float],
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
        score_threshold: float | None = None,
    ) -> list[dict[str, Any]]:
        """Semantic search with optional metadata filtering."""
        index = self._get_index()
        pc_filter = _build_pinecone_filter(filters) if filters else None

        def _query() -> Any:
            return index.query(
                vector=query_vector,
                top_k=top_k,
                namespace=collection,
                filter=pc_filter,
                include_metadata=True,
            )

        response = await asyncio.to_thread(_query)

        results = []
        for match in response.get("matches", []):
            score = match.get("score", 0.0)
            if score_threshold is not None and score < score_threshold:
                continue
            metadata = match.get("metadata") or {}
            results.append(
                {
                    "id": match["id"],
                    "score": score,
                    "text": metadata.get("text", ""),
                    "metadata": {k: v for k, v in metadata.items() if k != "text"},
                }
            )
        return results

    async def hybrid_search(
        self,
        collection: str,
        query_vector: list[float],
        keyword_query: str,
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
        semantic_weight: float = 0.7,
    ) -> list[dict[str, Any]]:
        """Two-pass semantic + keyword re-ranking (same logic as VectorStore)."""
        semantic_results = await self.search(
            collection=collection,
            query_vector=query_vector,
            top_k=top_k * 3,
            filters=filters,
        )

        keyword_weight = 1.0 - semantic_weight
        keywords = set(keyword_query.lower().split())

        scored: list[dict[str, Any]] = []
        for result in semantic_results:
            text_lower = result["text"].lower()
            keyword_matches = sum(1 for kw in keywords if kw in text_lower)
            keyword_score = keyword_matches / max(len(keywords), 1)
            result["score"] = result["score"] * semantic_weight + keyword_score * keyword_weight
            result["keyword_score"] = keyword_score
            scored.append(result)

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete(
        self,
        collection: str,
        ids: list[str | int] | None = None,
        filters: dict[str, Any] | None = None,
    ) -> None:
        """Delete vectors by ID or metadata filter."""
        index = self._get_index()

        if ids:
            str_ids = [str(i) for i in ids]

            def _delete_ids() -> None:
                index.delete(ids=str_ids, namespace=collection)

            await asyncio.to_thread(_delete_ids)

        elif filters:
            pc_filter = _build_pinecone_filter(filters)

            def _delete_filter() -> None:
                index.delete(filter=pc_filter, namespace=collection)

            await asyncio.to_thread(_delete_filter)

    # ------------------------------------------------------------------
    # Info / health
    # ------------------------------------------------------------------

    async def get_collection_info(self, collection: str) -> dict[str, Any]:
        """Return basic stats for a namespace."""
        index = self._get_index()
        stats = await asyncio.to_thread(index.describe_index_stats)
        ns_stats = (stats.get("namespaces") or {}).get(collection, {})
        return {
            "name": collection,
            "vectors_count": ns_stats.get("vector_count", 0),
            "points_count": ns_stats.get("vector_count", 0),
            "status": "green",
        }

    async def health_check(self) -> bool:
        """Return True if the Pinecone index is reachable."""
        try:
            index = self._get_index()
            await asyncio.to_thread(index.describe_index_stats)
            return True
        except Exception:
            logger.exception("Pinecone health check failed")
            return False
