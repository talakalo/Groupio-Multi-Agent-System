#!/usr/bin/env python3
"""CLI: reset an outbox row for dispatcher replay (requires DATABASE_URL / local Postgres)."""

import argparse
import asyncio
import sys
from pathlib import Path

# Repo root on PYTHONPATH
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.databases.postgres import get_postgres_client  # noqa: E402


async def main() -> None:
    p = argparse.ArgumentParser(description="Requeue a single outbox_events row by id")
    p.add_argument("outbox_id", help="UUID of outbox_events.id")
    args = p.parse_args()

    db = get_postgres_client()
    try:
        ok = await db.reset_outbox_event_for_retry(args.outbox_id)
    finally:
        await db.close()

    if not ok:
        print("No row updated (missing id or table not migrated).", file=sys.stderr)
        sys.exit(1)
    print(f"Requeued outbox event {args.outbox_id}")


if __name__ == "__main__":
    asyncio.run(main())
