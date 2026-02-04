"""Load sample data into all databases for development and testing."""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_all() -> None:
    """Run all seeding operations."""
    logger.info("Starting full data seeding...")

    # Step 1: Vector DB
    logger.info("--- Setting up Vector DB ---")
    from scripts.setup_vector_db import main as setup_vector

    try:
        await setup_vector()
    except Exception:
        logger.exception("Vector DB setup failed")

    # Step 2: Graph DB
    logger.info("--- Setting up Graph DB ---")
    from scripts.setup_graph_db import main as setup_graph

    try:
        await setup_graph()
    except Exception:
        logger.exception("Graph DB setup failed")

    logger.info("Full data seeding complete")


if __name__ == "__main__":
    asyncio.run(seed_all())
