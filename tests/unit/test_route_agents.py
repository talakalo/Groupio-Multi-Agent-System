"""Unit tests for /agents API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


def _make_admin():
    now = datetime.now(UTC)
    return UserInDB(
        id="admin-1",
        email="admin@example.com",
        full_name="Admin",
        phone="0501234567",
        role=UserRole.ADMIN,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _mock_agent(name="support"):
    agent = MagicMock()
    agent.config = MagicMock(description=f"{name} agent", model="claude-sonnet")
    agent.run = AsyncMock(
        return_value={
            "actions_taken": [{"action": "responded"}],
            "intent": "general_info",
            "confidence": 0.9,
            "needs_human": False,
        }
    )
    agent.get_metrics = AsyncMock(return_value={"calls": 5, "errors": 0, "tokens": 1000})
    return agent


def _client_with_orchestrator(user, mock_orch):
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    with patch("src.api.routes.agents.get_orchestrator", return_value=mock_orch):
        yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


class TestListAgents:
    def test_list_agents_ok(self):
        user = _make_admin()
        agent = _mock_agent("support")
        mock_orch = MagicMock()
        mock_orch.agents = {"support": agent, "matching": _mock_agent("matching")}

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.agents.get_orchestrator", return_value=mock_orch):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/agents/")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["agents"]) == 2
        finally:
            app.dependency_overrides.clear()


class TestGetAgentMetrics:
    def test_get_metrics_found(self):
        user = _make_admin()
        agent = _mock_agent("support")
        mock_orch = MagicMock()
        mock_orch.agents = {"support": agent}

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.agents.get_orchestrator", return_value=mock_orch):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/agents/support/metrics")
            assert resp.status_code == 200
            assert resp.json()["calls"] == 5
        finally:
            app.dependency_overrides.clear()

    def test_get_metrics_not_found(self):
        user = _make_admin()
        mock_orch = MagicMock()
        mock_orch.agents = {}

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.agents.get_orchestrator", return_value=mock_orch):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/agents/nonexistent/metrics")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestInvokeAgent:
    def test_invoke_agent_ok(self):
        user = _make_admin()
        agent = _mock_agent("support")
        mock_orch = MagicMock()
        mock_orch.agents = {"support": agent}

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.agents.get_orchestrator", return_value=mock_orch):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/agents/invoke",
                    json={
                        "agent_name": "support",
                        "user_id": "u1",
                        "message": "help",
                        "building_id": "b1",
                    },
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["agent_name"] == "support"
        finally:
            app.dependency_overrides.clear()

    def test_invoke_agent_not_found(self):
        user = _make_admin()
        mock_orch = MagicMock()
        mock_orch.agents = {}

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.agents.get_orchestrator", return_value=mock_orch):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/agents/invoke",
                    json={"agent_name": "ghost", "user_id": "u1", "message": "hi"},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()
