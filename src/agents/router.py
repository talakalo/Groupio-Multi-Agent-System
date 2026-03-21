"""Router Agent for intent classification and routing."""

import logging

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.router import ROUTER_SYSTEM_PROMPT
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Intent-to-agent mapping
INTENT_AGENT_MAP = {
    "contractor_search": "matching",
    "pricing_question": "pricing",
    "order_status": "support",
    "complaint": "support",
    "contractor_verification": "vetting",
    "analytics_query": "analytics",
    "general_info": "support",
    "technical_support": "support",
    "architecture_analysis": "architecture",
    "payment_query": "payment",
    # Graph-powered GMV features
    "viral_invite_query": "outreach",
    "building_social_proof": "pricing",
    "influencer_campaign": "influencer",
}

VALID_AGENTS = frozenset(INTENT_AGENT_MAP.values())


class RouterAgent(BaseAgent):
    """Intent classification and routing agent.

    Analyzes incoming messages to determine user intent, extract entities,
    and route to the appropriate specialist agent.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="router",
            description="Classify user intent and route to specialist agents",
            system_prompt=ROUTER_SYSTEM_PROMPT,
            tools=[],
            rag_enabled=False,
            temperature=0.3,
            max_tokens=500,
        )
        super().__init__(config)

    @track_agent_execution("router")
    async def run(self, state: AgentState) -> AgentState:
        """Classify intent and determine routing."""
        user_message = self._get_last_user_message(state)

        if not user_message:
            state["intent"] = "general_info"
            state["confidence"] = 0.0
            state["current_agent"] = "support"
            state["entities"] = state.get("entities") or {}
            return state

        # Build context-aware system prompt
        system_prompt = self._build_system_prompt(state)

        # Inject last_agent_handoff for follow-up routing
        handoff = state.get("last_agent_handoff")
        if handoff and (handoff.get("summary_for_next_agent") or handoff.get("suggested_next_intent")):
            system_prompt += (
                "\n\n[Follow-up context] The previous agent ({agent}) reported: {summary} "
                "Suggested next intent: {suggested_next_intent}. "
                "Route to the suggested intent/agent when the user message is a clear follow-up."
            ).format(
                agent=handoff.get("agent") or "unknown",
                summary=handoff.get("summary_for_next_agent") or "(no summary)",
                suggested_next_intent=handoff.get("suggested_next_intent") or "none",
            )

        # Call LLM for intent classification
        result = await self._call_llm_structured(
            messages=[{"role": "user", "content": user_message}],
            system=system_prompt,
            output_schema={
                "intent": "string",
                "entities": {
                    "category": "string or null",
                    "building_id": "string or null",
                    "contractor_id": "string or null",
                    "offer_id": "string or null",
                },
                "confidence": "float between 0 and 1",
                "clarifying_question": "string or null",
                "suggested_agent": "string",
            },
        )

        # Handle parse errors: default to support and optional clarification
        if result.get("parse_error"):
            logger.warning("Router parse error, defaulting to support")
            state["intent"] = "general_info"
            state["confidence"] = 0.5
            state["current_agent"] = "support"
            state["entities"] = {}
            state["actions_taken"] = [
                {
                    "agent": "router",
                    "action": "clarification_needed",
                    "response": {
                        "type": "text",
                        "message": "לא הבנתי את הבקשה. נסה לנסח שוב או לפרט יותר.",
                    },
                    "requires_followup": False,
                }
            ]
            self._metrics["calls"] += 1
            return state

        # Validate and clamp intent
        intent = result.get("intent") or "general_info"
        state["intent"] = intent if intent in INTENT_AGENT_MAP else "general_info"

        # Clamp confidence to [0.0, 1.0]
        try:
            raw_conf = float(result.get("confidence", 0.5))
            state["confidence"] = max(0.0, min(1.0, raw_conf))
        except (TypeError, ValueError):
            state["confidence"] = 0.5

        # Validate suggested_agent: must be a known specialist
        suggested = (result.get("suggested_agent") or "").strip().lower()
        if suggested not in VALID_AGENTS:
            suggested = "support"

        # Determine agent from intent map, fallback to validated suggested_agent
        state["current_agent"] = INTENT_AGENT_MAP.get(state["intent"], suggested)

        # If low confidence, add clarifying question as assistant message
        if state["confidence"] < 0.7 and result.get("clarifying_question"):
            state["actions_taken"] = [
                {
                    "agent": "router",
                    "action": "clarification_needed",
                    "response": {
                        "type": "clarification",
                        "message": result["clarifying_question"],
                    },
                    "requires_followup": False,
                }
            ]
            state["current_agent"] = "support"

        # Store extracted entities in state (single source of truth)
        entities = result.get("entities") or {}
        entities = {k: v for k, v in entities.items() if v is not None and v != ""}
        state["entities"] = entities
        if entities.get("building_id") and not state.get("building_id"):
            state["building_id"] = entities["building_id"]

        logger.info(
            "Router: intent=%s confidence=%.2f agent=%s",
            state["intent"],
            state["confidence"],
            state["current_agent"],
        )

        self._metrics["calls"] += 1
        return state
