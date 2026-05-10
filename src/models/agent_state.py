"""TypedDict definitions for agent state management in LangGraph."""

from typing import Annotated, Any, Literal

from typing_extensions import NotRequired, TypedDict


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
        "architecture",
        "payment",
        "notification",
        "influencer",
    ]
    intent: str | None
    confidence: float

    # Context
    user_profile: dict[str, Any]
    building_context: dict[str, Any]
    active_offers: list[dict[str, Any]]

    # Entities (single source: building_id, offer_id, contractor_id, category)
    entities: dict[str, Any] | None

    # Inter-agent handoff (set by orchestrator from last actions_taken when re-entering router)
    last_agent_handoff: dict[str, Any] | None

    # Context for next agent (e.g. contractor_ids, offer_id set by matching/pricing)
    context_for_next_agent: dict[str, Any] | None

    # RAG results
    rag_results: list[dict[str, Any]]

    # Actions taken
    actions_taken: Annotated[list[dict[str, Any]], merge_lists]

    # Handoff
    needs_human: bool
    escalation_reason: str | None

    # Graph feature contexts (Features 1–3)
    viral_invite_chain: dict[str, Any] | None
    invite_momentum: dict[str, Any] | None
    building_similarity_clusters: list[dict[str, Any]] | None
    influencer_data: dict[str, Any] | None

    # Response
    final_response: dict[str, Any] | None

    # File upload context (set by architecture upload route, absent otherwise)
    architecture_file_id: NotRequired[str | None]

    # Metadata
    start_time: str
    tokens_used: int
    state_contract_version: int
