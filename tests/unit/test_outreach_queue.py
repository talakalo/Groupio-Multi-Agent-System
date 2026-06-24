"""Tests for outreach agent human approval queue (Task 1.2 / Task 2.9)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_outreach_agent_queues_instead_of_dispatching():
    """OutreachAgent.run() must write to outreach_queue, not call send_whatsapp."""
    from src.agents.outreach import OutreachAgent
    from src.models.agent_state import AgentState

    agent = OutreachAgent.__new__(OutreachAgent)
    agent.config = MagicMock()
    agent.config.name = "outreach"
    agent._metrics = {"calls": 0, "errors": 0, "tokens": 0}
    # BaseAgent.__init__ sets self.rag; bypass via __new__ requires manual init
    agent.rag = None
    agent._db = AsyncMock()
    agent._db.create_outreach_pending = AsyncMock(return_value={})
    agent._db.get_user_profile = AsyncMock(
        return_value={"id": "u1", "full_name": "Test User", "preferred_language": "he"}
    )
    agent._ab_test = AsyncMock()
    agent._ab_test.assign_variant = AsyncMock(return_value="control")
    agent._call_llm = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "Personalized message"}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )

    state: AgentState = {
        "user_id": "u1",
        "conversation_id": "conv-1",
        "building_id": "b1",
        "message": "trigger outreach",
        "context": {"trigger": "new_building_onboarding"},
        "actions_taken": [],
        "rag_context": [],
        "final_response": None,
        "requires_escalation": False,
        "escalation_reason": None,
        "metadata": {},
    }

    result = await agent.run(state)

    # Must have queued (create_outreach_pending called)
    agent._db.create_outreach_pending.assert_called_once()
    call_data = agent._db.create_outreach_pending.call_args[0][0]
    assert call_data["status"] == "pending_approval"
    assert call_data["user_id"] == "u1"

    # Action must reflect queued state
    assert result["actions_taken"][0]["action"] == "campaign_queued_for_approval"
    assert result["actions_taken"][0]["requires_followup"] is True


@pytest.mark.asyncio
async def test_outreach_queue_db_methods():
    """create_outreach_pending and list_outreach_queue must work on asyncpg path."""
    from src.databases.postgres import PostgresClient

    db = PostgresClient()
    db._use_supabase = False

    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=[])

    mock_acquire = MagicMock()
    mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_acquire.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire = MagicMock(return_value=mock_acquire)

    with patch.object(db, "_get_asyncpg_pool", AsyncMock(return_value=mock_pool)):
        from datetime import UTC, datetime

        await db.create_outreach_pending(
            {
                "id": "q1",
                "user_id": "u1",
                "campaign_type": "new_building_onboarding",
                "message": "Hello",
                "variant": "control",
                "status": "pending_approval",
                "created_at": datetime.now(UTC),
            }
        )
        mock_conn.execute.assert_called_once()

        items = await db.list_outreach_queue(status="pending_approval")
        assert items == []
