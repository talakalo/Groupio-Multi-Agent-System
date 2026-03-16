"""Tests for WebSocket endpoint and ConnectionManager."""

import asyncio
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.api.main import app
from src.api.routes.websocket import ConnectionManager
from src.models.user import TokenPayload, UserInDB, UserRole


def _fake_admin_token_payload() -> TokenPayload:
    """Return a fake admin token payload for WebSocket auth tests."""
    from datetime import UTC, datetime

    return TokenPayload(
        sub="admin-test-id",
        email="admin@test.com",
        role=UserRole.ADMIN,
        exp=datetime(2099, 1, 1, tzinfo=UTC),
        iat=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _fake_admin_user() -> UserInDB:
    from datetime import UTC, datetime

    return UserInDB(
        id="admin-test-id",
        email="admin@test.com",
        full_name="Test Admin",
        phone="0501234567",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


class TestAdminWebSocket:
    """Tests for the /api/v1/ws/admin WebSocket endpoint."""

    def _connect(self, client: TestClient):
        """Open an authenticated WebSocket connection."""
        return client.websocket_connect("/api/v1/ws/admin?token=fake-jwt")

    @patch("src.api.routes.websocket.get_postgres_client")
    @patch("src.api.routes.websocket.verify_access_token", return_value=_fake_admin_token_payload())
    def test_admin_websocket_ping_pong(self, _mock_verify, mock_db):
        """WebSocket responds to 'ping' with 'pong'."""
        mock_db.return_value.get_user = AsyncMock(return_value=_fake_admin_user())
        client = TestClient(app)
        with self._connect(client) as ws:
            ws.send_text("ping")
            response = ws.receive_text()
            assert response == "pong"

    @patch("src.api.routes.websocket.get_postgres_client")
    @patch("src.api.routes.websocket.verify_access_token", return_value=_fake_admin_token_payload())
    def test_admin_websocket_multiple_pings(self, _mock_verify, mock_db):
        """WebSocket handles multiple sequential ping/pong exchanges."""
        mock_db.return_value.get_user = AsyncMock(return_value=_fake_admin_user())
        client = TestClient(app)
        with self._connect(client) as ws:
            for _ in range(3):
                ws.send_text("ping")
                response = ws.receive_text()
                assert response == "pong"

    @patch("src.api.routes.websocket.get_postgres_client")
    @patch("src.api.routes.websocket.verify_access_token", return_value=_fake_admin_token_payload())
    def test_admin_websocket_non_ping_no_response(self, _mock_verify, mock_db):
        """Non-ping messages are received by the server without crashing."""
        mock_db.return_value.get_user = AsyncMock(return_value=_fake_admin_user())
        client = TestClient(app)
        with self._connect(client) as ws:
            ws.send_text("hello")
            ws.send_text("ping")
            response = ws.receive_text()
            assert response == "pong"


class TestConnectionManager:
    """Unit-level tests for ConnectionManager helper class."""

    def test_broadcast_empty_connections(self):
        """Broadcast with no active connections completes without error."""
        manager = ConnectionManager()
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(manager.broadcast({"type": "test"}))
        finally:
            loop.close()
        assert len(manager.active_connections) == 0

    def test_initial_state(self):
        """A freshly created manager has no active connections."""
        manager = ConnectionManager()
        assert manager.active_connections == []
