"""Regression tests for WebSocket /ws/admin authentication (Task 1.3).

Verifies that unauthenticated and invalid-token connections are rejected
with WS_1008_POLICY_VIOLATION, and that a valid admin token is accepted.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class _FakeWebSocket:
    """Minimal WebSocket stand-in for testing auth logic."""

    def __init__(self, token: str | None = None, role: str | None = None):
        self.query_params = {"token": token} if token else {}
        self.cookies: dict = {}
        self.closed_code: int | None = None
        self.closed_reason: str | None = None
        self._accepted = False

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed_code = code
        self.closed_reason = reason

    async def accept(self) -> None:
        self._accepted = True

    async def receive_text(self) -> str:
        return ""

    async def send_text(self, data: str) -> None:
        pass


def _make_token_payload(role: str = "admin") -> MagicMock:
    payload = MagicMock()
    payload.sub = "user-123"
    payload.role = MagicMock()
    payload.role.value = role
    return payload


@pytest.mark.asyncio
async def test_ws_admin_rejects_missing_token() -> None:
    """Connection with no token must be closed with 1008."""
    from src.api.routes.websocket import admin_websocket

    ws = _FakeWebSocket(token=None)

    with patch("src.api.routes.websocket.verify_access_token", return_value=None):
        await admin_websocket(ws)

    assert ws.closed_code == 1008
    assert ws._accepted is False


@pytest.mark.asyncio
async def test_ws_admin_rejects_invalid_token() -> None:
    """Connection with an invalid/expired token must be closed with 1008."""
    from src.api.routes.websocket import admin_websocket

    ws = _FakeWebSocket(token="bad.token.here")

    with patch("src.api.routes.websocket.verify_access_token", return_value=None):
        await admin_websocket(ws)

    assert ws.closed_code == 1008


@pytest.mark.asyncio
async def test_ws_admin_rejects_non_admin_role() -> None:
    """A valid JWT with role=resident must be rejected."""
    from src.api.routes.websocket import admin_websocket

    ws = _FakeWebSocket(token="valid.resident.token")
    payload = _make_token_payload(role="resident")

    with patch("src.api.routes.websocket.verify_access_token", return_value=payload):
        await admin_websocket(ws)

    assert ws.closed_code == 1008


@pytest.mark.asyncio
async def test_ws_admin_accepts_valid_admin_token() -> None:
    """A valid JWT with role=admin must NOT be rejected at the auth gate."""
    from src.api.routes.websocket import admin_websocket

    ws = _FakeWebSocket(token="valid.admin.token")
    payload = _make_token_payload(role="admin")

    mock_db_user = MagicMock()
    mock_db_user.id = "user-123"
    mock_db_user.role = MagicMock()
    mock_db_user.role.value = "admin"

    mock_db = AsyncMock()
    mock_db.get_user.return_value = mock_db_user

    with (
        patch("src.api.routes.websocket.verify_access_token", return_value=payload),
        patch("src.api.routes.websocket.get_postgres_client", return_value=mock_db),
        patch.object(ws, "accept", new_callable=AsyncMock) as mock_accept,
        patch.object(ws, "receive_text", side_effect=Exception("disconnect")),
    ):
        try:
            await admin_websocket(ws)
        except Exception:
            pass

    assert ws.closed_code != 1008 or mock_accept.called
