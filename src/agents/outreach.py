"""Outreach Agent for proactive engagement campaigns."""

import hashlib
import logging
from datetime import datetime
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.outreach import OUTREACH_SYSTEM_PROMPT
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Campaign definitions
CAMPAIGNS = {
    "new_building_onboarding": {
        "trigger": "new_building_registered",
        "target": "all_residents_in_building",
        "sequence": [
            {"delay_days": 0, "action": "send_welcome_message", "channel": "whatsapp"},
            {"delay_days": 2, "action": "send_value_proposition", "channel": "email"},
            {"delay_days": 5, "action": "highlight_first_offers", "channel": "whatsapp"},
            {"delay_days": 10, "action": "neighbor_joined_notification", "channel": "push"},
        ],
    },
    "offer_momentum": {
        "trigger": "offer_near_tier_threshold",
        "target": "residents_viewing_offer",
        "template_he": (
            "היי {name}!\n\n"
            "ההצעה ל{category} בבניין שלך כמעט הגיעה לרמת ההנחה הבאה!\n"
            "עוד {needed} שכנים ותקבלו {discount}% הנחה.\n\n"
            "המחיר ירד מ-₪{current_price} ל-₪{next_tier_price}!\n\n"
            "רוצה לעזור לנו להגיע? שתף עם השכנים"
        ),
    },
    "contractor_reactivation": {
        "trigger": "contractor_inactive_30_days",
        "target": "inactive_contractor",
        "template_he": (
            "היי {contractor_name},\n\n"
            "מזמן לא שמענו ממך!\n\n"
            "יש כרגע {active_requests} בקשות פתוחות באזור שלך עבור {categories}.\n\n"
            "האם תרצה לראות את ההזדמנויות?"
        ),
    },
    "seasonal_campaign": {
        "trigger": "scheduled_seasonal",
        "campaigns": {
            "summer_ac": {
                "active_months": [5, 6, 7],
                "category": "ac_installation",
                "message_he": "הקיץ בפתח! כדאי להיערך עכשיו למזגנים בהנחה קבוצתית",
            },
            "winter_heating": {
                "active_months": [11, 12, 1],
                "category": "heating",
                "message_he": "החורף מגיע - זמן לחימום משתלם לכל הבניין",
            },
        },
    },
}


class ABTestManager:
    """Manage A/B tests for outreach campaigns."""

    def __init__(self) -> None:
        self._redis = get_redis_client()

    async def assign_variant(
        self, campaign_id: str, user_id: str, variants: dict[str, int] | None = None
    ) -> str:
        """Assign user to a test variant using hash-based assignment."""
        if not variants:
            return "control"

        hash_val = int(
            hashlib.md5(f"{campaign_id}:{user_id}".encode()).hexdigest(), 16
        )
        variant_num = hash_val % 100

        cumulative = 0
        for variant, weight in variants.items():
            cumulative += weight
            if variant_num < cumulative:
                return variant

        return "control"

    async def track_conversion(
        self,
        campaign_id: str,
        variant: str,
        outcome: str,
    ) -> None:
        """Track campaign conversion."""
        await self._redis.ab_test_track(campaign_id, variant, outcome)

    async def get_results(
        self, campaign_id: str, variant: str
    ) -> dict[str, int]:
        """Get A/B test results."""
        return await self._redis.ab_test_get_results(campaign_id, variant)


class OutreachAgent(BaseAgent):
    """Proactive engagement campaign agent.

    Manages welcome sequences, offer momentum pushes,
    contractor reactivation, and seasonal campaigns.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="outreach",
            description="Proactive engagement campaigns",
            system_prompt=OUTREACH_SYSTEM_PROMPT,
            tools=[
                "vector_search",
                "sql_query",
                "send_whatsapp",
                "send_email",
                "schedule_message",
            ],
            rag_enabled=True,
            temperature=0.7,
            max_tokens=1500,
        )
        super().__init__(config)
        self._db = get_postgres_client()
        self._ab_test = ABTestManager()

    @track_agent_execution("outreach")
    async def run(self, state: AgentState) -> AgentState:
        """Execute outreach campaign logic."""
        user_message = self._get_last_user_message(state)

        # Determine campaign type from context
        campaign_type = self._determine_campaign_type(state)
        campaign_config = CAMPAIGNS.get(campaign_type, {})

        if not campaign_config:
            state["actions_taken"] = [
                {
                    "agent": "outreach",
                    "action": "no_campaign",
                    "response": {
                        "type": "info",
                        "message": "No active campaign for this context.",
                    },
                    "requires_followup": False,
                }
            ]
            return state

        # Get user preferences for personalization
        user_profile = state.get("user_profile", {})

        # Generate personalized message
        personalized = await self._personalize_message(
            campaign_type=campaign_type,
            campaign_config=campaign_config,
            user_profile=user_profile,
            state=state,
        )

        # A/B test assignment
        variant = await self._ab_test.assign_variant(
            campaign_id=campaign_type,
            user_id=state["user_id"],
            variants={"control": 50, "variant_a": 50},
        )

        state["actions_taken"] = [
            {
                "agent": "outreach",
                "action": "campaign_generated",
                "details": {
                    "campaign_type": campaign_type,
                    "variant": variant,
                },
                "response": {
                    "type": "outreach",
                    "message": personalized,
                    "campaign_type": campaign_type,
                    "variant": variant,
                },
                "requires_followup": False,
            }
        ]

        self._metrics["calls"] += 1
        return state

    async def _personalize_message(
        self,
        campaign_type: str,
        campaign_config: dict[str, Any],
        user_profile: dict[str, Any],
        state: AgentState,
    ) -> str:
        """Personalize campaign message using RAG and LLM."""
        # Get user interaction history for personalization
        user_context = await self._retrieve_context(
            query=f"user {state['user_id']} preferences interactions",
            namespace="conversations",
            top_k=10,
            strategy="contextual",
        )

        # Get appropriate template
        template = campaign_config.get("template_he", "")
        if not template:
            # For campaigns with sequences, use the first action
            sequence = campaign_config.get("sequence", [])
            if sequence:
                template = f"Campaign: {campaign_type}, Step: {sequence[0].get('action', '')}"

        # Use LLM to personalize
        response = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Personalize this campaign message for the user.\n\n"
                        f"Template: {template}\n\n"
                        f"User Profile: {user_profile}\n\n"
                        f"User History Context: "
                        f"{[c.get('text', '')[:100] for c in user_context[:3]]}\n\n"
                        f"Building Context: {state.get('building_context', {})}\n\n"
                        f"Active Offers: {state.get('active_offers', [])}\n\n"
                        f"Return a personalized message in Hebrew. "
                        f"Fill in any template variables with appropriate values."
                    ),
                }
            ],
            system=self.config.system_prompt,
        )

        content = response.get("content", [])
        return content[0].get("text", "") if content else template

    def _determine_campaign_type(self, state: AgentState) -> str:
        """Determine which campaign type to run based on context."""
        intent = state.get("intent", "")

        # Check if there's an explicit campaign request
        user_message = self._get_last_user_message(state)
        if "momentum" in user_message.lower() or "offer" in user_message.lower():
            return "offer_momentum"

        # Check for seasonal relevance
        month = datetime.now().month
        seasonal = CAMPAIGNS["seasonal_campaign"]["campaigns"]
        for name, config in seasonal.items():
            if month in config.get("active_months", []):
                return "seasonal_campaign"

        # Default based on user context
        user_profile = state.get("user_profile", {})
        if user_profile.get("past_interactions_count", 0) == 0:
            return "new_building_onboarding"

        return "offer_momentum"
