"""Conversations API routes — GET /api/v1/conversations/{userId}/messages.

Exposes the chat history stored in conversation_logs so the frontend
AIChat component can hydrate previously-sent messages on mount.

Security:
  - Requires authentication.
  - A user may only fetch their own history.
  - Admins (role in admin / super_admin) may fetch any user's history.

Pagination:
  - limit: number of log rows to return (default 50, max 200).
    Each log row becomes 2 messages (user + assistant), so the caller may
    receive up to 2 × limit messages.
  - before: ISO-8601 cursor (exclusive upper bound on created_at) for
    loading older pages.  Omit for the most recent ``limit`` exchanges.

Response shape (matches AIChat.tsx expectation):
  {
    "messages": [
      {"id": "<id>_user",      "role": "user",      "content": "...", "created_at": "..."},
      {"id": "<id>_assistant", "role": "assistant", "content": "...", "created_at": "..."}
    ],
    "total": <number of log rows>,
    "next_cursor": "<ISO timestamp>" | null
  }
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB

logger = logging.getLogger(__name__)

router = APIRouter(tags=["conversations"])

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50


@router.get("/{user_id}/messages")
async def get_conversation_messages(
    user_id: str,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    before: str | None = Query(default=None, description="ISO-8601 cursor for pagination"),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Return the chat history for *user_id*.

    Only the authenticated user or an admin may access the history.
    Returns an empty messages list (200) when no history exists yet.
    """
    # ------------------------------------------------------------------
    # Authorization
    # ------------------------------------------------------------------
    is_admin = current_user.role in ("admin", "super_admin")
    if current_user.id != user_id and not is_admin:
        logger.warning(
            "User %s attempted to access chat history of %s — denied",
            current_user.id,
            user_id,
        )
        raise HTTPException(status_code=403, detail="Access denied")

    # ------------------------------------------------------------------
    # Fetch log rows
    # ------------------------------------------------------------------
    db = get_postgres_client()
    try:
        rows, total = await db.get_conversation_history(user_id=user_id, limit=limit, before=before)
    except Exception as exc:
        logger.error("Failed to fetch conversation history for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve conversation history") from exc

    # ------------------------------------------------------------------
    # Flatten each log row into (user message, assistant message) pairs
    # ------------------------------------------------------------------
    messages: list[dict] = []
    for row in rows:
        row_id = str(row.get("id", ""))
        created_at = row.get("created_at")
        created_at_str = created_at.isoformat() if isinstance(created_at, date) else str(created_at or "")

        user_content = row.get("message") or ""
        if user_content:
            messages.append(
                {
                    "id": f"{row_id}_user",
                    "role": "user",
                    "content": user_content,
                    "created_at": created_at_str,
                }
            )

        # response is stored as a JSONB dict; assistant text is at response.message
        response_obj = row.get("response") or {}
        if isinstance(response_obj, str):
            # Supabase may return already-decoded strings in some configurations
            import json as _json  # local import to keep module top-level clean

            try:
                response_obj = _json.loads(response_obj)
            except Exception:
                response_obj = {}
        assistant_content = response_obj.get("message") or response_obj.get("content") or ""
        if assistant_content:
            messages.append(
                {
                    "id": f"{row_id}_assistant",
                    "role": "assistant",
                    "content": assistant_content,
                    "created_at": created_at_str,
                }
            )

    # ------------------------------------------------------------------
    # Cursor for next page (the created_at of the oldest row in this batch)
    # ------------------------------------------------------------------
    next_cursor: str | None = None
    if rows and len(rows) == limit:
        first_row = rows[0]
        ts = first_row.get("created_at")
        next_cursor = ts.isoformat() if isinstance(ts, date) else str(ts) if ts else None

    return {
        "messages": messages,
        "total": total,
        "next_cursor": next_cursor,
    }
