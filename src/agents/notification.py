"""Notification Agent – central hub for crafting and dispatching notifications."""

import json
import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.notification import NOTIFICATION_SYSTEM_PROMPT
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Supported channels
CHANNELS = ("email", "whatsapp", "push", "in_app")

# Notification types
NOTIFICATION_TYPES = (
    "offer_update",
    "payment_reminder",
    "contractor_matched",
    "escalation_update",
    "welcome",
)


class NotificationAgent(BaseAgent):
    """Central notification hub that personalises and dispatches messages."""

    def __init__(self) -> None:
        config = AgentConfig(
            name="notification",
            description="Central notification hub",
            system_prompt=NOTIFICATION_SYSTEM_PROMPT,
            temperature=0.7,
            max_tokens=1000,
            rag_enabled=False,
        )
        super().__init__(config)

    @track_agent_execution("notification")
    async def run(self, state: AgentState) -> AgentState:
        """Determine which notifications to send and craft personalised messages."""
        notification_type = self._resolve_notification_type(state)
        channels = self._resolve_channels(state)
        user_profile = state.get("user_profile", {})
        preferred_language = user_profile.get("preferred_language", "he")

        logger.info(
            "NotificationAgent: type=%s channels=%s lang=%s user=%s",
            notification_type,
            channels,
            preferred_language,
            state.get("user_id", "unknown"),
        )

        notifications_sent: list[dict[str, Any]] = []

        for channel in channels:
            try:
                message = await self._craft_message(
                    state=state,
                    notification_type=notification_type,
                    channel=channel,
                    preferred_language=preferred_language,
                )
                # Log what would be sent (actual dispatch infrastructure
                # lives in src/services/email.py and src/services/whatsapp_bot.py)
                await self._dispatch(
                    channel=channel,
                    user_profile=user_profile,
                    message=message,
                )
                notifications_sent.append(
                    {
                        "channel": channel,
                        "notification_type": notification_type,
                        "status": "sent",
                        "message_preview": (message.get("body", ""))[:120],
                    }
                )
            except Exception as exc:
                logger.error(
                    "NotificationAgent: failed to send %s via %s: %s",
                    notification_type,
                    channel,
                    exc,
                )
                notifications_sent.append(
                    {
                        "channel": channel,
                        "notification_type": notification_type,
                        "status": "failed",
                        "error": str(exc),
                    }
                )

        state["actions_taken"] = [
            {
                "agent": "notification",
                "action": "notifications_dispatched",
                "details": {
                    "notification_type": notification_type,
                    "channels": channels,
                    "results": notifications_sent,
                },
                "response": {
                    "type": "notification_summary",
                    "message": f"Processed {len(notifications_sent)} notification(s) "
                    f"of type '{notification_type}'.",
                    "notifications": notifications_sent,
                },
                "requires_followup": False,
            }
        ]
        return state

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_notification_type(self, state: AgentState) -> str:
        """Determine the notification type from state context."""
        # Explicit notification_type in state takes priority
        explicit = state.get("notification_type")  # type: ignore[arg-type]
        if explicit and explicit in NOTIFICATION_TYPES:
            return explicit

        # Infer from recent actions_taken
        for action in reversed(state.get("actions_taken", [])):
            agent = action.get("agent", "")
            act = action.get("action", "")

            if agent == "payment" or "payment" in act:
                return "payment_reminder"
            if agent == "matching" or "contractor" in act:
                return "contractor_matched"
            if agent == "support" or "escalat" in act:
                return "escalation_update"

        # Infer from intent
        intent = state.get("intent", "")
        if "payment" in (intent or ""):
            return "payment_reminder"

        return "offer_update"

    def _resolve_channels(self, state: AgentState) -> list[str]:
        """Determine which channels to use for this notification."""
        # Explicit channels override
        explicit = state.get("notification_channels")  # type: ignore[arg-type]
        if explicit and isinstance(explicit, list):
            return [ch for ch in explicit if ch in CHANNELS]

        # Default: in-app always, plus email
        return ["in_app", "email"]

    async def _craft_message(
        self,
        state: AgentState,
        notification_type: str,
        channel: str,
        preferred_language: str,
    ) -> dict[str, Any]:
        """Use the LLM to craft a personalised notification message."""
        system_prompt = self._build_system_prompt(state)

        context_summary = self._build_context_summary(state, notification_type)

        prompt = (
            f"Create a {channel} notification of type '{notification_type}' "
            f"in {'Hebrew' if preferred_language == 'he' else 'English'}.\n\n"
            f"Context:\n{context_summary}\n\n"
            f"Respond with valid JSON only."
        )

        result = await self._call_llm(
            messages=[{"role": "user", "content": prompt}],
            system=system_prompt,
        )

        content = result.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                block.get("text", "")
                for block in content
                if block.get("type") == "text"
            )

        # Parse JSON from the response
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content)
        except (json.JSONDecodeError, IndexError):
            # Fallback: return the raw text as the body
            return {
                "channel": channel,
                "subject": notification_type.replace("_", " ").title(),
                "body": content[:500],
                "cta_text": "",
                "cta_url": "",
            }

    @staticmethod
    def _build_context_summary(state: AgentState, notification_type: str) -> str:
        """Build a concise context string for the LLM prompt."""
        parts: list[str] = []

        user_profile = state.get("user_profile", {})
        if user_profile:
            parts.append(
                f"User: {user_profile.get('full_name', 'Unknown')} "
                f"({user_profile.get('email', '')})"
            )

        active_offers = state.get("active_offers", [])
        if active_offers:
            offer_titles = [o.get("title", "Unnamed offer") for o in active_offers[:3]]
            parts.append(f"Active offers: {', '.join(offer_titles)}")

        building = state.get("building_context", {})
        if building:
            parts.append(
                f"Building: {building.get('name', building.get('address', 'Unknown'))}"
            )

        # Add recent actions for context
        for action in state.get("actions_taken", [])[-2:]:
            response = action.get("response", {})
            msg = response.get("message", "")
            if msg:
                parts.append(f"Recent activity: {msg[:100]}")

        return "\n".join(parts) if parts else "No additional context available."

    async def _dispatch(
        self,
        channel: str,
        user_profile: dict[str, Any],
        message: dict[str, Any],
    ) -> None:
        """Dispatch a notification via the specified channel.

        Currently logs the notification. The actual sending infrastructure
        is available in:
        - Email: src/services/email.py (EmailService)
        - WhatsApp: src/services/whatsapp_bot.py (WhatsAppBotService)
        """
        user_email = user_profile.get("email", "unknown")
        user_name = user_profile.get("full_name", "User")
        body_preview = (message.get("body", ""))[:80]

        # Redact PII before logging
        redacted_email = user_email[:3] + "***" if len(user_email) > 3 else "***"
        redacted_phone = "***" + user_profile.get("phone", "")[-4:] if user_profile.get("phone") else "unknown"

        if channel == "email":
            logger.info(
                "NOTIFICATION [email] to=%s subject='%s' body='%s...'",
                redacted_email,
                message.get("subject", ""),
                body_preview,
            )
        elif channel == "whatsapp":
            logger.info(
                "NOTIFICATION [whatsapp] to=%s body='%s...'",
                redacted_phone,
                body_preview,
            )
        elif channel == "push":
            logger.info(
                "NOTIFICATION [push] user=%s body='%s...'",
                user_name,
                body_preview,
            )
        elif channel == "in_app":
            logger.info(
                "NOTIFICATION [in_app] user=%s body='%s...'",
                user_name,
                body_preview,
            )
        else:
            logger.warning("NOTIFICATION [%s] unsupported channel", channel)
