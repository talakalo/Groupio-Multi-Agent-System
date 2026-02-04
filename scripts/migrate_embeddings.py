"""Batch embedding generation and migration script.

Used to re-embed documents when changing embedding models or dimensions.
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.databases.vector_store import VectorStore
from src.rag.embeddings import EmbeddingClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_collection(
    collection: str,
    batch_size: int = 100,
) -> None:
    """Re-embed all documents in a collection.

    Reads existing payloads, generates new embeddings, and upserts back.
    """
    vs = VectorStore()
    embedding_client = EmbeddingClient()

    logger.info("Migrating collection: %s", collection)

    # Get collection info
    info = await vs.get_collection_info(collection)
    total = info.get("points_count", 0)
    logger.info("Total points to migrate: %d", total)

    if total == 0:
        logger.info("No points to migrate in %s", collection)
        return

    # Scroll through all points and re-embed
    offset = None
    migrated = 0

    while True:
        # Scroll to get existing points
        result = await vs.client.scroll(
            collection_name=collection,
            limit=batch_size,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )

        points, next_offset = result

        if not points:
            break

        # Extract texts and generate new embeddings
        texts = [p.payload.get("text", "") for p in points]
        ids = [p.id for p in points]
        payloads = [p.payload for p in points]

        # Skip empty texts
        valid_indices = [i for i, t in enumerate(texts) if t.strip()]
        if not valid_indices:
            offset = next_offset
            if offset is None:
                break
            continue

        valid_texts = [texts[i] for i in valid_indices]
        valid_ids = [ids[i] for i in valid_indices]
        valid_payloads = [payloads[i] for i in valid_indices]

        embeddings = await embedding_client.embed_batch(valid_texts)

        await vs.upsert(
            collection=collection,
            ids=valid_ids,
            vectors=embeddings,
            payloads=valid_payloads,
        )

        migrated += len(valid_ids)
        logger.info("Migrated %d/%d points", migrated, total)

        offset = next_offset
        if offset is None:
            break

    logger.info("Migration complete for %s: %d points migrated", collection, migrated)


async def main() -> None:
    """Migrate all collections."""
    collections = ["contractors", "buildings", "knowledge_base", "conversations"]

    for collection in collections:
        try:
            await migrate_collection(collection)
        except Exception:
            logger.exception("Failed to migrate %s", collection)

    logger.info("All migrations complete")


if __name__ == "__main__":
    asyncio.run(main())
