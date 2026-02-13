"""Architecture Analysis Agent – analyses floor plans via Vision AI."""

import base64
import json
import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.architecture import ARCHITECTURE_SYSTEM_PROMPT
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.services.storage import get_storage_service
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)


class ArchitectureAgent(BaseAgent):
    """Analyses uploaded floor plans and suggests services."""

    def __init__(self) -> None:
        config = AgentConfig(
            name="architecture",
            description="Analyze floor plans and suggest renovation/installation services",
            system_prompt=ARCHITECTURE_SYSTEM_PROMPT,
            tools=["vector_search"],
            rag_enabled=True,
            temperature=0.4,
            max_tokens=3000,
        )
        super().__init__(config)

    @track_agent_execution("architecture")
    async def run(self, state: AgentState) -> AgentState:
        """Analyse an architecture upload and produce suggestions."""
        file_id = state.get("architecture_file_id")
        if not file_id:
            # Fallback: treat the latest user message as a text-based renovation query
            return await self._handle_text_query(state)

        db = get_postgres_client()
        record = await db.get_file_upload(file_id)
        if not record:
            state["actions_taken"] = [
                {
                    "agent": "architecture",
                    "action": "file_not_found",
                    "response": {
                        "type": "error",
                        "message": "לא נמצא הקובץ שהועלה. אנא העלה מחדש.",
                    },
                    "requires_followup": False,
                    "summary_for_next_agent": "Architecture file not found; asked user to re-upload.",
                }
            ]
            return state

        # Update analysis status
        await db.update_file_upload(file_id, {"analysis_status": "analyzing"})

        try:
            analysis = await self._analyse_image(record, state)
        except Exception as exc:
            logger.error("Architecture analysis failed for %s: %s", file_id, exc)
            await db.update_file_upload(file_id, {"analysis_status": "failed"})
            state["actions_taken"] = [
                {
                    "agent": "architecture",
                    "action": "analysis_failed",
                    "response": {
                        "type": "error",
                        "message": "הניתוח נכשל. אנא נסה להעלות תמונה ברורה יותר.",
                    },
                    "requires_followup": False,
                    "summary_for_next_agent": "Architecture analysis failed; asked user for clearer image.",
                }
            ]
            return state

        # Persist results
        await db.update_file_upload(
            file_id,
            {"analysis_status": "completed", "analysis_result": analysis},
        )

        # Cross-reference with active offers
        building_id = state.get("building_id")
        if building_id:
            active_offers = state.get("active_offers", [])
            for suggestion in analysis.get("suggestions", []):
                matching = [
                    o.get("id")
                    for o in active_offers
                    if o.get("category") == suggestion.get("category")
                ]
                suggestion["matching_offers"] = matching

        state["actions_taken"] = [
            {
                "agent": "architecture",
                "action": "analysis_completed",
                "details": {"file_id": file_id},
                "response": {
                    "type": "architecture_analysis",
                    "analysis": analysis,
                    "message": analysis.get(
                        "summary_he",
                        "הניתוח הושלם. הנה ההמלצות שלנו:",
                    ),
                },
                "requires_followup": False,
                "summary_for_next_agent": "Floor plan analysis completed; recommendations and matching offers provided.",
            }
        ]
        return state

    # ------------------------------------------------------------------

    async def _analyse_image(
        self, record: dict[str, Any], state: AgentState
    ) -> dict[str, Any]:
        """Call Claude Vision API with the uploaded image."""
        storage = get_storage_service()

        # Get a signed URL or the image bytes
        signed_url = await storage.get_signed_url(
            record["bucket"], record["storage_path"]
        )

        system_prompt = self._build_system_prompt(state)

        # Build a multimodal message with the image URL
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "url", "url": signed_url},
                    },
                    {
                        "type": "text",
                        "text": (
                            "אנא נתח את תוכנית הדירה הזו. "
                            "זהה חדרים, שטחים, ותן המלצות לשיפוצים והתקנות "
                            "שיכולות להתאים לדיירי הבניין שלנו. "
                            "Analyze this floor plan. Identify rooms, areas, "
                            "and suggest relevant home-improvement services."
                        ),
                    },
                ],
            }
        ]

        result = await self._call_llm(
            messages=messages,
            system=system_prompt,
            temperature=0.4,
        )

        # Parse structured JSON from the response
        content = result.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                block.get("text", "") for block in content if block.get("type") == "text"
            )

        try:
            # Extract JSON from possible markdown fences
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content)
        except (json.JSONDecodeError, IndexError):
            # Return a basic structure with the raw text
            return {
                "rooms_detected": [],
                "total_area_sqm": None,
                "suggestions": [],
                "summary_he": content[:500],
                "summary_en": "",
            }

    async def _handle_text_query(self, state: AgentState) -> AgentState:
        """Handle a text-based renovation query (no uploaded file)."""
        user_message = self._get_last_user_message(state)
        system_prompt = self._build_system_prompt(state)

        result = await self._call_llm_structured(
            messages=[{"role": "user", "content": user_message}],
            system=system_prompt,
        )

        state["actions_taken"] = [
            {
                "agent": "architecture",
                "action": "text_analysis",
                "response": {
                    "type": "architecture_analysis",
                    "analysis": result,
                    "message": result.get(
                        "summary_he", "הנה ההמלצות שלנו על בסיס התיאור שלך:"
                    ),
                },
                "requires_followup": False,
                "summary_for_next_agent": "Text-based renovation analysis completed; recommendations provided.",
            }
        ]
        return state
