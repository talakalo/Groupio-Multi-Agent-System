"""Support Agent for conversational customer support."""

import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.support import SUPPORT_SYSTEM_PROMPT
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.models.agent_state import AgentState
from src.utils.hebrew_utils import detect_language, detect_legal_keywords
from src.utils.monitoring import track_agent_execution, track_escalation

logger = logging.getLogger(__name__)

# RAG strategy by sub-intent
RAG_STRATEGY_MAP = {
    "order_status": {
        "sources": ["sql"],
    },
    "pricing_question": {
        "sources": ["vector", "sql"],
        "vector_namespace": "knowledge_base",
        "vector_filters": {"doc_type": "pricing_guide"},
    },
    "contractor_question": {
        "sources": ["vector", "graph"],
        "vector_namespace": "contractors",
    },
    "technical_support": {
        "sources": ["vector"],
        "vector_namespace": "knowledge_base",
        "vector_filters": {"doc_type": "installation_guide"},
    },
    "complaint": {
        "sources": ["vector"],
        "vector_namespace": "conversations",
        "vector_filters": {"outcome": "resolved"},
        "check_escalation": True,
    },
    "general_info": {
        "sources": ["vector"],
        "vector_namespace": "knowledge_base",
    },
}


class ConversationMemory:
    """Manage short-term and long-term conversation context."""

    def __init__(self) -> None:
        self._redis = get_redis_client()

    async def get_context(self, user_id: str) -> list[dict]:
        """Get recent conversation history."""
        return await self._redis.get_conversation_context(user_id)

    async def add_message(self, user_id: str, message: dict) -> None:
        """Add message to conversation history."""
        await self._redis.add_conversation_message(user_id, message)


class SupportAgent(BaseAgent):
    """Conversational customer support agent.

    Handles FAQs, order status, complaints, and general inquiries
    using RAG-powered responses with intent-based retrieval strategies.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="support",
            description="Customer support with RAG-powered responses",
            system_prompt=SUPPORT_SYSTEM_PROMPT,
            tools=[
                "vector_search",
                "sql_query",
                "get_order_status",
                "escalate_to_human",
            ],
            rag_enabled=True,
            temperature=0.7,
            max_tokens=2000,
        )
        super().__init__(config)
        self._db = get_postgres_client()
        self._memory = ConversationMemory()

    @track_agent_execution("support")
    async def _run_impl(self, state: AgentState) -> AgentState:
        """Handle support request with intent-based RAG."""
        user_message = self._get_last_user_message(state)
        user_id = state["user_id"]
        intent = state.get("intent", "general_info")

        # Check for escalation triggers first
        if await self._should_escalate(state, user_message):
            return await self._escalate(state, user_message)

        # Get conversation history
        conv_history = await self._memory.get_context(user_id)

        # Retrieve context based on intent
        context = await self._retrieve_for_intent(
            intent=intent,
            user_message=user_message,
            state=state,
        )
        state["rag_results"] = context

        # For order status, also fetch order data
        order_data = None
        if intent == "order_status":
            order_data = await self._get_order_data(user_id)

        # Generate response via LLM
        response = await self._generate_response(
            state=state,
            user_message=user_message,
            context=context,
            conv_history=conv_history,
            order_data=order_data,
        )

        # Save to conversation memory
        await self._memory.add_message(
            user_id,
            {"role": "user", "content": user_message},
        )
        await self._memory.add_message(
            user_id,
            {"role": "assistant", "content": response},
        )

        state["actions_taken"] = [
            {
                "agent": "support",
                "action": "support_response",
                "details": {"intent": intent},
                "response": {
                    "type": "support",
                    "message": response,
                },
                "requires_followup": False,
                "summary_for_next_agent": f"Answered support request (intent: {intent}).",
            }
        ]

        self._metrics["calls"] += 1
        return state

    async def _retrieve_for_intent(
        self,
        intent: str,
        user_message: str,
        state: AgentState,
    ) -> list[dict[str, Any]]:
        """Retrieve context based on intent using the strategy map."""
        strategy = RAG_STRATEGY_MAP.get(intent, RAG_STRATEGY_MAP["general_info"])
        all_results: list[dict[str, Any]] = []

        if "vector" in strategy.get("sources", []):
            namespace = strategy.get("vector_namespace", "knowledge_base")
            filters = strategy.get("vector_filters")
            results = await self._retrieve_context(
                query=user_message,
                namespace=namespace,
                filters=filters,
                top_k=10,
                strategy="contextual" if intent == "complaint" else "semantic",
            )
            all_results.extend(results)

        return all_results

    async def _get_order_data(self, user_id: str) -> list[dict[str, Any]] | None:
        """Fetch order data for order status inquiries."""
        try:
            return await self._db.get_user_orders(user_id, limit=5)
        except Exception:
            logger.exception("Failed to get order data")
            return None

    async def _should_escalate(self, state: AgentState, user_message: str) -> bool:
        """Check if the conversation should be escalated to a human."""
        # Legal keywords
        if detect_legal_keywords(user_message):
            return True

        # High-value user with complaint
        user_profile = state.get("user_profile", {})
        if state.get("intent") == "complaint" and user_profile.get("user_value") == "high":
            return True

        # Sentiment check (threshold configurable via settings)
        settings = get_settings()
        try:
            sentiment = await self.llm_client.analyze_sentiment(user_message)
            if sentiment < settings.SENTIMENT_ESCALATION_THRESHOLD:
                return True
        except Exception:
            pass

        # Too many resolution attempts (threshold configurable via settings)
        actions = state.get("actions_taken", [])
        support_attempts = sum(1 for a in actions if a.get("agent") == "support")
        if support_attempts >= settings.MAX_SUPPORT_ATTEMPTS_BEFORE_ESCALATION:
            return True

        return False

    async def _escalate(self, state: AgentState, user_message: str) -> AgentState:
        """Escalate conversation to human agent."""
        state["needs_human"] = True

        # Determine reason
        reasons = []
        if detect_legal_keywords(user_message):
            reasons.append("legal_keywords_detected")
        if state.get("intent") == "complaint":
            reasons.append("complaint")

        reason = ", ".join(reasons) if reasons else "agent_escalation"
        state["escalation_reason"] = reason

        track_escalation(reason)

        lang = detect_language(user_message)
        if lang == "he":
            msg = "אני מעביר אותך לנציג אנושי שיוכל לטפל בבקשתך. אנא המתן ונציג יצור איתך קשר בהקדם."
        else:
            msg = (
                "I'm transferring you to a human agent who can help. Please wait and someone will contact you shortly."
            )

        state["actions_taken"] = [
            {
                "agent": "support",
                "action": "escalated_to_human",
                "details": {"reason": reason},
                "response": {
                    "type": "escalation",
                    "message": msg,
                },
                "requires_followup": False,
                "summary_for_next_agent": f"Escalated to human: {reason}.",
            }
        ]

        return state

    async def _generate_response(
        self,
        state: AgentState,
        user_message: str,
        context: list[dict[str, Any]],
        conv_history: list[dict],
        order_data: list[dict[str, Any]] | None = None,
    ) -> str:
        """Generate support response using LLM with retrieved context."""
        # Build system prompt with context
        system_prompt = self._build_system_prompt(state)
        if context and self.rag is not None:
            system_prompt = await self.rag.augment_prompt(
                query=user_message,
                context_docs=context,
                system_prompt=system_prompt,
            )

        # Build messages with conversation history
        messages: list[dict[str, Any]] = []
        for msg in conv_history[-6:]:
            messages.append(msg)

        # Add order data if available
        user_content = user_message
        if order_data:
            orders_text = "\n".join(
                f"- Order {o.get('id', 'N/A')}: "
                f"Status={o.get('status', 'N/A')}, "
                f"Contractor={o.get('contractors', {}).get('business_name', 'N/A')}"
                for o in order_data[:5]
            )
            user_content = f"{user_message}\n\n[Order Data]:\n{orders_text}"

        messages.append({"role": "user", "content": user_content})

        response = await self._call_llm(
            messages=messages,
            system=system_prompt,
        )

        content = response.get("content", [])
        return content[0].get("text", "") if content else ""
