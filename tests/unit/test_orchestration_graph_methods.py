"""Unit tests for GroupioOrchestrator internal methods."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_state(**kwargs):
    base = {
        "messages": [{"role": "user", "content": "test message"}],
        "user_id": "u1",
        "conversation_id": "conv-1",
        "building_id": "b1",
        "intent": "general_info",
        "confidence": 0.9,
        "actions_taken": [],
        "needs_human": False,
        "user_profile": None,
        "building_context": None,
        "active_offers": [],
        "rag_results": [],
        "last_agent_handoff": None,
        "final_response": None,
        "start_time": "2024-01-01T00:00:00+00:00",
        "tokens_used": 0,
        "escalation_reason": None,
    }
    base.update(kwargs)
    return base


def _make_orchestrator():
    """Build a GroupioOrchestrator with all external calls mocked."""
    mock_db = AsyncMock()
    mock_rag = AsyncMock()
    mock_agent = AsyncMock()
    mock_agent.config = MagicMock(description="desc", model="claude-sonnet")
    mock_agent.run = AsyncMock(return_value=_make_state())
    mock_agent.get_metrics = AsyncMock(return_value={"calls": 1})

    with patch("src.orchestration.graph.get_postgres_client", return_value=mock_db):
        with patch("src.orchestration.graph.get_rag_pipeline", return_value=mock_rag):
            with patch("src.orchestration.graph.RouterAgent", return_value=mock_agent):
                with patch("src.orchestration.graph.SupportAgent", return_value=mock_agent):
                    with patch("src.orchestration.graph.MatchingAgent", return_value=mock_agent):
                        with patch("src.orchestration.graph.PricingAgent", return_value=mock_agent):
                            with patch("src.orchestration.graph.VettingAgent", return_value=mock_agent):
                                with patch("src.orchestration.graph.OutreachAgent", return_value=mock_agent):
                                    with patch(
                                        "src.orchestration.graph.AnalyticsAgent",
                                        return_value=mock_agent,
                                    ):
                                        with patch(
                                            "src.orchestration.graph.ArchitectureAgent",
                                            return_value=mock_agent,
                                        ):
                                            from src.orchestration.graph import GroupioOrchestrator

                                            orch = GroupioOrchestrator.__new__(GroupioOrchestrator)
                                            orch._db = mock_db
                                            orch._rag = mock_rag
                                            orch.agents = {
                                                "router": mock_agent,
                                                "support": mock_agent,
                                                "matching": mock_agent,
                                                "pricing": mock_agent,
                                                "vetting": mock_agent,
                                                "outreach": mock_agent,
                                                "analytics": mock_agent,
                                                "architecture": mock_agent,
                                                "payment": mock_agent,
                                            }
                                            return orch, mock_db, mock_rag, mock_agent


# ---------------------------------------------------------------------------
# _normalize_last_agent_handoff
# ---------------------------------------------------------------------------


def test_normalize_last_agent_handoff_full():
    orch, _, _, _ = _make_orchestrator()
    action = {
        "agent": "support",
        "response": {"message": "hello"},
        "summary_for_next_agent": "summary",
        "suggested_next_intent": "pricing_question",
        "entities_to_pass": {"key": "val"},
        "suggested_next_agent": "pricing",
    }
    result = orch._normalize_last_agent_handoff(action)
    assert result["agent"] == "support"
    assert result["response_preview"] == "hello"
    assert result["suggested_next_agent"] == "pricing"


def test_normalize_last_agent_handoff_empty_action():
    orch, _, _, _ = _make_orchestrator()
    result = orch._normalize_last_agent_handoff({})
    assert result["agent"] is None
    assert result["response_preview"] == ""


# ---------------------------------------------------------------------------
# _determine_next_agent
# ---------------------------------------------------------------------------


def test_determine_next_agent_needs_human():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(needs_human=True)
    assert orch._determine_next_agent(state) == "human"


def test_determine_next_agent_low_confidence_clarification():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(
        confidence=0.1,
        actions_taken=[{"action": "clarification_needed"}],
    )
    with patch("src.orchestration.graph.get_settings") as mock_settings:
        mock_settings.return_value.ROUTER_CONFIDENCE_THRESHOLD = 0.5
        result = orch._determine_next_agent(state)
    assert result == "end"


def test_determine_next_agent_low_confidence_no_clarification():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(confidence=0.1, actions_taken=[])
    with patch("src.orchestration.graph.get_settings") as mock_settings:
        mock_settings.return_value.ROUTER_CONFIDENCE_THRESHOLD = 0.5
        result = orch._determine_next_agent(state)
    assert result == "support"


def test_determine_next_agent_suggested_short_message():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(
        confidence=0.9,
        messages=[{"role": "user", "content": "כן"}],
        last_agent_handoff={"suggested_next_agent": "pricing"},
    )
    with patch("src.orchestration.graph.get_settings") as mock_settings:
        mock_settings.return_value.ROUTER_CONFIDENCE_THRESHOLD = 0.5
        result = orch._determine_next_agent(state)
    assert result == "pricing"


def test_determine_next_agent_suggested_mid_confidence():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(
        confidence=0.6,
        messages=[{"role": "user", "content": "I need pricing help for my building"}],
        last_agent_handoff={"suggested_next_agent": "pricing"},
    )
    with patch("src.orchestration.graph.get_settings") as mock_settings:
        mock_settings.return_value.ROUTER_CONFIDENCE_THRESHOLD = 0.5
        result = orch._determine_next_agent(state)
    assert result == "pricing"


def test_determine_next_agent_intent_routing():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(intent="contractor_search", confidence=0.9, last_agent_handoff=None)
    with patch("src.orchestration.graph.get_settings") as mock_settings:
        mock_settings.return_value.ROUTER_CONFIDENCE_THRESHOLD = 0.5
        result = orch._determine_next_agent(state)
    assert result == "matching"


def test_determine_next_agent_unknown_agent_defaults_to_support():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(intent="unknown_intent_xyz", confidence=0.9, last_agent_handoff=None)
    with patch("src.orchestration.graph.get_settings") as mock_settings:
        mock_settings.return_value.ROUTER_CONFIDENCE_THRESHOLD = 0.5
        result = orch._determine_next_agent(state)
    assert result == "support"


# ---------------------------------------------------------------------------
# _should_continue
# ---------------------------------------------------------------------------


def test_should_continue_needs_human():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(needs_human=True)
    assert orch._should_continue(state) == "human"


def test_should_continue_requires_followup():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(
        needs_human=False,
        actions_taken=[{"requires_followup": True}],
    )
    assert orch._should_continue(state) == "continue"


def test_should_continue_no_followup():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(needs_human=False, actions_taken=[{"requires_followup": False}])
    assert orch._should_continue(state) == "end"


def test_should_continue_empty_actions():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(needs_human=False, actions_taken=[])
    assert orch._should_continue(state) == "end"


# ---------------------------------------------------------------------------
# _format_final_response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_format_final_response_needs_human():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(
        needs_human=True,
        actions_taken=[{"response": {"type": "handoff", "message": "connecting..."}}],
    )
    result = await orch._format_final_response(state)
    assert result["final_response"]["type"] == "handoff"


@pytest.mark.asyncio
async def test_format_final_response_with_actions():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(
        needs_human=False,
        actions_taken=[{"response": {"type": "text", "message": "Here is info"}}],
    )
    result = await orch._format_final_response(state)
    assert result["final_response"]["type"] == "text"


@pytest.mark.asyncio
async def test_format_final_response_no_actions():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(needs_human=False, actions_taken=[])
    result = await orch._format_final_response(state)
    assert "message" in result["final_response"]


@pytest.mark.asyncio
async def test_format_final_response_needs_human_no_actions():
    orch, _, _, _ = _make_orchestrator()
    state = _make_state(needs_human=True, actions_taken=[])
    result = await orch._format_final_response(state)
    assert result["final_response"]["type"] == "handoff"


# ---------------------------------------------------------------------------
# _handoff_to_human
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handoff_to_human_success():
    orch, mock_db, _, _ = _make_orchestrator()
    mock_db.create_support_ticket = AsyncMock(return_value={"id": "ticket-1"})
    state = _make_state(
        needs_human=True,
        escalation_reason="user requested",
        intent="complaint",
    )
    result = await orch._handoff_to_human(state)
    actions = result["actions_taken"]
    assert len(actions) == 1
    assert actions[0]["action"] == "escalated_to_human"
    assert actions[0]["details"]["ticket_id"] == "ticket-1"


@pytest.mark.asyncio
async def test_handoff_to_human_db_error():
    orch, mock_db, _, _ = _make_orchestrator()
    mock_db.create_support_ticket = AsyncMock(side_effect=RuntimeError("db error"))
    state = _make_state(needs_human=True)
    result = await orch._handoff_to_human(state)
    assert result["actions_taken"][0]["details"]["ticket_id"] == "error"


# ---------------------------------------------------------------------------
# _run_agent_safe – error path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_agent_safe_handles_transient_error():
    orch, _, _, mock_agent = _make_orchestrator()
    mock_agent.run = AsyncMock(side_effect=ConnectionError("timeout"))
    orch.agents["support"] = mock_agent

    wrapped = orch._run_agent_safe("support")
    state = _make_state()
    result = await wrapped(state)

    assert result["actions_taken"][0]["action"] == "agent_error"
    assert "transient" in result["actions_taken"][0]["details"]["error"]


@pytest.mark.asyncio
async def test_run_agent_safe_handles_permanent_error():
    orch, _, _, mock_agent = _make_orchestrator()
    mock_agent.run = AsyncMock(side_effect=ValueError("bad input"))
    orch.agents["pricing"] = mock_agent

    wrapped = orch._run_agent_safe("pricing")
    state = _make_state()
    result = await wrapped(state)

    assert result["actions_taken"][0]["action"] == "agent_error"
    assert "permanent" in result["actions_taken"][0]["details"]["error"]


# ---------------------------------------------------------------------------
# _get_relevant_context
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_relevant_context_known_intent():
    orch, _, mock_rag, _ = _make_orchestrator()
    mock_rag.retrieve = AsyncMock(return_value=[{"doc": "result"}])
    result = await orch._get_relevant_context("need contractor", "contractor_search")
    mock_rag.retrieve.assert_called_once()
    assert result == [{"doc": "result"}]


@pytest.mark.asyncio
async def test_get_relevant_context_unknown_intent_defaults_to_kb():
    orch, _, mock_rag, _ = _make_orchestrator()
    mock_rag.retrieve = AsyncMock(return_value=[])
    await orch._get_relevant_context("question", "unknown_intent")
    call_kwargs = mock_rag.retrieve.call_args[1]
    assert call_kwargs["namespace"] == "knowledge_base"


# ---------------------------------------------------------------------------
# get_orchestrator singleton
# ---------------------------------------------------------------------------


def test_get_orchestrator_returns_singleton():
    import src.orchestration.graph as graph_mod

    graph_mod._orchestrator = None
    mock_db = AsyncMock()
    mock_rag = AsyncMock()
    mock_agent = MagicMock()
    mock_agent.config = MagicMock(description="d", model="m")

    with patch("src.orchestration.graph.get_postgres_client", return_value=mock_db):
        with patch("src.orchestration.graph.get_rag_pipeline", return_value=mock_rag):
            with patch("src.orchestration.graph.RouterAgent", return_value=mock_agent):
                with patch("src.orchestration.graph.SupportAgent", return_value=mock_agent):
                    with patch("src.orchestration.graph.MatchingAgent", return_value=mock_agent):
                        with patch("src.orchestration.graph.PricingAgent", return_value=mock_agent):
                            with patch("src.orchestration.graph.VettingAgent", return_value=mock_agent):
                                with patch("src.orchestration.graph.OutreachAgent", return_value=mock_agent):
                                    with patch(
                                        "src.orchestration.graph.AnalyticsAgent",
                                        return_value=mock_agent,
                                    ):
                                        with patch(
                                            "src.orchestration.graph.ArchitectureAgent",
                                            return_value=mock_agent,
                                        ):
                                            from src.orchestration.graph import get_orchestrator

                                            o1 = get_orchestrator()
                                            o2 = get_orchestrator()
                                            assert o1 is o2

    graph_mod._orchestrator = None
