"""WebSocket endpoint for real-time admin notifications."""

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

# Redis pub/sub channel names
_ADMIN_WS_CHANNEL = "groupio:ws:admin"
_OFFERS_WS_CHANNEL_PREFIX = "groupio:ws:offers:"


class ConnectionManager:
    """Manages admin WebSocket connections with Redis pub/sub broadcast.

    When ``broadcast()`` is called, the message is published to a Redis
    channel so that *all* uvicorn workers receive and forward it to their
    locally-connected clients.  Each worker runs a background subscriber task
    (``start_redis_subscriber``) that listens on the channel and calls
    ``_local_broadcast`` for messages originating from other workers.
    """

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._rate_limits: dict[int, list[float]] = {}  # ws id -> timestamps
        self._subscriber_task: asyncio.Task[None] | None = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("Admin WebSocket connected. Total: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
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

    async def _local_broadcast(self, message: dict[str, Any]) -> None:
        """Send a message to all locally-connected WebSocket clients."""
        disconnected: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for ws in disconnected:
            self.disconnect(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Publish to Redis so all workers receive and forward the message."""
        try:
            redis = get_redis_client()
            await redis.publish(_ADMIN_WS_CHANNEL, message)
        except Exception:
            logger.warning("Redis publish failed; falling back to local broadcast", exc_info=True)
            await self._local_broadcast(message)

    async def start_redis_subscriber(self) -> None:
        """Start a background task that re-broadcasts Redis pub/sub messages locally.

        Safe to call multiple times — subsequent calls are no-ops if the task
        is already running.
        """
        if self._subscriber_task and not self._subscriber_task.done():
            return
        self._subscriber_task = asyncio.create_task(self._redis_subscriber_loop())

    async def _redis_subscriber_loop(self) -> None:
        """Subscribe to the admin WS channel and forward messages to local clients."""
        while True:
            pubsub = None
            try:
                redis = get_redis_client()
                pubsub = redis.pubsub()
                await pubsub.subscribe(_ADMIN_WS_CHANNEL)
                async for raw in pubsub.listen():
                    if raw["type"] != "message":
                        continue
                    try:
                        data = json.loads(raw["data"])
                    except (json.JSONDecodeError, TypeError):
                        continue
                    await self._local_broadcast(data)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.warning("Admin WS Redis subscriber error; reconnecting in 2s", exc_info=True)
                await asyncio.sleep(2)
            finally:
                if pubsub is not None:
                    try:
                        await pubsub.close()
                    except Exception:
                        pass


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

    await manager.start_redis_subscriber()
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
# /ws/offers — resident offer updates scoped by building_id
# ---------------------------------------------------------------------------

_RESIDENT_ROLES = frozenset({"resident", "admin", "super_admin", "buildings_manager"})


class OffersConnectionManager:
    """Tracks per-building WebSocket connections for offer realtime updates."""

    def __init__(self) -> None:
        # building_id -> list of connected WebSockets
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, building_id: str) -> None:
        await websocket.accept()
        self._connections.setdefault(building_id, []).append(websocket)
        logger.info(
            "Offers WS connected building=%s total=%d",
            building_id,
            len(self._connections[building_id]),
        )

    def disconnect(self, websocket: WebSocket, building_id: str) -> None:
        conns = self._connections.get(building_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(building_id, None)
        logger.info("Offers WS disconnected building=%s", building_id)

    async def broadcast_to_building(self, building_id: str, message: dict[str, Any]) -> None:
        """Send a message to all residents connected for a given building."""
        disconnected: list[WebSocket] = []
        for ws in list(self._connections.get(building_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws, building_id)


offers_manager = OffersConnectionManager()

# Per-connection rate limiter for /ws/offers (same logic as admin WS)
_offers_rate_limits: dict[int, list[float]] = {}


def _offers_check_rate_limit(websocket: WebSocket) -> bool:
    ws_id = id(websocket)
    now = time.time()
    timestamps = _offers_rate_limits.get(ws_id, [])
    timestamps = [t for t in timestamps if now - t < 60]
    if len(timestamps) >= MAX_MESSAGES_PER_MINUTE:
        return False
    timestamps.append(now)
    _offers_rate_limits[ws_id] = timestamps
    return True


def _offers_cleanup_rate_limit(websocket: WebSocket) -> None:
    _offers_rate_limits.pop(id(websocket), None)


@router.websocket("/ws/offers")
async def offers_websocket(websocket: WebSocket) -> None:
    """Resident-scoped realtime offer updates.

    Authentication:
      Token is read from the HTTP-only ``access_token`` cookie (preferred — avoids
      exposing the JWT in server logs / browser history) or from the first message
      sent by the client after connection: ``{"type": "auth", "token": "<jwt>"}``.

    Query params:
      - buildingId: building to subscribe to (required)
    """
    building_id = websocket.query_params.get("buildingId") or websocket.query_params.get("building_id")
    if not building_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing buildingId")
        return

    # --- Step 1: try cookie auth (browser sends cookies automatically) ---
    token: str | None = websocket.cookies.get("access_token")

    # --- Step 2: if no cookie, accept connection and wait for auth message ---
    if not token:
        await websocket.accept()
        try:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "auth":
                    token = msg.get("token")
            except (json.JSONDecodeError, AttributeError):
                pass
        except WebSocketDisconnect:
            return
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
            return

    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
        return

    role = payload.role.value
    if role not in _RESIDENT_ROLES:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Insufficient permissions")
        return

    user_id = payload.sub
    db = get_postgres_client()
    user = await db.get_user(user_id) if user_id else None
    if not user or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found or disabled")
        return

    # --- CR-5: Verify the user belongs to the requested building ---
    # Admins/managers may subscribe to any building; residents are restricted.
    _ADMIN_LIKE = frozenset({"admin", "super_admin", "buildings_manager"})
    if role not in _ADMIN_LIKE:
        try:
            in_building = await db.is_user_in_building(user_id, building_id)
        except Exception:
            logger.warning("Building membership check failed for user %s", user_id, exc_info=True)
            in_building = False
        if not in_building:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not authorized for this building")
            return

    await offers_manager.connect(websocket, building_id)
    try:
        while True:
            data = await websocket.receive_text()

            if not _offers_check_rate_limit(websocket):
                await websocket.send_json({"error": "Rate limit exceeded"})
                continue

            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        offers_manager.disconnect(websocket, building_id)
    finally:
        _offers_cleanup_rate_limit(websocket)


def get_offers_ws_manager() -> OffersConnectionManager:
    return offers_manager
