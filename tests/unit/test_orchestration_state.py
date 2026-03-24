"""Unit tests for orchestration state utilities."""

import time
from datetime import UTC, datetime

from src.orchestration.state import (
    calculate_duration_ms,
    create_initial_state,
    summarize_rag_results,
)

# ---------------------------------------------------------------------------
# create_initial_state
# ---------------------------------------------------------------------------


def test_create_initial_state_basic():
    state = create_initial_state(
        user_message="Hello",
        user_id="user-1",
    )
    assert state["user_id"] == "user-1"
    assert state["messages"][0]["content"] == "Hello"
    assert state["current_agent"] == "router"
    assert state["confidence"] == 0.0
    assert state["needs_human"] is False
    assert state["tokens_used"] == 0
    assert state["rag_results"] == []
    assert state["actions_taken"] == []


def test_create_initial_state_with_building_and_conversation():
    state = create_initial_state(
        user_message="Fix roof",
        user_id="user-2",
        building_id="building-42",
        conversation_id="conv-99",
    )
    assert state["building_id"] == "building-42"
    assert state["conversation_id"] == "conv-99"


def test_create_initial_state_generates_conversation_id():
    state = create_initial_state("Hello", "user-1")
    assert state["conversation_id"] is not None
    assert len(state["conversation_id"]) > 0


def test_create_initial_state_start_time_is_iso():
    state = create_initial_state("Hello", "user-1")
    # Should be parseable as ISO datetime
    dt = datetime.fromisoformat(state["start_time"])
    assert dt.tzinfo is not None


# ---------------------------------------------------------------------------
# calculate_duration_ms
# ---------------------------------------------------------------------------


def test_calculate_duration_ms_positive():
    start = datetime.now(UTC).isoformat()
    time.sleep(0.01)
    duration = calculate_duration_ms(start)
    assert duration >= 0


def test_calculate_duration_ms_naive_timestamp():
    """Handles naive (timezone-unaware) ISO timestamps."""
    naive = datetime.now(UTC).replace(tzinfo=None).isoformat()
    duration = calculate_duration_ms(naive)
    assert duration >= 0


# ---------------------------------------------------------------------------
# summarize_rag_results
# ---------------------------------------------------------------------------


def test_summarize_rag_results_empty():
    assert summarize_rag_results([]) == "No RAG context retrieved."


def test_summarize_rag_results_with_results():
    results = [
        {"text": "Roofing contractor info", "score": 0.95},
        {"text": "Plumbing services", "score": 0.80},
    ]
    summary = summarize_rag_results(results)
    assert "0.95" in summary
    assert "Roofing" in summary
    assert "Plumbing" in summary


def test_summarize_rag_results_truncates_long_text():
    results = [{"text": "x" * 300, "score": 0.9}]
    summary = summarize_rag_results(results)
    # Text is truncated to 150 chars
    assert len(summary) < 300


def test_summarize_rag_results_at_most_five():
    results = [{"text": f"doc {i}", "score": 0.5} for i in range(10)]
    summary = summarize_rag_results(results)
    # Only first 5 are included
    lines = summary.strip().split("\n")
    assert len(lines) == 5
