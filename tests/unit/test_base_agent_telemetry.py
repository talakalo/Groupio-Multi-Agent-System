"""Unit tests for BaseAgent token telemetry behavior."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.base import AgentConfig, BaseAgent


class _TelemetryTextAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            AgentConfig(
                name="telemetry_text",
                description="Telemetry test agent",
                system_prompt="You are a test agent.",
            )
        )

    async def _run_impl(self, state):
        await self._call_llm(state["messages"])
        state["actions_taken"] = [
            {
                "agent": "telemetry_text",
                "action": "responded",
                "response": {"type": "text", "message": "ok"},
            }
        ]
        return state


class _TelemetryStructuredAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            AgentConfig(
                name="telemetry_structured",
                description="Telemetry test agent",
                system_prompt="You are a test agent.",
            )
        )

    async def _run_impl(self, state):
        result = await self._call_llm_structured(
            state["messages"],
            output_schema={"type": "object", "properties": {"intent": {"type": "string"}}},
        )
        state["actions_taken"] = [
            {
                "agent": "telemetry_structured",
                "action": "classified",
                "response": {"type": "text", "message": result["intent"]},
            }
        ]
        return state


@pytest.fixture
def telemetry_text_agent():
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()
        agent = _TelemetryTextAgent()
        agent.llm_client = AsyncMock()
        agent._persist_audit = MagicMock()
        return agent


@pytest.fixture
def telemetry_structured_agent():
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()
        agent = _TelemetryStructuredAgent()
        agent.llm_client = AsyncMock()
        agent._persist_audit = MagicMock()
        return agent


@pytest.mark.asyncio
async def test_run_accumulates_tokens_from_text_llm_calls(telemetry_text_agent, sample_agent_state):
    telemetry_text_agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 120, "output_tokens": 30},
        }
    )

    result = await telemetry_text_agent.run(sample_agent_state)

    assert result["tokens_used"] == 150
    assert result["token_usage_available"] is True
    telemetry_text_agent._persist_audit.assert_called_once()
    assert telemetry_text_agent._persist_audit.call_args.kwargs["tokens_used"] == 150


@pytest.mark.asyncio
async def test_run_marks_usage_unavailable_when_provider_omits_usage(telemetry_text_agent, sample_agent_state):
    telemetry_text_agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "ok"}],
        }
    )

    result = await telemetry_text_agent.run(sample_agent_state)

    assert result["tokens_used"] == 0
    assert result["token_usage_available"] is False
    telemetry_text_agent._persist_audit.assert_called_once()
    assert telemetry_text_agent._persist_audit.call_args.kwargs["tokens_used"] == 0


@pytest.mark.asyncio
async def test_structured_output_tracks_usage_from_client_metadata(
    telemetry_structured_agent,
    sample_agent_state,
):
    telemetry_structured_agent.llm_client.create_structured_output = AsyncMock(return_value={"intent": "support"})
    telemetry_structured_agent.llm_client.last_usage = {"input_tokens": 80, "output_tokens": 20}

    result = await telemetry_structured_agent.run(sample_agent_state)

    assert result["tokens_used"] == 100
    assert result["token_usage_available"] is True
    telemetry_structured_agent._persist_audit.assert_called_once()
    assert telemetry_structured_agent._persist_audit.call_args.kwargs["tokens_used"] == 100
