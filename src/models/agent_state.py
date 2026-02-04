"""TypedDict definitions for agent state management in LangGraph."""

from typing import Annotated, Any, Literal

from typing_extensions import TypedDict


def merge_lists(left: list, right: list) -> list:
    """Merge two lists by appending right to left."""
    return left + right


class AgentState(TypedDict):
    """Global state shared across all agents in the LangGraph workflow."""

    # Core identifiers
    user_id: str
    building_id: str | None
    conversation_id: str

    # Messages
    messages: Annotated[list[dict[str, Any]], merge_lists]

    # Routing
    current_agent: Literal[
        "router",
        "matching",
        "pricing",
        "vetting",
        "support",
        "outreach",
        "analytics",
        "human",
    ]
    intent: str | None
    confidence: float

    # Context
    user_profile: dict[str, Any]
    building_context: dict[str, Any]
    active_offers: list[dict[str, Any]]

    # RAG results
    rag_results: list[dict[str, Any]]

    # Actions taken
    actions_taken: Annotated[list[dict[str, Any]], merge_lists]

    # Handoff
    needs_human: bool
    escalation_reason: str | None

    # Response
    final_response: dict[str, Any] | None

    # Metadata
    start_time: str
    tokens_used: int
