"""Recent activity feed for resident dashboards."""

import logging
from typing import Any

from fastapi import APIRouter, Depends

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Activity"])


@router.get("/recent")
async def get_recent_activity(
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the latest activity items for the authenticated user.

    Aggregates recent payments, offer joins, and escalations into a
    unified activity feed sorted by timestamp descending.
    """
    db = get_postgres_client()
    activities: list[dict[str, Any]] = []

    # Recent payments
    try:
        payments = await db.list_payments_for_user(current_user.id)
        for p in (payments or [])[:5]:
            activities.append(
                {
                    "id": f"pay-{p.get('id', '')}",
                    "type": "offer_joined",
                    "message": f"Payment of {p.get('amount', 0)} ILS – {p.get('status', 'unknown')}",
                    "timestamp": p.get("created_at", ""),
                }
            )
    except Exception:
        logger.debug("Could not fetch payments for activity feed")

    # Recent escalations created by this user
    try:
        escalations = await db.list_escalations(filters={"user_id": current_user.id}, page=1, page_size=5)
        for esc in escalations[0] if escalations else []:
            activities.append(
                {
                    "id": f"esc-{esc.get('id', '')}",
                    "type": "contractor_matched",
                    "message": esc.get("reason", "Escalation created"),
                    "timestamp": esc.get("created_at", ""),
                }
            )
    except Exception:
        logger.debug("Could not fetch escalations for activity feed")

    # Sort by timestamp descending, limit to 10
    activities.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    return {"activities": activities[:10]}
