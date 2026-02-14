"""Unit tests for monitoring utilities."""

from unittest.mock import MagicMock, patch

import pytest

from src.utils.monitoring import (
    generate_conversation_id,
    generate_request_id,
    track_agent_execution,
    track_escalation,
    track_llm_usage,
    track_rag_retrieval,
)

# ------------------------------------------------------------------
# track_agent_execution decorator
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_track_agent_execution_increments_counter():
    """The decorator should increment the agent_requests counter."""
    with patch("src.utils.monitoring.agent_requests") as mock_counter:
        mock_label = mock_counter.labels.return_value

        @track_agent_execution("test_agent")
        async def my_func():
            return "done"

        result = await my_func()

        assert result == "done"
        mock_counter.labels.assert_called_with(agent_name="test_agent")
        mock_label.inc.assert_called_once()


@pytest.mark.asyncio
async def test_track_agent_execution_records_duration():
    """The decorator should observe duration on the agent_duration histogram."""
    with (
        patch("src.utils.monitoring.agent_requests"),
        patch("src.utils.monitoring.agent_duration") as mock_histogram,
    ):
        mock_label = mock_histogram.labels.return_value

        @track_agent_execution("test_agent")
        async def my_func():
            return "done"

        await my_func()

        mock_histogram.labels.assert_called_with(agent_name="test_agent")
        mock_label.observe.assert_called_once()
        # Duration should be a non-negative float
        observed_duration = mock_label.observe.call_args[0][0]
        assert isinstance(observed_duration, float)
        assert observed_duration >= 0


@pytest.mark.asyncio
async def test_track_agent_execution_tracks_errors():
    """On exception, the decorator should increment errors_total and re-raise."""
    with (
        patch("src.utils.monitoring.agent_requests"),
        patch("src.utils.monitoring.agent_duration"),
        patch("src.utils.monitoring.errors_total") as mock_errors,
    ):
        mock_label = mock_errors.labels.return_value

        @track_agent_execution("test_agent")
        async def failing_func():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            await failing_func()

        mock_errors.labels.assert_called_with(
            error_type="ValueError",
            agent_name="test_agent",
        )
        mock_label.inc.assert_called_once()


# ------------------------------------------------------------------
# track_rag_retrieval
# ------------------------------------------------------------------


def test_track_rag_retrieval_increments_counter():
    """track_rag_retrieval should increment the rag_retrievals counter."""
    with patch("src.utils.monitoring.rag_retrievals") as mock_counter:
        mock_label = mock_counter.labels.return_value

        track_rag_retrieval(namespace="contractors", strategy="hybrid")

        mock_counter.labels.assert_called_with(namespace="contractors", strategy="hybrid")
        mock_label.inc.assert_called_once()


# ------------------------------------------------------------------
# track_llm_usage
# ------------------------------------------------------------------


def test_track_llm_usage_tracks_input_and_output():
    """track_llm_usage should increment token counters for both directions."""
    with patch("src.utils.monitoring.llm_tokens") as mock_counter:
        mock_input_label = MagicMock()
        mock_output_label = MagicMock()

        def labels_side_effect(model, direction):
            if direction == "input":
                return mock_input_label
            return mock_output_label

        mock_counter.labels.side_effect = labels_side_effect

        track_llm_usage(model="claude-sonnet-4-20250514", input_tokens=100, output_tokens=50)

        # Should be called twice: once for input, once for output
        assert mock_counter.labels.call_count == 2
        mock_input_label.inc.assert_called_once_with(100)
        mock_output_label.inc.assert_called_once_with(50)


# ------------------------------------------------------------------
# track_escalation
# ------------------------------------------------------------------


def test_track_escalation_increments_counter():
    """track_escalation should increment the escalations_total counter."""
    with patch("src.utils.monitoring.escalations_total") as mock_counter:
        mock_label = mock_counter.labels.return_value

        track_escalation(reason="user_request")

        mock_counter.labels.assert_called_with(reason="user_request")
        mock_label.inc.assert_called_once()


# ------------------------------------------------------------------
# ID generators
# ------------------------------------------------------------------


def test_generate_request_id_returns_uuid():
    """generate_request_id should return a valid UUID4 string."""
    import uuid

    request_id = generate_request_id()

    assert isinstance(request_id, str)
    parsed = uuid.UUID(request_id)
    assert parsed.version == 4


def test_generate_conversation_id_has_prefix():
    """generate_conversation_id should return a string with 'conv_' prefix."""
    conv_id = generate_conversation_id()

    assert isinstance(conv_id, str)
    assert conv_id.startswith("conv_")
    # The hex portion should be 16 characters
    hex_part = conv_id[len("conv_") :]
    assert len(hex_part) == 16
    # Should be valid hex
    int(hex_part, 16)
