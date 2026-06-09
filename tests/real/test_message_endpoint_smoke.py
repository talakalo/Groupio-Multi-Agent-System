"""Live smoke test for the /api/v1/message endpoint.

Uses real PostgreSQL and Redis services while stubbing the orchestrator so the
test validates runtime wiring without making paid LLM calls.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user, hash_password
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client


@pytest_asyncio.fixture
async def _real_service_env():
    """Reset cached singletons/settings so tests use TEST_DATABASE_URL + REDIS_URL."""
    from src.databases import postgres as postgres_module
    from src.databases import redis_client as redis_module

    old_db = postgres_module._postgres_client
    old_redis = redis_module._redis_client
    postgres_module._postgres_client = None
    redis_module._redis_client = None
    get_settings.cache_clear()
    yield

    new_db = postgres_module._postgres_client
    new_redis = redis_module._redis_client
    if new_db is not None:
        await new_db.close()
    if new_redis is not None:
        await new_redis.close()

    postgres_module._postgres_client = old_db
    redis_module._redis_client = old_redis
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_message_endpoint_smoke_uses_real_postgres_and_redis(db_pool, _real_service_env) -> None:
    """POST /api/v1/message should succeed and persist a conversation log."""
    user_id = str(uuid.uuid4())
    phone_suffix = str(uuid.uuid4().int % 100000000).zfill(8)
    rate_key = f"rate:{user_id}"
    conversation_id = f"conv-{uuid.uuid4()}"

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO users
              (id, email, hashed_password, full_name, phone, role, preferred_language,
               is_active, is_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'resident', 'he', true, true, NOW(), NOW())
            """,
            user_id,
            f"{user_id[:8]}@smoke.example.com",
            hash_password("test-password"),
            "Smoke Test User",
            f"05{phone_suffix}",
        )

    redis = get_redis_client()
    try:
        await redis.delete(rate_key)
    except Exception as exc:  # pragma: no cover - explicit skip path for local envs
        pytest.skip(f"Redis unavailable for real smoke test: {exc}")

    async def _override_user():
        return SimpleNamespace(id=user_id, role="resident", is_active=True, is_verified=True)

    app.dependency_overrides[get_current_user] = _override_user
    try:
        with patch("src.api.main.get_orchestrator") as mock_orchestrator:
            mock_orchestrator.return_value.run = AsyncMock(
                return_value={
                    "conversation_id": conversation_id,
                    "response": {"type": "text", "message": "Smoke response"},
                    "metadata": {
                        "agent": "support",
                        "duration_ms": 12,
                        "tokens_used": 0,
                        "token_usage_available": False,
                    },
                }
            )

            with TestClient(app) as client:
                response = client.post(
                    "/api/v1/message",
                    json={
                        "user_id": "spoofed-user-id",
                        "message": "Smoke test message",
                        "channel": "web",
                    },
                )

        assert response.status_code == 200
        data = response.json()
        assert data["conversation_id"] == conversation_id
        assert data["response"]["message"] == "Smoke response"
        assert data["metadata"]["agent"] == "support"

        db = get_postgres_client()
        rows, total = await db.get_conversation_history(user_id, limit=5)
        assert total >= 1
        assert any(item["message"] == "Smoke test message" for item in rows)

        stored_rate = await redis.get(rate_key)
        assert stored_rate == "1"
    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM conversation_logs WHERE user_id = $1", user_id)
            await conn.execute("DELETE FROM users WHERE id = $1", user_id)
        await redis.delete(rate_key)
        app.dependency_overrides.pop(get_current_user, None)
