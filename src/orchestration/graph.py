"""LangGraph workflow orchestration for the Groupio agent system."""

import asyncio
import json
import logging
from typing import Any

from langgraph.graph import END, StateGraph

from src.agents.analytics import AnalyticsAgent
from src.agents.architecture import ArchitectureAgent
from src.agents.influencer import InfluencerAgent
from src.agents.matching import MatchingAgent
from src.agents.outreach import OutreachAgent
from src.agents.pricing import PricingAgent
from src.agents.router import RouterAgent
from src.agents.support import SupportAgent
from src.agents.vetting import VettingAgent
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.orchestration.state import (
    calculate_duration_ms,
    create_initial_state,
    summarize_rag_results,
)
from src.orchestration.state_contract import validate_agent_state
from src.rag.pipeline import get_rag_pipeline

logger = logging.getLogger(__name__)

# PERF-5+10: short-TTL context cache so repeat turns in a conversation skip
# the profile/building/offers round-trip. Kept very short because the
# orchestrator state evolves quickly (new offers, joined participants).
_CTX_CACHE_PREFIX = "orch:ctx:"
_CTX_CACHE_TTL_SECONDS = 120


async def _cache_get_ctx(user_id: str, building_id: str | None) -> dict[str, Any] | None:
    """Best-effort read of the enriched orchestration slice from Redis."""
    try:
        from src.databases.redis_client import get_redis_client

        key = f"{_CTX_CACHE_PREFIX}{user_id}:{building_id or '-'}"
        raw = await get_redis_client().get(key)
    except Exception as exc:
        logger.debug("orch ctx cache read failed: %s", exc)
        return None
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except (TypeError, ValueError):
        return None


async def _cache_set_ctx(user_id: str, building_id: str | None, ctx: dict[str, Any]) -> None:
    """Best-effort write of the enriched orchestration slice to Redis."""
    try:
        from src.databases.redis_client import get_redis_client

        key = f"{_CTX_CACHE_PREFIX}{user_id}:{building_id or '-'}"
        await get_redis_client().set(key, json.dumps(ctx, default=str), ex=_CTX_CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.debug("orch ctx cache write failed: %s", exc)


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


class GroupioOrchestrator:
    """Main orchestrator using LangGraph for multi-agent coordination.

    Routes messages through a directed graph where:
    1. Router classifies intent
    2. Specialist agent handles the request
    3. Response is formatted and returned
    """

    def __init__(self) -> None:
        self.agents: dict[str, Any] = {
            "router": RouterAgent(),
            "support": SupportAgent(),
            "matching": MatchingAgent(),
            "pricing": PricingAgent(),
            "vetting": VettingAgent(),
            "outreach": OutreachAgent(),
            "analytics": AnalyticsAgent(),
            "architecture": ArchitectureAgent(),
            "influencer": InfluencerAgent(),
        }
        # Payment agent imported lazily to avoid circular imports during Phase 3
        try:
            from src.agents.payment import PaymentAgent

            self.agents["payment"] = PaymentAgent()
        except ImportError:
            pass
        self._db = get_postgres_client()
        self._rag = get_rag_pipeline()
        self.graph = self._build_graph()

    def _run_agent_safe(self, agent_name: str):
        """Return a wrapper that runs an agent and catches exceptions; on error, set error action and return state."""

        async def _run(state: AgentState) -> AgentState:
            try:
                return await self.agents[agent_name].run(state)
            except Exception as exc:
                is_transient = isinstance(exc, (TimeoutError, ConnectionError, OSError))
                log_fn = logger.warning if is_transient else logger.exception
                log_fn(
                    "Agent %s failed (%s): %s",
                    agent_name,
                    "transient" if is_transient else "permanent",
                    exc,
                )
                err_msg = f"[{'transient' if is_transient else 'permanent'}] {str(exc)[:180]}"
                # Append single error action (reducer will merge with existing actions_taken)
                state["actions_taken"] = [
                    {
                        "agent": agent_name,
                        "action": "agent_error",
                        "details": {"error": err_msg},
                        "response": {
                            "type": "text",
                            "message": "משהו השתבש. אנא נסה שוב או פנה לתמיכה.",
                        },
                        "requires_followup": False,
                        "summary_for_next_agent": f"Agent {agent_name} failed: {err_msg}.",
                    }
                ]
                state["needs_human"] = False
                return state

        return _run

    def _build_graph(self) -> Any:
        """Build the LangGraph state machine."""
        workflow = StateGraph(AgentState)

        # Add nodes (specialists wrapped for exception handling)
        workflow.add_node("router", self._route_message)
        workflow.add_node("support", self._run_agent_safe("support"))
        workflow.add_node("matching", self._run_agent_safe("matching"))
        workflow.add_node("pricing", self._run_agent_safe("pricing"))
        workflow.add_node("vetting", self._run_agent_safe("vetting"))
        workflow.add_node("outreach", self._run_agent_safe("outreach"))
        workflow.add_node("analytics", self._run_agent_safe("analytics"))
        workflow.add_node("architecture", self._run_agent_safe("architecture"))
        workflow.add_node("influencer", self._run_agent_safe("influencer"))
        if "payment" in self.agents:
            workflow.add_node("payment", self._run_agent_safe("payment"))
        workflow.add_node("human_handoff", self._handoff_to_human)
        workflow.add_node("final_response", self._format_final_response)

        # Set entry point
        workflow.set_entry_point("router")

        # Router conditional edges
        edge_map: dict[str, str] = {
            "support": "support",
            "matching": "matching",
            "pricing": "pricing",
            "vetting": "vetting",
            "outreach": "outreach",
            "analytics": "analytics",
            "architecture": "architecture",
            "influencer": "influencer",
            "human": "human_handoff",
            "end": "final_response",
        }
        if "payment" in self.agents:
            edge_map["payment"] = "payment"
        workflow.add_conditional_edges(
            "router",
            self._determine_next_agent,
            edge_map,
        )

        # Each specialist agent can continue, end, or escalate
        specialist_agents = [
            "support",
            "matching",
            "pricing",
            "vetting",
            "outreach",
            "analytics",
            "architecture",
            "influencer",
        ]
        if "payment" in self.agents:
            specialist_agents.append("payment")
        for agent_name in specialist_agents:
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

    def _normalize_last_agent_handoff(self, last_action: dict[str, Any]) -> dict[str, Any]:
        """Build last_agent_handoff from the last actions_taken entry for router follow-up context."""
        resp = last_action.get("response") or {}
        msg = resp.get("message", "")
        return {
            "agent": last_action.get("agent"),
            "summary_for_next_agent": last_action.get("summary_for_next_agent") or "",
            "suggested_next_intent": last_action.get("suggested_next_intent") or "",
            "entities_to_pass": last_action.get("entities_to_pass") or {},
            "suggested_next_agent": last_action.get("suggested_next_agent") or "",
            "response_preview": msg[:200] if isinstance(msg, str) else "",
        }

    async def _route_message(self, state: AgentState) -> AgentState:
        """Initial routing: enrich context and classify intent."""
        # Set last_agent_handoff when re-entering after a specialist (continue)
        actions = state.get("actions_taken", [])
        if actions:
            state["last_agent_handoff"] = self._normalize_last_agent_handoff(actions[-1])
        else:
            state["last_agent_handoff"] = None

        user_id = state["user_id"]
        building_id = state.get("building_id")

        # PERF-5+10: try the short-TTL Redis slice first so repeat turns skip DB.
        cached_ctx = await _cache_get_ctx(user_id, building_id)
        if cached_ctx:
            if cached_ctx.get("user_profile") is not None:
                state["user_profile"] = cached_ctx["user_profile"]
            if cached_ctx.get("building_context") is not None:
                state["building_context"] = cached_ctx["building_context"]
            if cached_ctx.get("active_offers") is not None:
                state["active_offers"] = cached_ctx["active_offers"]
        else:
            # PERF-5: fan out profile/building in parallel; offers depends on
            # the building lookup succeeding so we await it serially after.
            async def _load_profile() -> Any:
                try:
                    return await self._db.get_user_profile(user_id)
                except Exception:
                    logger.warning("Could not load user profile for %s", user_id)
                    return None

            async def _load_building() -> Any:
                if not building_id:
                    return None
                try:
                    return await self._db.get_building(building_id)
                except Exception:
                    logger.warning("Could not load building %s", building_id)
                    return None

            profile, building = await asyncio.gather(_load_profile(), _load_building())
            if profile:
                state["user_profile"] = profile
            if building:
                state["building_context"] = building

            offers: list[dict[str, Any]] | None = None
            if building_id:
                try:
                    offers = await self._db.get_active_offers(building_id)
                    if offers is not None:
                        state["active_offers"] = offers
                except Exception:
                    offers = None

            await _cache_set_ctx(
                user_id,
                building_id,
                {
                    "user_profile": profile,
                    "building_context": building,
                    "active_offers": offers,
                },
            )

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

        # Low confidence or clarification needed (threshold from settings)
        settings = get_settings()
        if state.get("confidence", 0) < settings.ROUTER_CONFIDENCE_THRESHOLD:
            # Check if router already provided a clarification response
            actions = state.get("actions_taken", [])
            if actions and actions[-1].get("action") == "clarification_needed":
                return "end"
            return "support"

        # Optional: use suggested_next_agent for short follow-up messages or middle-band confidence
        handoff = state.get("last_agent_handoff") or {}
        suggested = (handoff.get("suggested_next_agent") or "").strip()
        if suggested and suggested in self.agents:
            user_message = ""
            for msg in reversed(state.get("messages", [])):
                if msg.get("role") == "user":
                    user_message = msg.get("content") or ""
                    break
            is_short = len(user_message.strip()) <= 30 or user_message.strip().lower() in (
                "yes",
                "no",
                "כן",
                "לא",
                "ok",
                "בסדר",
            )
            confidence = state.get("confidence", 0)
            if is_short or (0.5 <= confidence <= 0.75):
                return suggested

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
                    "message": (f"העברתי אותך לנציג אנושי שיטפל בבקשתך בהקדם. מספר פנייה: {ticket_id}"),
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
        initial_state = validate_agent_state(initial_state, context="orchestrator.run.initial")

        # Run the LangGraph workflow
        final_state = await self.graph.ainvoke(initial_state)
        final_state = validate_agent_state(final_state, context="orchestrator.run.final")

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
                "agents_used": [a.get("agent", "unknown") for a in final_state.get("actions_taken", [])],
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
