"""Error scenario tests — verifies the system handles failures gracefully.

Tests cover: LLM timeouts, database connection failures, rate limiting
edge cases, and circuit breaker behavior.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


class TestLLMErrorScenarios:
    """Test agent behavior when the LLM API fails."""

    @pytest.mark.asyncio
    async def test_llm_timeout_triggers_retry(self):
        """LLM timeout should be retried with backoff."""
        from src.agents.base import AgentConfig, BaseAgent, _llm_circuit_breaker

        # Reset circuit breaker state
        _llm_circuit_breaker._failure_count = 0
        _llm_circuit_breaker._state = "closed"

        config = AgentConfig(
            name="test",
            description="test agent",
            system_prompt="You are a test agent.",
            rag_enabled=False,
        )

        class TestAgent(BaseAgent):
            async def _run_impl(self, state):
                return state

        agent = TestAgent(config)

        # Mock LLM client to raise TimeoutError then succeed
        call_count = 0

        async def mock_create_message(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise TimeoutError("LLM API timeout")
            return {"content": "success", "usage": {"input_tokens": 10, "output_tokens": 20}}

        agent.llm_client = MagicMock()
        agent.llm_client.create_message = mock_create_message

        result = await agent._call_llm(messages=[{"role": "user", "content": "test"}])
        assert result["content"] == "success"
        assert call_count == 3  # 2 failures + 1 success

    @pytest.mark.asyncio
    async def test_llm_permanent_error_not_retried(self):
        """Non-transient errors should not be retried."""
        from src.agents.base import AgentConfig, BaseAgent, _llm_circuit_breaker

        _llm_circuit_breaker._failure_count = 0
        _llm_circuit_breaker._state = "closed"

        config = AgentConfig(
            name="test",
            description="test agent",
            system_prompt="You are a test agent.",
            rag_enabled=False,
        )

        class TestAgent(BaseAgent):
            async def _run_impl(self, state):
                return state

        agent = TestAgent(config)

        call_count = 0

        async def mock_create_message(**kwargs):
            nonlocal call_count
            call_count += 1
            raise ValueError("Invalid input — permanent error")

        agent.llm_client = MagicMock()
        agent.llm_client.create_message = mock_create_message

        with pytest.raises(ValueError, match="Invalid input"):
            await agent._call_llm(messages=[{"role": "user", "content": "test"}])
        assert call_count == 1  # No retry for permanent errors

    @pytest.mark.asyncio
    async def test_circuit_breaker_opens_after_failures(self):
        """Circuit breaker should open after threshold failures."""
        from src.agents.base import CircuitBreaker

        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=60.0)
        assert not cb.is_open

        for _ in range(3):
            cb.record_failure()
        assert cb.is_open

        cb.record_success()
        assert not cb.is_open


class TestOrchestratorErrorScenarios:
    """Test orchestrator handles agent failures gracefully."""

    @pytest.mark.asyncio
    async def test_agent_failure_returns_error_action(self):
        """When an agent raises, orchestrator should capture error in state."""
        from src.orchestration.graph import GroupioOrchestrator

        with patch.object(GroupioOrchestrator, "__init__", lambda self: None):
            orch = GroupioOrchestrator()
            orch.agents = {"test": MagicMock()}
            orch.agents["test"].run = AsyncMock(side_effect=RuntimeError("boom"))

            run_fn = orch._run_agent_safe("test")
            state = {
                "user_id": "u1",
                "conversation_id": "c1",
                "messages": [],
                "actions_taken": [],
                "needs_human": False,
            }
            result = await run_fn(state)
            assert result["actions_taken"][0]["action"] == "agent_error"
            assert "boom" in result["actions_taken"][0]["details"]["error"]


class TestWebSocketValidation:
    """Test WebSocket message validation."""

    def test_oversized_message_rejected(self):
        from src.api.routes.websocket import MAX_MESSAGE_SIZE, _validate_message

        big_msg = "x" * (MAX_MESSAGE_SIZE + 100)
        is_valid, reason = _validate_message(big_msg)
        assert not is_valid
        assert "size" in reason.lower()

    def test_ping_accepted(self):
        from src.api.routes.websocket import _validate_message

        is_valid, _ = _validate_message("ping")
        assert is_valid

    def test_valid_json_accepted(self):
        import json

        from src.api.routes.websocket import _validate_message

        msg = json.dumps({"type": "subscribe", "channel": "offers"})
        is_valid, _ = _validate_message(msg)
        assert is_valid

    def test_unknown_type_rejected(self):
        import json

        from src.api.routes.websocket import _validate_message

        msg = json.dumps({"type": "hack_the_system"})
        is_valid, reason = _validate_message(msg)
        assert not is_valid
        assert "Unknown" in reason


class TestSchemaNotReady:
    """Test DB schema-not-ready returns 503 with clear classification."""

    def test_is_schema_not_ready_recognises_undefined_table_error(self):
        """_is_schema_not_ready returns True for asyncpg UndefinedTableError."""
        import asyncpg.exceptions

        from src.api.main import _is_schema_not_ready

        exc = asyncpg.exceptions.UndefinedTableError('relation "users" does not exist')
        assert _is_schema_not_ready(exc) is True

    def test_login_returns_503_when_users_table_missing(self):
        """POST /auth/login/json returns 503 when users table does not exist."""
        import asyncpg.exceptions

        from src.api.main import app

        db = MagicMock()
        db.get_user_by_email = AsyncMock(
            side_effect=asyncpg.exceptions.UndefinedTableError('relation "users" does not exist')
        )

        redis = AsyncMock()
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.increment_login_failures = AsyncMock(return_value=1)
        with patch("src.api.routes.auth.get_postgres_client", return_value=db):
            with patch("src.api.routes.auth.get_redis_client", return_value=redis):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/auth/login/json",
                    json={"email": "u@ex.com", "password": "x"},
                )
        assert resp.status_code == 503
        data = resp.json()
        assert "schema" in data.get("detail", "").lower() or data.get("code") == "DB_SCHEMA_NOT_READY"


class TestRateLimiting:
    """Test rate limiting edge cases."""

    @pytest.mark.asyncio
    async def test_rate_limit_boundary(self):
        """Exactly at the limit should still allow, one over should block.

        The implementation uses an atomic Lua script (INCR + EXPIRE) that returns
        the post-increment count. count <= limit means allowed; count > limit means blocked.
        """
        from src.databases.redis_client import RedisClient

        client = RedisClient.__new__(RedisClient)
        mock_redis = AsyncMock()
        client._redis = mock_redis

        # Simulate: counter was at 59, after INCR = 60. 60 <= 60 → allowed
        mock_redis.eval = AsyncMock(return_value=60)
        allowed = await client.check_rate_limit("user1", limit=60, window=60)
        assert allowed is True

        # Simulate: counter was at 60, after INCR = 61. 61 <= 60 → blocked
        mock_redis.eval = AsyncMock(return_value=61)
        allowed = await client.check_rate_limit("user1", limit=60, window=60)
        assert allowed is False
