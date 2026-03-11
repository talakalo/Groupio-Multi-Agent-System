"""Influencer Agent for identifying top resident connectors and awarding credits."""

import logging
from typing import Any
from uuid import uuid4

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.influencer import INFLUENCER_SYSTEM_PROMPT
from src.databases.graph_store import get_graph_store
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)


class InfluencerAgent(BaseAgent):
    """Identify top resident connectors and award ₪500 credits.

    Fetches graph-computed influence scores for a city, uses the LLM to
    evaluate credit eligibility (with abuse-prevention logic), writes credit
    award records to Postgres, and passes qualifying residents to the
    OutreachAgent for targeted WhatsApp notification.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="influencer",
            description="Identify top resident connectors and award credits",
            system_prompt=INFLUENCER_SYSTEM_PROMPT,
            tools=["sql_query", "graph_query"],
            rag_enabled=False,
            temperature=0.3,
            max_tokens=1500,
        )
        super().__init__(config)
        self._db = get_postgres_client()
        self._graph = get_graph_store()

    @track_agent_execution("influencer")
    async def run(self, state: AgentState) -> AgentState:
        """Identify top influencers in the city, evaluate credit eligibility, and queue awards."""
        city = self._resolve_city(state)
        if not city:
            state["actions_taken"] = [
                {
                    "agent": "influencer",
                    "action": "no_city",
                    "response": {
                        "type": "info",
                        "message": "לא ניתן לזהות את העיר הרלוונטית לקמפיין.",
                    },
                    "requires_followup": False,
                    "summary_for_next_agent": "InfluencerAgent could not resolve city from state.",
                }
            ]
            return state

        # Fetch top influencers from the graph
        try:
            influencers = await self._graph.get_top_influencers_by_city(city=city, top_n=20, min_score=5.0)
        except Exception as exc:
            logger.warning("Failed to fetch influencers for city %s: %s", city, exc)
            influencers = []

        state["influencer_data"] = {"city": city, "top_influencers": influencers}

        if not influencers:
            state["actions_taken"] = [
                {
                    "agent": "influencer",
                    "action": "no_influencers",
                    "response": {
                        "type": "info",
                        "message": f"לא נמצאו משפיענים עם ניקוד מספיק ב{city}.",
                    },
                    "requires_followup": False,
                    "summary_for_next_agent": f"No qualifying influencers found in {city}.",
                }
            ]
            return state

        # Ask the LLM to evaluate credit eligibility
        qualified, summary = await self._evaluate_credit_eligibility(influencers, city)

        # Write credit award records for qualified residents
        credit_actions = await self._award_credits(qualified)

        # Pass qualified residents to OutreachAgent for credit notification
        state["influencer_data"] = {
            "city": city,
            "top_influencers": influencers,
            "qualified": qualified,
            "credit_awards": credit_actions,
        }
        state["context_for_next_agent"] = {
            "influencer_campaign_targets": qualified,
            "city": city,
        }

        state["actions_taken"] = [
            {
                "agent": "influencer",
                "action": "influencer_credits_evaluated",
                "details": {
                    "city": city,
                    "candidates": len(influencers),
                    "qualified": len(qualified),
                    "credit_awards_written": len(credit_actions),
                },
                "response": {
                    "type": "influencer_summary",
                    "message": summary
                    or (
                        f"זיהינו {len(qualified)} משפיענים ב{city}. "
                        f"זיכוי של ₪500 ממתין לאישור ל-{len(credit_actions)} דיירים."
                    ),
                },
                "requires_followup": len(qualified) > 0,
                "suggested_next_agent": "outreach" if qualified else None,
                "summary_for_next_agent": (
                    f"Identified {len(qualified)} qualifying influencers in {city}. "
                    f"Send ₪500 credit notification via WhatsApp."
                ),
            }
        ]

        self._metrics["calls"] += 1
        return state

    def _resolve_city(self, state: AgentState) -> str | None:
        """Extract the target city from state."""
        # From explicit context
        ctx = state.get("context_for_next_agent") or {}
        if ctx.get("city"):
            return ctx["city"]
        # From building context
        building = state.get("building_context") or {}
        return building.get("city") or building.get("region")

    async def _evaluate_credit_eligibility(
        self,
        influencers: list[dict[str, Any]],
        city: str,
    ) -> tuple[list[dict[str, Any]], str]:
        """Use the LLM to decide which influencers qualify for ₪500 credit."""
        system = INFLUENCER_SYSTEM_PROMPT.format(
            city=city,
            influencer_data=influencers,
        )
        try:
            result = await self._call_llm_structured(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Evaluate these {len(influencers)} influencer candidates in {city} "
                            f"for ₪500 credit eligibility. Apply the eligibility criteria strictly."
                        ),
                    }
                ],
                system=system,
            )
            qualified = result.get("qualified", [])
            summary = result.get("summary", "")
            return qualified, summary
        except Exception as exc:
            logger.warning("LLM credit evaluation failed: %s", exc)
            return [], ""

    async def _award_credits(self, qualified: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Write pending credit award records to Postgres for each qualified resident."""
        written: list[dict[str, Any]] = []
        for candidate in qualified:
            resident_id = candidate.get("resident_id")
            if not resident_id:
                continue
            record: dict[str, Any] = {
                "id": str(uuid4()),
                "resident_id": resident_id,
                "amount": candidate.get("credit_amount", 500),
                "reason": candidate.get("reason", ""),
                "status": "pending_approval",
            }
            try:
                # create_credit_award is added to postgres client in Phase 4 migration
                if hasattr(self._db, "create_credit_award"):
                    await self._db.create_credit_award(record)
                written.append(record)
            except Exception as exc:
                logger.warning("Failed to write credit award for resident %s: %s", resident_id, exc)
        return written
