"""State management utilities for the LangGraph orchestration."""

from datetime import datetime, timezone
from typing import Any

from src.models.agent_state import AgentState
from src.utils.monitoring import generate_conversation_id


def _utcnow() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(UTC)


def create_initial_state(
    user_message: str,
    user_id: str,
    building_id: str | None = None,
    conversation_id: str | None = None,
) -> AgentState:
    """Create the initial state for a new agent workflow invocation."""
    return AgentState(
        user_id=user_id,
        building_id=building_id,
        conversation_id=conversation_id or generate_conversation_id(),
        messages=[{"role": "user", "content": user_message}],
        current_agent="router",
        intent=None,
        confidence=0.0,
        user_profile={},
        building_context={},
        active_offers=[],
        entities=None,
        last_agent_handoff=None,
        context_for_next_agent=None,
        rag_results=[],
        actions_taken=[],
        needs_human=False,
        escalation_reason=None,
        final_response=None,
        start_time=datetime.now(timezone.utc).isoformat(),
        tokens_used=0,
    )


def calculate_duration_ms(start_time: str) -> int:
    """Calculate duration in milliseconds from ISO timestamp."""
    start = datetime.fromisoformat(start_time)
    duration = datetime.now(timezone.utc) - start
    return int(duration.total_seconds() * 1000)


def summarize_rag_results(results: list[dict[str, Any]]) -> str:
    """Summarize RAG results for human handoff context."""
    if not results:
        return "No RAG context retrieved."

    summaries = []
    for r in results[:5]:
        text = r.get("text", "")[:150]
        score = r.get("score", 0)
        summaries.append(f"[score={score:.2f}] {text}")

    return "\n".join(summaries)
