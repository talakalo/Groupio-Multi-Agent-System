"""LangGraph workflow orchestration for the Groupio agent system."""

import logging
from typing import Any

from langgraph.graph import END, StateGraph

from src.agents.analytics import AnalyticsAgent
from src.agents.matching import MatchingAgent
from src.agents.outreach import OutreachAgent
from src.agents.pricing import PricingAgent
from src.agents.router import RouterAgent
from src.agents.support import SupportAgent
from src.agents.vetting import VettingAgent
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.orchestration.state import (
    calculate_duration_ms,
    create_initial_state,
    summarize_rag_results,
)
from src.rag.pipeline import get_rag_pipeline

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
}


class GroupioOrchestrator:
    """Main orchestrator using LangGraph for multi-agent coordination.

    Routes messages through a directed graph where:
    1. Router classifies intent
    2. Specialist agent handles the request
    3. Response is formatted and returned
    """

    def __init__(self) -> None:
        self.agents = {
            "router": RouterAgent(),
            "support": SupportAgent(),
            "matching": MatchingAgent(),
            "pricing": PricingAgent(),
            "vetting": VettingAgent(),
            "outreach": OutreachAgent(),
            "analytics": AnalyticsAgent(),
        }
        self._db = get_postgres_client()
        self._rag = get_rag_pipeline()
        self.graph = self._build_graph()

    def _build_graph(self) -> Any:
        """Build the LangGraph state machine."""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("router", self._route_message)
        workflow.add_node("support", self.agents["support"].run)
        workflow.add_node("matching", self.agents["matching"].run)
        workflow.add_node("pricing", self.agents["pricing"].run)
        workflow.add_node("vetting", self.agents["vetting"].run)
        workflow.add_node("outreach", self.agents["outreach"].run)
        workflow.add_node("analytics", self.agents["analytics"].run)
        workflow.add_node("human_handoff", self._handoff_to_human)
        workflow.add_node("final_response", self._format_final_response)

        # Set entry point
        workflow.set_entry_point("router")

        # Router conditional edges
        workflow.add_conditional_edges(
            "router",
            self._determine_next_agent,
            {
                "support": "support",
                "matching": "matching",
                "pricing": "pricing",
                "vetting": "vetting",
                "outreach": "outreach",
                "analytics": "analytics",
                "human": "human_handoff",
                "end": "final_response",
            },
        )

        # Each specialist agent can continue, end, or escalate
        for agent_name in [
            "support",
            "matching",
            "pricing",
            "vetting",
            "outreach",
            "analytics",
        ]:
            workflow.add_conditional_edges(
                agent_name,
                self._should_continue,
                {
                    "continue": "router",
                    "end": "final_response",
                    "human": "human_handoff",
                },
            )

        # Human handoff always goes to final response
        workflow.add_edge("human_handoff", "final_response")

        # Final response ends the workflow
        workflow.add_edge("final_response", END)

        return workflow.compile()

    async def _route_message(self, state: AgentState) -> AgentState:
        """Initial routing: enrich context and classify intent."""
        user_id = state["user_id"]
        building_id = state.get("building_id")

        # Enrich with user profile
        try:
            profile = await self._db.get_user_profile(user_id)
            if profile:
                state["user_profile"] = profile
        except Exception:
            logger.warning("Could not load user profile for %s", user_id)

        # Enrich with building context
        if building_id:
            try:
                building = await self._db.get_building(building_id)
                if building:
                    state["building_context"] = building
            except Exception:
                logger.warning("Could not load building %s", building_id)

            # Load active offers
            try:
                offers = await self._db.get_active_offers(building_id)
                state["active_offers"] = offers
            except Exception:
                pass

        # Run router agent
        state = await self.agents["router"].run(state)

        # Pre-fetch RAG context based on classified intent
        if state.get("intent") and state["intent"] != "unknown":
            user_message = ""
            for msg in reversed(state.get("messages", [])):
                if msg.get("role") == "user":
                    user_message = msg.get("content", "")
                    break

            if user_message:
                try:
                    rag_results = await self._get_relevant_context(
                        query=user_message,
                        intent=state["intent"],
                    )
                    state["rag_results"] = rag_results
                except Exception:
                    logger.warning("RAG pre-fetch failed")

        return state

    def _determine_next_agent(self, state: AgentState) -> str:
        """Determine which agent should handle this request."""
        # Immediate escalation check
        if state.get("needs_human"):
            return "human"

        # Low confidence or clarification needed
        if state.get("confidence", 0) < 0.7:
            # Check if router already provided a clarification response
            actions = state.get("actions_taken", [])
            if actions and actions[-1].get("action") == "clarification_needed":
                return "end"
            return "support"

        # Route based on intent
        intent = state.get("intent", "general_info")
        agent = INTENT_AGENT_MAP.get(intent, "support")

        # Validate the agent exists
        if agent not in self.agents:
            logger.warning("Unknown agent %s, defaulting to support", agent)
            return "support"

        return agent

    def _should_continue(self, state: AgentState) -> str:
        """Decide if workflow should continue, end, or escalate."""
        # Check escalation
        if state.get("needs_human"):
            return "human"

        # Check if agent needs follow-up from another agent
        actions = state.get("actions_taken", [])
        if actions:
            last_action = actions[-1]
            if last_action.get("requires_followup"):
                return "continue"

        return "end"

    async def _handoff_to_human(self, state: AgentState) -> AgentState:
        """Create a human handoff ticket."""
        try:
            ticket_data = {
                "user_id": state["user_id"],
                "conversation_id": state["conversation_id"],
                "reason": state.get("escalation_reason", "Agent requested human review"),
                "priority": ("high" if "complaint" in (state.get("intent") or "") else "normal"),
                "context": {
                    "intent": state.get("intent"),
                    "actions_taken": [
                        {
                            "agent": a.get("agent"),
                            "action": a.get("action"),
                        }
                        for a in state.get("actions_taken", [])
                    ],
                    "rag_summary": summarize_rag_results(state.get("rag_results", [])),
                },
            }

            ticket = await self._db.create_support_ticket(ticket_data)
            ticket_id = ticket.get("id", "unknown")
        except Exception:
            logger.exception("Failed to create support ticket")
            ticket_id = "error"

        state["actions_taken"] = [
            {
                "agent": "orchestrator",
                "action": "escalated_to_human",
                "details": {"ticket_id": ticket_id},
                "response": {
                    "type": "handoff",
                    "message": (
                        f"העברתי אותך לנציג אנושי שיטפל בבקשתך בהקדם. מספר פנייה: {ticket_id}"
                    ),
                },
                "requires_followup": False,
            }
        ]

        return state

    async def _format_final_response(self, state: AgentState) -> AgentState:
        """Format the final response to the user."""
        if state.get("needs_human"):
            actions = state.get("actions_taken", [])
            last = actions[-1] if actions else {}
            state["final_response"] = last.get(
                "response",
                {
                    "type": "handoff",
                    "message": "מעביר אותך לנציג. אנא המתן.",
                },
            )
        else:
            actions = state.get("actions_taken", [])
            if actions:
                last = actions[-1]
                state["final_response"] = last.get(
                    "response",
                    {
                        "type": "text",
                        "message": "",
                    },
                )
            else:
                state["final_response"] = {
                    "type": "text",
                    "message": "לא הצלחתי לעבד את הבקשה. אנא נסה שוב.",
                }

        return state

    async def _get_relevant_context(self, query: str, intent: str) -> list[dict[str, Any]]:
        """Pre-fetch RAG context based on intent."""
        namespace_map = {
            "contractor_search": "contractors",
            "pricing_question": "knowledge_base",
            "technical_support": "knowledge_base",
            "general_info": "knowledge_base",
            "complaint": "conversations",
        }

        namespace = namespace_map.get(intent, "knowledge_base")
        return await self._rag.retrieve(
            query=query,
            namespace=namespace,
            top_k=5,
            strategy="semantic",
            rerank=False,
        )

    async def run(
        self,
        user_message: str,
        user_id: str,
        building_id: str | None = None,
        conversation_id: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Main entry point to run the agent system.

        Args:
            user_message: The user's input message.
            user_id: Unique user identifier.
            building_id: Optional building identifier.
            conversation_id: Optional existing conversation ID.

        Returns:
            Dict with response, metadata, and conversation_id.
        """
        initial_state = create_initial_state(
            user_message=user_message,
            user_id=user_id,
            building_id=building_id,
            conversation_id=conversation_id,
        )

        # Run the LangGraph workflow
        final_state = await self.graph.ainvoke(initial_state)

        return {
            "conversation_id": final_state["conversation_id"],
            "response": final_state.get(
                "final_response",
                {
                    "type": "error",
                    "message": "No response generated.",
                },
            ),
            "metadata": {
                "intent": final_state.get("intent"),
                "confidence": final_state.get("confidence", 0),
                "agents_used": [
                    a.get("agent", "unknown") for a in final_state.get("actions_taken", [])
                ],
                "tokens_used": final_state.get("tokens_used", 0),
                "duration_ms": calculate_duration_ms(final_state["start_time"]),
                "needs_human": final_state.get("needs_human", False),
            },
        }


_orchestrator: GroupioOrchestrator | None = None


def get_orchestrator() -> GroupioOrchestrator:
    """Get or create the singleton GroupioOrchestrator."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = GroupioOrchestrator()
    return _orchestrator
