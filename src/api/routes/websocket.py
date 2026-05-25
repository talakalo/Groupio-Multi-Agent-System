"""WebSocket endpoint for real-time admin notifications."""

import json
import logging
import time
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from src.api.middleware.auth import verify_access_token
from src.databases.postgres import get_postgres_client

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
