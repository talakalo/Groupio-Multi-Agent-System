#!/usr/bin/env python3
"""Report outbox backlog: unpublished rows, attempt counts, oldest stuck (operator aid)."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.databases.postgres import get_postgres_client  # noqa: E402


async def main() -> None:
    db = get_postgres_client()
    try:
        rows = await db.execute_query(
            """
            SELECT
              COUNT(*) FILTER (WHERE published_at IS NULL) AS unpublished,
              COUNT(*) FILTER (WHERE published_at IS NULL AND attempts >= 45) AS near_exhausted,
              COUNT(*) FILTER (WHERE published_at IS NULL AND attempts >= 50) AS dispatcher_skipped,
              MIN(created_at) FILTER (WHERE published_at IS NULL) AS oldest_unpublished
            FROM outbox_events
            """,
            None,
        )
    except Exception as exc:
        print(f"Query failed (migrations applied? table exists?): {exc}", file=sys.stderr)
        sys.exit(2)
    finally:
        await db.close()

    if not rows:
        print("No aggregate row returned.")
        return
    r = rows[0]
    print(json.dumps(dict(r), indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
