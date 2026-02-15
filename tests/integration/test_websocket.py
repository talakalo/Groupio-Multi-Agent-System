"""Tests for WebSocket endpoint and ConnectionManager."""

import asyncio

from fastapi.testclient import TestClient

from src.api.main import app
from src.api.routes.websocket import ConnectionManager


class TestAdminWebSocket:
    """Tests for the /api/v1/ws/admin WebSocket endpoint."""

    def test_admin_websocket_ping_pong(self):
        """WebSocket responds to 'ping' with 'pong'."""
        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws/admin") as ws:
            ws.send_text("ping")
            response = ws.receive_text()
            assert response == "pong"

    def test_admin_websocket_multiple_pings(self):
        """WebSocket handles multiple sequential ping/pong exchanges."""
        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws/admin") as ws:
            for _ in range(3):
                ws.send_text("ping")
                response = ws.receive_text()
                assert response == "pong"

    def test_admin_websocket_non_ping_no_response(self):
        """Non-ping messages are received by the server without crashing.

        The server reads the text but only replies to 'ping', so we
        verify that sending something else and then a ping still works.
        """
        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws/admin") as ws:
            ws.send_text("hello")
            # Server loops back to receive_text; send a ping to confirm it's alive
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
