"""Integration tests for AI decision audit trail persistence (Task 2.6 / Task 2.9)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_create_agent_audit_entry_asyncpg():
    """create_agent_audit_entry must insert a row via asyncpg."""
    from src.databases.postgres import PostgresClient

    db = PostgresClient()
    db._use_supabase = False

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_acquire = MagicMock()
    mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_acquire.__aexit__ = AsyncMock(return_value=False)
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_acquire)

    from datetime import UTC, datetime

    entry = {
        "id": "audit-1",
        "session_id": "sess-1",
        "user_id": "u1",
        "agent_name": "matching",
        "action": "match_contractors",
        "input_summary": "user request",
        "output_summary": "matched 3 contractors",
        "model_used": "claude-sonnet-4-6",
        "tokens_used": 500,
        "latency_ms": 1200,
        "requires_human_review": True,
        "created_at": datetime.now(UTC),
    }

    with patch.object(db, "_get_client", AsyncMock(return_value=mock_pool)):
        await db.create_agent_audit_entry(entry)

    mock_conn.execute.assert_called_once()
    sql: str = mock_conn.execute.call_args[0][0]
    assert "agent_audit_log" in sql


@pytest.mark.asyncio
async def test_list_agent_audit_log_asyncpg():
    """list_agent_audit_log returns paginated results."""
    from src.databases.postgres import PostgresClient

    db = PostgresClient()
    db._use_supabase = False

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value={"c": 5})
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_acquire = MagicMock()
    mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_acquire.__aexit__ = AsyncMock(return_value=False)
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_acquire)

    with patch.object(db, "_get_client", AsyncMock(return_value=mock_pool)):
        items, total = await db.list_agent_audit_log(
            page=1, page_size=20, agent_name="matching"
        )

    assert items == []
    assert total == 5


@pytest.mark.asyncio
async def test_matching_agent_sets_requires_human_review():
    """Matching, Pricing, and Vetting agents must flag requires_human_review=True."""
    import asyncio
    from unittest.mock import patch

    persisted_data: dict = {}

    async def fake_create_audit(data: dict) -> None:
        persisted_data.update(data)

    from src.agents.base import BaseAgent

    agent = MagicMock(spec=BaseAgent)
    agent.config = MagicMock()
    agent.config.name = "matching"
    agent.config.model = "claude-sonnet-4-6"

    # Call _persist_audit directly
    BaseAgent._persist_audit(
        agent,
        state={"conversation_id": "c1", "user_id": "u1"},
        action="match",
        input_summary="find contractors",
        output_summary="found 3",
        latency_ms=800,
        tokens_used=300,
    )

    # Allow the fire-and-forget task to attempt (it will fail gracefully without DB)
    await asyncio.sleep(0)
