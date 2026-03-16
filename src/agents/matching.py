"""Matching Agent for contractor-resident matching."""

import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.matching import MATCHING_SYSTEM_PROMPT
from src.config.settings import get_settings
from src.databases.graph_store import get_graph_store
from src.models.agent_state import AgentState
from src.utils.hebrew_utils import detect_language, translate_category
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Match score weights
MATCH_WEIGHTS = {
    "semantic_similarity": 0.25,
    "graph_score": 0.25,
    "rating": 0.20,
    "price_competitiveness": 0.15,
    "availability": 0.10,
    "response_time": 0.05,
}


class MatchingAgent(BaseAgent):
    """Match residents with optimal contractors.

    Uses semantic search on contractor profiles combined with
    graph-based reputation analysis.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="matching",
            description="Match residents with optimal contractors",
            system_prompt=MATCHING_SYSTEM_PROMPT,
            tools=[
                "vector_search",
                "graph_query",
                "calculate_match_score",
            ],
            rag_enabled=True,
            temperature=0.5,
            max_tokens=2000,
        )
        super().__init__(config)
        self._graph_store = get_graph_store()

    @track_agent_execution("matching")
    async def _run_impl(self, state: AgentState) -> AgentState:
        """Find and rank matching contractors."""
        user_message = self._get_last_user_message(state)
        building_context = state.get("building_context", {})
        region = building_context.get("region", "center")
        building_type = building_context.get("building_type", "residential")

        # Determine category from intent entities or message
        category = self._extract_category(state, user_message)

        # Step 1: Semantic search on contractor profiles
        semantic_results = await self._search_contractors(
            category=category,
            region=region,
            user_message=user_message,
        )

        # Step 2: Graph query for proven track record
        graph_results = await self._query_graph(
            building_type=building_type,
            region=region,
            category=category,
        )

        # Step 3: Combine and score results
        scored_contractors = self._score_and_rank(
            semantic_results=semantic_results,
            graph_results=graph_results,
        )

        # Step 4: Generate recommendation response via LLM
        response = await self._generate_recommendation(
            state=state,
            contractors=scored_contractors,
            category=category,
            user_message=user_message,
        )

        contractor_ids = [c.get("contractor_id") for c in scored_contractors[:10] if c.get("contractor_id")]
        entities = state.get("entities") or {}
        building_id = state.get("building_id") or entities.get("building_id")
        # Merge discovered entities into state for downstream agents
        state["entities"] = {
            **entities,
            "category": category,
            "building_id": building_id or entities.get("building_id"),
        }
        if contractor_ids:
            state["entities"]["contractor_ids"] = contractor_ids
        state["context_for_next_agent"] = {
            "contractor_ids": contractor_ids,
            "category": category,
            "building_id": building_id,
        }
        has_matches = len(scored_contractors) > 0
        state["actions_taken"] = [
            {
                "agent": "matching",
                "action": "contractors_found",
                "contractors": scored_contractors[:5],
                "category": category,
                "response": {
                    "type": "contractor_matches",
                    "message": response,
                    "matches_count": len(scored_contractors),
                },
                "requires_followup": has_matches,
                "summary_for_next_agent": (
                    f"Found {len(scored_contractors)} contractors for category {category} in region {region}."
                    if has_matches
                    else "No matching contractors found."
                ),
                "entities_to_pass": {
                    "contractor_ids": contractor_ids,
                    "category": category,
                    "building_id": building_id,
                }
                if has_matches
                else {},
                "suggested_next_intent": "pricing_question" if has_matches else "",
                "suggested_next_agent": "pricing" if has_matches else "",
            }
        ]

        # Task 3.1 — Autonomy mode: in recommend mode, flag for human confirmation
        settings = get_settings()
        if settings.MATCHING_AGENT_MODE in ("recommend", "gated"):
            reason = f"Matching results require admin confirmation (mode={settings.MATCHING_AGENT_MODE})"
            state["needs_human"] = True
            state["escalation_reason"] = reason
            if state["actions_taken"]:
                state["actions_taken"][-1]["requires_human_confirmation"] = True
            await self._enqueue_pending_decision(
                state=state,
                action_type="contractor_match",
                payload={
                    "contractor_ids": state.get("actions_taken", [{}])[-1].get("contractor_ids", []),
                    "category": state.get("actions_taken", [{}])[-1].get("category", ""),
                    "building_id": state.get("actions_taken", [{}])[-1].get("building_id", ""),
                    "mode": settings.MATCHING_AGENT_MODE,
                },
                escalation_reason=reason,
            )

        self._metrics["calls"] += 1
        return state

    async def _search_contractors(
        self,
        category: str,
        region: str,
        user_message: str,
    ) -> list[dict[str, Any]]:
        """Semantic search on contractor profiles."""
        query = f"{category} contractor in {region}"
        if user_message:
            query = f"{user_message} {query}"

        return await self._retrieve_context(
            query=query,
            namespace="contractors",
            filters={
                "verified": True,
                "active": True,
                "rating": {"gte": 4.0},
            },
            top_k=20,
            strategy="hybrid",
        )

    async def _query_graph(
        self,
        building_type: str,
        region: str,
        category: str | None,
    ) -> list[dict[str, Any]]:
        """Query Neo4j for contractors with proven track records."""
        try:
            return await self._graph_store.find_matching_contractors(
                building_type=building_type,
                region=region,
                category=category,
                min_success_rate=0.85,
                min_projects=3,
                limit=10,
            )
        except Exception:
            logger.exception("Graph query failed for matching")
            return []

    def _score_and_rank(
        self,
        semantic_results: list[dict[str, Any]],
        graph_results: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Combine semantic and graph results into scored matches."""
        # Build a map of contractor_id -> scores
        contractor_scores: dict[str, dict[str, float]] = {}

        # Process semantic results
        for result in semantic_results:
            cid = result.get("metadata", {}).get("contractor_id", result.get("id", ""))
            contractor_scores.setdefault(
                cid,
                {
                    "semantic_similarity": 0,
                    "graph_score": 0,
                    "rating": 0,
                    "price_competitiveness": 0.5,
                    "availability": 0.5,
                    "response_time": 0.5,
                    "business_name": result.get("metadata", {}).get("business_name", ""),
                    "text": result.get("text", ""),
                },
            )
            contractor_scores[cid]["semantic_similarity"] = result.get("score", 0)
            rating = result.get("metadata", {}).get("rating", 0)
            if rating:
                contractor_scores[cid]["rating"] = min(rating / 5.0, 1.0)

        # Process graph results
        for result in graph_results:
            cdata = result if not result.get("c") else result["c"]
            cid = cdata.get("id", "")
            if cid not in contractor_scores:
                contractor_scores[cid] = {
                    "semantic_similarity": 0.3,
                    "graph_score": 0,
                    "rating": 0,
                    "price_competitiveness": 0.5,
                    "availability": 0.5,
                    "response_time": 0.5,
                    "business_name": cdata.get("business_name", ""),
                    "text": "",
                }
            avg_success = cdata.get("avg_success", 0)
            projects = cdata.get("projects", 0)
            contractor_scores[cid]["graph_score"] = min(avg_success * (1 + projects / 20), 1.0)
            if cdata.get("rating"):
                contractor_scores[cid]["rating"] = min(cdata["rating"] / 5.0, 1.0)

        # Calculate overall scores
        results = []
        for cid, scores in contractor_scores.items():
            overall = sum(scores.get(metric, 0) * weight for metric, weight in MATCH_WEIGHTS.items())
            results.append(
                {
                    "contractor_id": cid,
                    "business_name": scores.get("business_name", ""),
                    "overall_score": round(overall, 3),
                    "semantic_similarity": round(scores.get("semantic_similarity", 0), 3),
                    "graph_score": round(scores.get("graph_score", 0), 3),
                    "rating": round(scores.get("rating", 0) * 5, 1),
                    "description": scores.get("text", "")[:200],
                }
            )

        results.sort(key=lambda x: x["overall_score"], reverse=True)
        return results

    async def _generate_recommendation(
        self,
        state: AgentState,
        contractors: list[dict[str, Any]],
        category: str,
        user_message: str,
    ) -> str:
        """Generate a natural language recommendation using LLM."""
        if not contractors:
            lang = detect_language(user_message)
            if lang == "he":
                return "לא מצאנו קבלנים מתאימים לבקשתך כרגע. נשמח לעזור לך לחפש בקריטריונים אחרים."
            return (
                "We couldn't find matching contractors for your request. We'd be happy to help with different criteria."
            )

        top_5 = contractors[:5]
        contractors_text = "\n".join(
            f"- {c['business_name']} (score: {c['overall_score']}, rating: {c['rating']}/5): {c['description']}"
            for c in top_5
        )

        system_prompt = self._build_system_prompt(state)
        response = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"User request: {user_message}\n\n"
                        f"Category: {translate_category(category, 'he')}\n\n"
                        f"Top matching contractors:\n{contractors_text}\n\n"
                        f"Present these matches to the user with explanations."
                    ),
                }
            ],
            system=system_prompt,
        )

        content = response.get("content", [])
        return content[0].get("text", "") if content else ""

    def _extract_category(self, state: AgentState, user_message: str) -> str:
        """Extract service category from state (entities, actions_taken) or message."""
        entities = state.get("entities") or {}
        if entities.get("category"):
            return entities["category"]
        actions = state.get("actions_taken", [])
        for action in actions:
            entities = action.get("details", {}).get("entities", {})
            if entities.get("category"):
                return entities["category"]

        # Default category detection from keywords
        category_keywords = {
            "ac_installation": ["מזגן", "מזגנים", "ac", "air condition"],
            "kitchen": ["מטבח", "kitchen"],
            "electrical": ["חשמל", "חשמלאי", "electric"],
            "plumbing": ["אינסטלציה", "אינסטלטור", "plumb"],
            "heating": ["חימום", "heat", "תנור"],
            "renovations": ["שיפוץ", "שיפוצים", "renovati"],
        }

        message_lower = user_message.lower()
        for category, keywords in category_keywords.items():
            if any(kw in message_lower for kw in keywords):
                return category

        return "general"
