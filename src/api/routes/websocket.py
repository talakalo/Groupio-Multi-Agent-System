"""WebSocket endpoints for real-time admin notifications and offer updates."""

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from src.api.middleware.auth import verify_access_token
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client

logger = logging.getLogger(__name__)

_ADMIN_ROLES = frozenset({"admin", "super_admin", "buildings_manager"})

router = APIRouter()

# -- Configuration --
MAX_MESSAGE_SIZE = 65_536  # 64 KB
MAX_MESSAGES_PER_MINUTE = 60
ALLOWED_MESSAGE_TYPES = {"ping", "subscribe", "unsubscribe"}


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._rate_limits: dict[int, list[float]] = {}  # ws id -> timestamps

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("Admin WebSocket connected. Total: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self._rate_limits.pop(id(websocket), None)
        logger.info("Admin WebSocket disconnected. Total: %d", len(self.active_connections))

    def _check_rate_limit(self, websocket: WebSocket) -> bool:
        """Return True if the message is within rate limits."""
        ws_id = id(websocket)
        now = time.time()
        timestamps = self._rate_limits.get(ws_id, [])
        # Remove timestamps older than 60 seconds
        timestamps = [t for t in timestamps if now - t < 60]
        if len(timestamps) >= MAX_MESSAGES_PER_MINUTE:
            return False
        timestamps.append(now)
        self._rate_limits[ws_id] = timestamps
        return True

    async def broadcast(self, message: dict[str, Any]):
        disconnected: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for ws in disconnected:
            self.disconnect(ws)


manager = ConnectionManager()


def _validate_message(data: str) -> tuple[bool, str]:
    """Validate an incoming WebSocket message. Returns (is_valid, error_reason)."""
    if len(data.encode("utf-8")) > MAX_MESSAGE_SIZE:
        return False, f"Message exceeds maximum size of {MAX_MESSAGE_SIZE} bytes"

    # Allow simple ping
    if data == "ping":
        return True, ""

    # Try to parse as JSON for structured messages
    try:
        parsed = json.loads(data)
        if not isinstance(parsed, dict):
            return False, "Message must be a JSON object"
        msg_type = parsed.get("type")
        if msg_type and msg_type not in ALLOWED_MESSAGE_TYPES:
            return False, f"Unknown message type: {msg_type}"
        return True, ""
    except json.JSONDecodeError:
        # Allow plain text messages (like "ping")
        if len(data) > 256:
            return False, "Plain text message too long"
        return True, ""


@router.websocket("/ws/admin")
async def admin_websocket(websocket: WebSocket):
    # Authenticate via query param (?token=...) or cookie (access_token)
    token = websocket.query_params.get("token") or websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
        return

    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
        return

    role = payload.role.value
    if role not in _ADMIN_ROLES:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Insufficient permissions")
        return

    user_id = payload.sub
    db = get_postgres_client()
    user = await db.get_user(user_id) if user_id else None
    if not user or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found or disabled")
        return

    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()

            # Rate limiting
            if not manager._check_rate_limit(websocket):
                await websocket.send_json({"error": "Rate limit exceeded"})
                continue

            # Validate message
            is_valid, reason = _validate_message(data)
            if not is_valid:
                await websocket.send_json({"error": reason})
                continue

            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


def get_ws_manager() -> ConnectionManager:
    return manager


# ---------------------------------------------------------------------------
# /ws/offers — real-time offer updates (participant count + tier changes)
# ---------------------------------------------------------------------------

#: Redis pub/sub channel that the join_offer route publishes to.
OFFERS_CHANNEL = "offers:updates"


class OffersConnectionManager:
    """Manages WebSocket connections scoped to a building ID."""

    def __init__(self) -> None:
        # building_id -> list of connected WebSocket clients
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, building_id: str) -> None:
        await websocket.accept()
        self._connections.setdefault(building_id, []).append(websocket)
        logger.info(
            "Offers WebSocket connected. building=%s total=%d",
            building_id,
            len(self._connections[building_id]),
        )

    def disconnect(self, websocket: WebSocket, building_id: str) -> None:
        bucket = self._connections.get(building_id, [])
        if websocket in bucket:
            bucket.remove(websocket)
        if not bucket:
            self._connections.pop(building_id, None)
        logger.info(
            "Offers WebSocket disconnected. building=%s",
            building_id,
        )

    async def broadcast_to_building(self, building_id: str, message: dict[str, Any]) -> None:
        """Send a message to all clients subscribed to the given building."""
        bucket = list(self._connections.get(building_id, []))
        dead: list[WebSocket] = []
        for ws in bucket:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, building_id)


offers_manager = OffersConnectionManager()


async def _redis_listener() -> None:
    """Background task that subscribes to Redis and fans out offer updates."""
    redis = get_redis_client()
    pubsub = redis.make_pubsub()
    await pubsub.subscribe(OFFERS_CHANNEL)
    logger.info("Offers Redis listener subscribed to channel: %s", OFFERS_CHANNEL)
    try:
        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                payload: dict[str, Any] = json.loads(raw["data"])
            except (json.JSONDecodeError, TypeError):
                continue
            building_id = payload.get("building_id")
            if not building_id:
                continue
            event = {
                "type": payload.get("event_type", "UPDATE"),
                "table": "offers",
                "record": payload.get("record", {}),
            }
            old = payload.get("old_record")
            if old:
                event["old_record"] = old
            await offers_manager.broadcast_to_building(building_id, event)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("Offers Redis listener error: %s", exc, exc_info=True)
    finally:
        try:
            await pubsub.unsubscribe(OFFERS_CHANNEL)
            await pubsub.close()
        except Exception:
            pass


# Global handle so we start only one listener task.
_listener_task: asyncio.Task | None = None  # type: ignore[type-arg]


def _ensure_listener() -> None:
    """Start the Redis listener background task if not already running."""
    global _listener_task
    if _listener_task is None or _listener_task.done():
        _listener_task = asyncio.get_event_loop().create_task(_redis_listener())


@router.websocket("/ws/offers")
async def offers_websocket(websocket: WebSocket) -> None:
    """Real-time offer updates for a building.

    Query params:
        buildingId (str, required) — UUID of the building to subscribe to.
        token (str, optional)     — JWT for authenticated connections.

    Message format sent to client (matches ``RealtimeEvent`` in ``useRealtimeOffers.ts``):

    .. code-block:: json

        {
          "type": "UPDATE",
          "table": "offers",
          "record": { <Offer fields> },
          "old_record": { <previous Offer fields, optional> }
        }
    """
    building_id = websocket.query_params.get("buildingId", "").strip()
    if not building_id:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing required query param: buildingId",
        )
        return

    # Ensure the Redis listener is running (lazy start on first connection).
    try:
        _ensure_listener()
    except RuntimeError:
        # No running event loop yet (unlikely in ASGI, but guard anyway).
        pass

    db = get_postgres_client()

    # Send the current state of all active offers for this building on connect.
    try:
        offers, _ = await db.list_offers(
            filters={"building_id": building_id, "status": "active"},
            page=1,
            page_size=100,
        )
        for offer in offers:
            await websocket.send_json(
                {
                    "type": "INSERT",
                    "table": "offers",
                    "record": offer,
                }
            )
    except Exception as exc:
        logger.warning("Could not send initial offers snapshot: %s", exc)

    await offers_manager.connect(websocket, building_id)
    try:
        while True:
            # Keep the connection alive; clients send "ping" to check liveness.
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        offers_manager.disconnect(websocket, building_id)
