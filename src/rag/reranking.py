"""Cross-encoder reranking for RAG pipeline."""

import logging
from typing import Any

from src.config.settings import get_settings
from src.utils.llm_client import get_llm_client

logger = logging.getLogger(__name__)


class Reranker:
    """Rerank retrieved documents using LLM-based cross-encoding.

    Uses Claude to score the relevance of each document to the query,
    providing more accurate ranking than embedding similarity alone.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    async def rerank(
        self,
        query: str,
        documents: list[dict[str, Any]],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Rerank documents by relevance to the query.

        Uses a lightweight LLM call to score each document's relevance.
        Falls back to original ordering if reranking fails.
        """
        if not documents:
            return []

        if len(documents) <= top_k:
            return documents

        try:
            llm = get_llm_client()
            scored = await self._score_documents(llm, query, documents)
            scored.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
            return scored[:top_k]
        except Exception:
            logger.exception("Reranking failed, returning original order")
            return documents[:top_k]

    async def _score_documents(
        self,
        llm: Any,
        query: str,
        documents: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Score each document's relevance to the query."""
        doc_summaries = []
        for i, doc in enumerate(documents):
            text = doc.get("text", "")[:500]
            doc_summaries.append(f"[{i}] {text}")

        docs_text = "\n\n".join(doc_summaries)
        prompt = (
            f"Rate the relevance of each document to the query on a scale of 0-10.\n\n"
            f"Query: {query}\n\n"
            f"Documents:\n{docs_text}\n\n"
            f"Return a JSON array of objects with 'index' and 'score' keys. "
            f"Example: [{{'index': 0, 'score': 8}}, {{'index': 1, 'score': 3}}]"
        )

        response = await llm.create_message(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.0,
        )

        scores = self._parse_scores(response)

        for doc_score in scores:
            idx = doc_score.get("index", -1)
            if 0 <= idx < len(documents):
                documents[idx]["rerank_score"] = doc_score.get("score", 0) / 10.0

        # Documents without a rerank score keep their original similarity score
        for doc in documents:
            if "rerank_score" not in doc:
                doc["rerank_score"] = doc.get("score", 0)

        return documents

    @staticmethod
    def _parse_scores(response: dict) -> list[dict]:
        """Parse LLM response to extract document scores."""
        import json

        content = response.get("content", "")
        if isinstance(content, list):
            content = content[0].get("text", "") if content else ""

        # Try to find JSON array in the response
        try:
            # Look for array pattern
            start = content.find("[")
            end = content.rfind("]") + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            pass

        logger.warning("Could not parse reranking scores from LLM response")
        return []


_reranker: Reranker | None = None


def get_reranker() -> Reranker:
    """Get or create the singleton Reranker instance."""
    global _reranker
    if _reranker is None:
        _reranker = Reranker()
    return _reranker
