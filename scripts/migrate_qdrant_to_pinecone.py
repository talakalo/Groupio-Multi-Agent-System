#!/usr/bin/env python3
"""One-time migration script: copy all vectors from Qdrant to Pinecone.

Usage:
    # 1. Use the project virtualenv (not system python3) so ``pinecone`` and
    #    ``qdrant-client`` are installed: ``pip install -e .`` or ``uv sync``.
    # 2. Set env vars in repo-root .env and/or docker/.env (or export them):
    #    QDRANT_URL, QDRANT_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME
    # 3. From repo root:
    #    python scripts/migrate_qdrant_to_pinecone.py
    #    # or: ./scripts/migrate_qdrant_to_pinecone.py  (executable bit set)

The script reads each Qdrant collection in pages and upserts the same vectors
into the matching Pinecone namespace. Existing Pinecone vectors with the same
IDs are overwritten (upsert is idempotent).

Estimated time: ~5 min per 100 k vectors on a fast connection.
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Allow running from repo root without installing the package
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT))

# Same sources as src.config.settings.Settings (docker/.env overrides .env)
load_dotenv(_REPO_ROOT / ".env", override=False)
load_dotenv(_REPO_ROOT / "docker" / ".env", override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

COLLECTIONS = ["contractors", "buildings", "knowledge_base", "conversations"]
PAGE_SIZE = 500  # vectors per Qdrant scroll page


async def migrate_collection(qdrant_client, pinecone_index, collection: str) -> int:
    """Migrate a single Qdrant collection to the matching Pinecone namespace.

    Returns the total number of vectors migrated.
    """
    total = 0
    offset = None

    logger.info("Migrating collection '%s' …", collection)

    while True:
        # Scroll a page of points from Qdrant
        results, next_offset = await qdrant_client.scroll(
            collection_name=collection,
            limit=PAGE_SIZE,
            offset=offset,
            with_vectors=True,
            with_payload=True,
        )

        if not results:
            break

        records = []
        for point in results:
            records.append(
                {
                    "id": str(point.id),
                    "values": point.vector,
                    "metadata": point.payload or {},
                }
            )

        # Upsert to Pinecone in the matching namespace
        pinecone_index.upsert(vectors=records, namespace=collection)
        total += len(records)
        logger.info("  %s: migrated %d vectors (total so far: %d)", collection, len(records), total)

        if next_offset is None:
            break
        offset = next_offset

    logger.info("Collection '%s' done — %d vectors migrated.", collection, total)
    return total


async def main() -> None:
    from pinecone import Pinecone, ServerlessSpec  # type: ignore[import-untyped]
    from qdrant_client import AsyncQdrantClient

    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or None
    pinecone_api_key = os.getenv("PINECONE_API_KEY", "").strip()
    if not pinecone_api_key:
        raise SystemExit(
            "PINECONE_API_KEY is missing or empty. Add it to .env or docker/.env "
            "(repo root), or export it before running this script."
        )
    pinecone_index_name = os.getenv("PINECONE_INDEX_NAME", "groupio")

    logger.info("Connecting to Qdrant at %s …", qdrant_url)
    qdrant = AsyncQdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=60)

    logger.info("Connecting to Pinecone …")
    pc = Pinecone(api_key=pinecone_api_key)

    # Ensure the target index exists
    existing = [idx.name for idx in pc.list_indexes()]
    if pinecone_index_name not in existing:
        logger.info("Creating Pinecone index '%s' …", pinecone_index_name)
        pc.create_index(
            name=pinecone_index_name,
            dimension=1536,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        logger.info("Index created.")

    index = pc.Index(pinecone_index_name)

    grand_total = 0
    for collection in COLLECTIONS:
        try:
            count = await migrate_collection(qdrant, index, collection)
            grand_total += count
        except Exception:
            logger.exception("Failed to migrate collection '%s' — skipping.", collection)

    logger.info("Migration complete. Total vectors upserted: %d", grand_total)


if __name__ == "__main__":
    asyncio.run(main())
