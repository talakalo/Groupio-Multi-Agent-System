"""In-app notification API (bell / notification center)."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notifications"])


@router.get("/")
async def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = False,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, Any]:
    """List notifications for the authenticated user."""
    db = get_postgres_client()
    items, total = await db.list_notifications(
        current_user.id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/unread-count")
async def unread_notification_count(
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, int]:
    """Return unread notification count."""
    db = get_postgres_client()
    count = await db.get_unread_notification_count(current_user.id)
    return {"count": count}


@router.post("/read-all")
async def mark_all_notifications_read(
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Mark all notifications as read for the current user."""
    db = get_postgres_client()
    await db.mark_all_notifications_read(current_user.id)
    return {"status": "ok"}


@router.post("/{notification_id}/read")
async def mark_notification_read_route(
    notification_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Mark a single notification as read."""
    db = get_postgres_client()
    updated = await db.mark_notification_read(notification_id, current_user.id)
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "ok"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a single notification owned by the authenticated user."""
    db = get_postgres_client()

    if db._use_supabase_client():
        client = await db._get_client()
        result = (
            await client.table("notifications")
            .delete()
            .eq("id", notification_id)
            .eq("user_id", current_user.id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"status": "deleted"}

    deleted = await db._pg_fetch_one(
        "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
        notification_id,
        current_user.id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "deleted"}


@router.delete("/")
async def clear_notifications(
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, int | str]:
    """Delete all notifications owned by the authenticated user."""
    db = get_postgres_client()

    if db._use_supabase_client():
        client = await db._get_client()
        result = await client.table("notifications").delete().eq("user_id", current_user.id).execute()
        return {"status": "deleted", "deleted": len(result.data or [])}

    deleted = await db._pg_fetch_all(
        "DELETE FROM notifications WHERE user_id = $1 RETURNING id",
        current_user.id,
    )
    return {"status": "deleted", "deleted": len(deleted or [])}
