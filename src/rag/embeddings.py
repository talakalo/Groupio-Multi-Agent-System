"""Embedding utilities for vector operations."""

import logging
from typing import Any

from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings
from src.databases.cache import cached

logger = logging.getLogger(__name__)

# Embeddings are deterministic per (model, dimensions, text), so a long TTL
# is safe — the only invalidation trigger is a model/dimensions change, which
# the cache key already incorporates.
_EMBED_CACHE_TTL = 86400  # 24 hours


class EmbeddingClient:
    """Client for generating text embeddings using OpenAI API."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.EMBEDDING_MODEL
        self._dimensions = settings.EMBEDDING_DIMENSIONS
        self._batch_size = 100

    @cached(
        prefix="embed",
        ttl=_EMBED_CACHE_TTL,
        key_fn=lambda self, text: f"{self._model}:{self._dimensions}:{text}",
    )
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text.

        Cached in Redis for 24h keyed by (model, dimensions, text) — embeddings
        are deterministic per-model, so a cache hit saves a paid OpenAI round-trip
        without any staleness risk.
        """
        response = await self._client.embeddings.create(
            model=self._model,
            input=text,
            dimensions=self._dimensions,
        )
        return response.data[0].embedding

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts.

        Automatically handles batching for large inputs.
        """
        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            response = await self._client.embeddings.create(
                model=self._model,
                input=batch,
                dimensions=self._dimensions,
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)
            logger.debug("Embedded batch %d-%d", i, i + len(batch))

        return all_embeddings

    async def embed_query(self, query: str) -> list[float]:
        """Generate embedding optimized for query/search use."""
        return await self.embed_text(query)

    async def embed_documents(self, documents: list[dict[str, Any]]) -> list[list[float]]:
        """Generate embeddings for a list of document dicts with 'text' key."""
        texts = [doc["text"] for doc in documents]
        return await self.embed_batch(texts)


_embedding_client: EmbeddingClient | None = None


def get_embedding_client() -> EmbeddingClient:
    """Get or create the singleton EmbeddingClient instance."""
    global _embedding_client
    if _embedding_client is None:
        _embedding_client = EmbeddingClient()
    return _embedding_client
