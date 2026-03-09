"""Pricing Agent for dynamic tiered pricing and market analysis."""

import logging
from datetime import datetime
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.pricing import PRICING_SYSTEM_PROMPT
from src.config.settings import get_settings
from src.databases.graph_store import get_graph_store
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.models.offer import SEASONALITY_FACTORS
from src.utils.hebrew_utils import translate_category
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Tier definitions
DEFAULT_TIERS = [
    {"min": 3, "max": 5, "discount": 0.05},
    {"min": 6, "max": 10, "discount": 0.10},
    {"min": 11, "max": 20, "discount": 0.15},
    {"min": 21, "max": None, "discount": 0.20},
]


class PricingAgent(BaseAgent):
    """Dynamic tiered pricing with market intelligence.

    Analyzes market data, creates tier structures, validates
    pricing fairness, and flags anomalies.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="pricing",
            description="Dynamic pricing and market analysis",
            system_prompt=PRICING_SYSTEM_PROMPT,
            tools=["vector_search", "sql_query", "calculate_tiers"],
            rag_enabled=True,
            temperature=0.3,
            max_tokens=2000,
        )
        super().__init__(config)
        self._db = get_postgres_client()
        # Store context for prompt building
        self._current_market_data: dict[str, Any] = {}
        self._current_category: str = ""

    def _build_system_prompt(self, state: AgentState) -> str:
        """Build the system prompt with pricing-specific context."""
        return self.config.system_prompt.format(
            market_data=self._current_market_data,
            building_context=state.get("building_context", {}),
            category=self._current_category,
            rag_context=state.get("rag_results", []),
        )

    @track_agent_execution("pricing")
    async def run(self, state: AgentState) -> AgentState:
        """Analyze pricing and generate tier recommendations."""
        user_message = self._get_last_user_message(state)
        context_next = state.get("context_for_next_agent") or {}
        entities = state.get("entities") or {}
        building_context = state.get("building_context", {})
        region = building_context.get("region", "center")
        category = context_next.get("category") or entities.get("category") or self._extract_category(state)

        # Step 1: Retrieve pricing guides from knowledge base
        pricing_context = await self._retrieve_context(
            query=f"pricing guide {category} {region}",
            namespace="knowledge_base",
            filters={"doc_type": "pricing_guide"},
            top_k=5,
            strategy="semantic",
        )
        state["rag_results"] = pricing_context

        # Step 2: Get market data from database
        market_data = await self._get_market_data(category, region)

        # Step 3: Calculate tiered pricing
        base_price = market_data.get("avg_price", 0)
        tiers = self._calculate_tiers(base_price, market_data, category)

        # Step 4: Apply seasonal adjustments
        tiers = self._apply_seasonal_adjustments(tiers, category)

        # Store context for prompt building
        self._current_market_data = market_data
        self._current_category = category

        # Step 4b: Fetch building similarity clusters for social proof
        building_id = building_context.get("id") or state.get("building_id")
        similarity_clusters: list[dict[str, Any]] = []
        if building_id:
            try:
                graph = get_graph_store()
                similarity_clusters = await graph.get_building_similarity_clusters(
                    building_id=building_id,
                    category=category,
                    limit=10,
                )
                state["building_similarity_clusters"] = similarity_clusters
            except Exception:
                logger.warning("Failed to fetch building similarity clusters")

        # Step 5: Generate pricing analysis via LLM
        response = await self._generate_pricing_response(
            state=state,
            user_message=user_message,
            category=category,
            market_data=market_data,
            tiers=tiers,
            pricing_context=pricing_context,
            similarity_clusters=similarity_clusters,
        )

        offer_id = entities.get("offer_id") or context_next.get("offer_id")
        # Merge pricing entities into state for downstream agents
        state["entities"] = {
            **(state.get("entities") or {}),
            "category": category,
            "offer_id": offer_id,
        }
        state["context_for_next_agent"] = {
            "category": category,
            "region": region,
            "offer_id": offer_id,
            "base_price": base_price,
            "tiers_summary": [
                {
                    "min": t.get("min_participants"),
                    "max": t.get("max_participants"),
                    "discount": t.get("discount_percent"),
                }
                for t in tiers
            ],
        }
        state["actions_taken"] = [
            {
                "agent": "pricing",
                "action": "pricing_analyzed",
                "details": {
                    "category": category,
                    "region": region,
                    "market_data": market_data,
                    "tiers": tiers,
                },
                "response": {
                    "type": "pricing_analysis",
                    "message": response,
                },
                "requires_followup": True,
                "summary_for_next_agent": (
                    f"Provided tiered pricing for {translate_category(category, 'en')} in {region}; "
                    f"base price {base_price}, {len(tiers)} tiers."
                ),
                "entities_to_pass": {
                    "category": category,
                    "offer_id": offer_id,
                },
                "suggested_next_intent": "payment_query",
                "suggested_next_agent": "payment",
            }
        ]

        # Task 3.4 — Generate a Hebrew pricing rationale and persist to DB
        offer_id_for_rationale = entities.get("offer_id") or context_next.get("offer_id")
        city = region
        participants_count = int(market_data.get("avg_participants", 1)) or 1
        if offer_id_for_rationale and base_price > 0:
            try:
                rationale_resp = await self._call_llm(
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                f"Explain in one Hebrew sentence why this price (₪{round(base_price, 0):.0f}) "
                                f"is fair for {category} service for {participants_count} participants in {city}."
                            ),
                        }
                    ],
                    system="You are a helpful pricing assistant. Reply only in Hebrew, one sentence.",
                )
                rationale_content = rationale_resp.get("content", [])
                rationale_text = rationale_content[0].get("text", "") if rationale_content else ""
                if rationale_text:
                    await self._db.update_offer(offer_id_for_rationale, {"pricing_rationale": rationale_text[:500]})
            except Exception:
                logger.warning("Failed to generate/store pricing rationale")

        # Task 3.1 — Autonomy mode: in recommend mode, flag for human confirmation
        settings = get_settings()
        if settings.PRICING_AGENT_MODE in ("recommend", "gated"):
            state["needs_human"] = True
            state["escalation_reason"] = (
                f"Pricing results require admin confirmation (mode={settings.PRICING_AGENT_MODE})"
            )
            if state["actions_taken"]:
                state["actions_taken"][-1]["requires_human_confirmation"] = True

        self._metrics["calls"] += 1
        return state

    async def _get_market_data(self, category: str, region: str) -> dict[str, Any]:
        """Fetch market pricing data from the database."""
        try:
            return await self._db.get_market_data(category, region)
        except Exception:
            logger.exception("Failed to get market data")
            return {
                "avg_price": 0,
                "median_price": 0,
                "min_price": 0,
                "max_price": 0,
                "price_stddev": 0,
                "avg_participants": 0,
                "sample_size": 0,
            }

    def _calculate_tiers(
        self,
        base_price: float,
        market_data: dict[str, Any],
        category: str,
    ) -> list[dict[str, Any]]:
        """Create tiered pricing structure with quality safeguards."""
        if base_price <= 0:
            return []

        min_price = market_data.get("min_price", base_price * 0.7)
        avg_price = market_data.get("avg_price", base_price)

        results: list[dict[str, Any]] = []
        flags: list[str] = []

        for tier in DEFAULT_TIERS:
            tier_price = base_price * (1 - tier["discount"])

            # Quality check: don't go below 80% of market minimum
            if min_price > 0 and tier_price < min_price * 0.8:
                flags.append(f"Tier {tier['min']}-{tier['max'] or '+'}: price too low - quality risk")
                tier_price = min_price * 0.8

            # Market positioning check
            if avg_price > 0 and tier_price > avg_price * 1.3:
                flags.append(f"Tier {tier['min']}-{tier['max'] or '+'}: above market average")

            market_position = tier_price / avg_price if avg_price > 0 else 1.0

            results.append(
                {
                    "min_participants": tier["min"],
                    "max_participants": tier["max"],
                    "discount_percent": tier["discount"] * 100,
                    "price": round(tier_price, 2),
                    "market_position": round(market_position, 2),
                    "flags": flags,
                }
            )

        return results

    def _apply_seasonal_adjustments(
        self,
        tiers: list[dict[str, Any]],
        category: str,
    ) -> list[dict[str, Any]]:
        """Apply seasonal pricing factors to tiers."""
        season = self._get_current_season()
        factors = SEASONALITY_FACTORS.get(category, {})
        factor = factors.get(season, 1.0)

        if factor == 1.0:
            return tiers

        for tier in tiers:
            original = tier["price"]
            tier["price"] = round(original * factor, 2)
            tier["seasonal_factor"] = factor
            tier["season"] = season

        return tiers

    @staticmethod
    def _get_current_season() -> str:
        """Determine current season based on month."""
        month = datetime.now().month
        if month in (3, 4, 5):
            return "spring"
        elif month in (6, 7, 8):
            return "summer"
        elif month in (9, 10, 11):
            return "fall"
        else:
            return "winter"

    async def _generate_pricing_response(
        self,
        state: AgentState,
        user_message: str,
        category: str,
        market_data: dict[str, Any],
        tiers: list[dict[str, Any]],
        pricing_context: list[dict[str, Any]],
        similarity_clusters: list[dict[str, Any]] | None = None,
    ) -> str:
        """Generate pricing analysis response via LLM."""
        context_text = "\n".join(doc.get("text", "")[:300] for doc in pricing_context[:3])

        # Build social proof text from similarity clusters
        social_proof_text = ""
        if similarity_clusters:
            total_buildings = len(similarity_clusters)
            total_residents = sum(c.get("residents_joined", 0) for c in similarity_clusters)
            social_proof_text = (
                f"\nSocial Proof: {total_buildings} similar buildings in the area have joined "
                f"{category} deals with {total_residents} total residents participating."
            )

        tiers_text = "\n".join(
            f"- {t['min_participants']}-{t.get('max_participants') or '+'} units: "
            f"{t['discount_percent']}% discount = {t['price']} ILS "
            f"(market position: {t['market_position']}x)"
            for t in tiers
        )

        system_prompt = self._build_system_prompt(state)

        response = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"User question: {user_message}\n\n"
                        f"Category: {translate_category(category, 'he')}\n\n"
                        f"Market Data:\n"
                        f"- Average price: {market_data.get('avg_price', 'N/A')} ILS\n"
                        f"- Median price: {market_data.get('median_price', 'N/A')} ILS\n"
                        f"- Sample size: {market_data.get('sample_size', 'N/A')}\n\n"
                        f"Tiered Pricing:\n{tiers_text}\n\n"
                        f"Pricing Context:\n{context_text}\n\n"
                        f"{social_proof_text}\n\n"
                        f"Provide a clear pricing analysis for the user."
                    ),
                }
            ],
            system=system_prompt,
        )

        content = response.get("content", [])
        return content[0].get("text", "") if content else ""

    def _extract_category(self, state: AgentState) -> str:
        """Extract category from state (context_for_next_agent, entities, actions_taken, building_context)."""
        for action in state.get("actions_taken", []):
            cat = action.get("details", {}).get("category") or action.get("entities_to_pass", {}).get("category")
            if cat:
                return cat
        return state.get("building_context", {}).get("category", "general")
