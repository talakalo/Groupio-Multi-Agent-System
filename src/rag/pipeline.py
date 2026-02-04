"""RAG retrieval pipeline with multiple strategies."""

import logging
from typing import Any

from src.databases.vector_store import get_vector_store
from src.rag.embeddings import get_embedding_client
from src.rag.reranking import get_reranker

logger = logging.getLogger(__name__)


class GroupioRAG:
    """Main RAG pipeline with multiple retrieval strategies.

    Supports semantic, hybrid, contextual, and multi-hop retrieval.
    """

    def __init__(self) -> None:
        self._vector_store = get_vector_store()
        self._embedding_client = get_embedding_client()
        self._reranker = get_reranker()

    async def retrieve(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None = None,
        top_k: int = 10,
        strategy: str = "semantic",
        rerank: bool = True,
        rerank_top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant documents based on query.

        Args:
            query: The search query text.
            namespace: Which collection to search in.
            filters: Optional metadata filters.
            top_k: Number of results to retrieve.
            strategy: One of 'semantic', 'hybrid', 'contextual', 'multi_hop'.
            rerank: Whether to apply cross-encoder reranking.
            rerank_top_k: Number of results after reranking.

        Returns:
            List of document dicts with text, metadata, and score.
        """
        if strategy == "semantic":
            results = await self._semantic_search(query, namespace, filters, top_k)
        elif strategy == "hybrid":
            results = await self._hybrid_search(query, namespace, filters, top_k)
        elif strategy == "contextual":
            results = await self._contextual_search(query, namespace, filters, top_k)
        elif strategy == "multi_hop":
            results = await self._multi_hop_search(query, namespace, filters, top_k)
        else:
            logger.warning("Unknown strategy %s, falling back to semantic", strategy)
            results = await self._semantic_search(query, namespace, filters, top_k)

        if rerank and len(results) > rerank_top_k:
            results = await self._reranker.rerank(query, results, rerank_top_k)

        return results

    async def _semantic_search(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Pure vector similarity search."""
        query_vector = await self._embedding_client.embed_query(query)
        return await self._vector_store.search(
            collection=namespace,
            query_vector=query_vector,
            top_k=top_k,
            filters=filters,
        )

    async def _hybrid_search(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Combine semantic search with keyword matching."""
        query_vector = await self._embedding_client.embed_query(query)
        return await self._vector_store.hybrid_search(
            collection=namespace,
            query_vector=query_vector,
            keyword_query=query,
            top_k=top_k,
            filters=filters,
        )

    async def _contextual_search(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Context-aware search using user history and profile.

        Enriches the query with user context before searching.
        """
        # For contextual search, we do a broader semantic search
        # The caller should include user context in the query
        query_vector = await self._embedding_client.embed_query(query)
        return await self._vector_store.search(
            collection=namespace,
            query_vector=query_vector,
            top_k=top_k,
            filters=filters,
        )

    async def _multi_hop_search(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Multi-hop retrieval for complex queries.

        Performs multiple search passes, using initial results to
        refine subsequent queries.
        """
        # First hop: initial broad search
        first_results = await self._semantic_search(query, namespace, filters, top_k)

        if not first_results:
            return []

        # Extract key terms from first results to refine query
        context_terms = self._extract_key_terms(first_results[:3])
        enriched_query = f"{query} {context_terms}"

        # Second hop: refined search with enriched query
        second_results = await self._semantic_search(
            enriched_query, namespace, filters, top_k
        )

        # Merge and deduplicate
        seen_ids: set[str] = set()
        merged: list[dict[str, Any]] = []

        for result in first_results + second_results:
            rid = result.get("id", "")
            if rid not in seen_ids:
                seen_ids.add(rid)
                merged.append(result)

        # Sort by score and return top_k
        merged.sort(key=lambda x: x.get("score", 0), reverse=True)
        return merged[:top_k]

    @staticmethod
    def _extract_key_terms(documents: list[dict[str, Any]]) -> str:
        """Extract key terms from document texts for query enrichment."""
        all_text = " ".join(doc.get("text", "")[:200] for doc in documents)
        # Simple extraction: take longer unique words
        words = set(all_text.split())
        key_words = [w for w in words if len(w) > 4]
        return " ".join(list(key_words)[:10])

    async def augment_prompt(
        self,
        query: str,
        context_docs: list[dict[str, Any]],
        system_prompt: str,
    ) -> str:
        """Construct augmented prompt with retrieved context.

        Formats the retrieved documents into a context block that
        can be inserted into the system prompt.
        """
        if not context_docs:
            return system_prompt

        context_parts: list[str] = []
        for i, doc in enumerate(context_docs, 1):
            text = doc.get("text", "")
            score = doc.get("score", 0)
            metadata = doc.get("metadata", {})
            source = metadata.get("source", "unknown")
            context_parts.append(
                f"[Source {i} (relevance: {score:.2f}, source: {source})]\n{text}"
            )

        context_block = "\n\n".join(context_parts)

        augmented = (
            f"{system_prompt}\n\n"
            f"--- Retrieved Context ---\n"
            f"The following information was retrieved and may be relevant "
            f"to answering the user's query:\n\n"
            f"{context_block}\n"
            f"--- End of Context ---\n\n"
            f"Use the above context to inform your response. "
            f"If the context doesn't contain relevant information, "
            f"rely on your general knowledge."
        )

        return augmented

    async def get_metrics(self) -> dict[str, Any]:
        """Get RAG pipeline metrics."""
        metrics: dict[str, Any] = {}
        for collection in ["contractors", "buildings", "knowledge_base", "conversations"]:
            try:
                info = await self._vector_store.get_collection_info(collection)
                metrics[collection] = info
            except Exception:
                metrics[collection] = {"status": "unavailable"}
        return metrics


_rag_pipeline: GroupioRAG | None = None


def get_rag_pipeline() -> GroupioRAG:
    """Get or create the singleton RAG pipeline instance."""
    global _rag_pipeline
    if _rag_pipeline is None:
        _rag_pipeline = GroupioRAG()
    return _rag_pipeline
