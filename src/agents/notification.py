"""Notification Agent – central hub for crafting and dispatching notifications."""

import json
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.notification import NOTIFICATION_SYSTEM_PROMPT
from src.models.agent_state import AgentState
from src.utils.monitoring import capture_exception_safe, get_logger, track_agent_execution

logger = get_logger(__name__)

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
    async def _run_impl(self, state: AgentState) -> AgentState:
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
                    "message": f"Processed {len(notifications_sent)} notification(s) of type '{notification_type}'.",
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
        """Determine which channels to use, respecting user notification_settings."""
        # Explicit caller override always wins
        explicit = state.get("notification_channels")  # type: ignore[arg-type]
        if explicit and isinstance(explicit, list):
            return [ch for ch in explicit if ch in CHANNELS]

        # Read user preferences from profile (saved as notification_settings JSONB)
        prefs: dict = {}
        user_profile = state.get("user_profile") or {}
        raw_settings = user_profile.get("notification_settings")
        if isinstance(raw_settings, dict):
            prefs = raw_settings

        # in_app is always on — residents can't opt out of in-app alerts
        channels = ["in_app"]

        # Map frontend preference keys to channel names
        # Both camelCase (resident) and snake_case (contractor) variants supported
        email_on = prefs.get("emailEnabled", prefs.get("email_offers", True))
        push_on = prefs.get("pushEnabled", False)  # opt-in; only send push if user has explicitly enabled it
        whatsapp_on = prefs.get("whatsappEnabled", prefs.get("whatsapp_offers", False))

        if email_on:
            channels.append("email")
        if push_on:
            channels.append("push")
        if whatsapp_on:
            channels.append("whatsapp")

        return channels

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
            content = " ".join(block.get("text", "") for block in content if block.get("type") == "text")

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
            parts.append(f"User: {user_profile.get('full_name', 'Unknown')} ({user_profile.get('email', '')})")

        active_offers = state.get("active_offers", [])
        if active_offers:
            offer_titles = [o.get("title", "Unnamed offer") for o in active_offers[:3]]
            parts.append(f"Active offers: {', '.join(offer_titles)}")

        building = state.get("building_context", {})
        if building:
            parts.append(f"Building: {building.get('name', building.get('address', 'Unknown'))}")

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
        """Dispatch a notification via the specified channel."""
        user_email = user_profile.get("email", "")
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
            if user_email:
                from src.services.email import get_email_service  # noqa: PLC0415

                email_svc = get_email_service()
                body = message.get("body", "")
                cta_url = message.get("cta_url", "")
                cta_text = message.get("cta_text", "לצפייה")
                html_body = f"<div dir='rtl'><p>{body}</p>"
                if cta_url:
                    html_body += f"<p><a href='{cta_url}' style='color:#4F46E5;'>{cta_text}</a></p>"
                html_body += "</div>"
                await email_svc.send_email(
                    to_email=user_email,
                    subject=message.get("subject", "עדכון מ-Groupio"),
                    html_content=html_body,
                )

        elif channel == "whatsapp":
            logger.info(
                "NOTIFICATION [whatsapp] to=%s body='%s...'",
                redacted_phone,
                body_preview,
            )
            phone = user_profile.get("phone", "")
            if phone:
                try:
                    from src.services.whatsapp_bot import get_whatsapp_bot  # noqa: PLC0415

                    wa = get_whatsapp_bot()
                    await wa.send_text_message(to=phone, text=message.get("body", ""))
                except Exception as exc:
                    logger.warning(
                        "notification_whatsapp_dispatch_failed",
                        channel="whatsapp",
                        error_type=type(exc).__name__,
                        error=str(exc)[:500],
                    )
                    capture_exception_safe(exc, flow="notification_whatsapp", channel="whatsapp")

        elif channel == "push":
            logger.info(
                "NOTIFICATION [push] user=%s body='%s...'",
                user_name,
                body_preview,
            )
            # Send push notification via FCM if a device token is registered for the user.
            # The token is stored in user_profile["push_token"] (set during mobile app login).
            push_token = user_profile.get("push_token", "")
            if push_token:
                try:
                    from src.services.push import get_push_service  # noqa: PLC0415

                    push_svc = get_push_service()
                    await push_svc.send(
                        token=push_token,
                        title=message.get("subject", "Groupio"),
                        body=message.get("body", ""),
                        data=message.get("data", {}),
                    )
                except Exception as exc:
                    logger.warning(
                        "notification_push_dispatch_failed",
                        channel="push",
                        error_type=type(exc).__name__,
                        error=str(exc)[:500],
                    )
                    capture_exception_safe(exc, flow="notification_push", channel="push")
            else:
                logger.debug("NOTIFICATION [push] no push_token for user %s, skipping", user_name)
        elif channel == "in_app":
            logger.info(
                "NOTIFICATION [in_app] user=%s body='%s...'",
                user_name,
                body_preview,
            )
        else:
            logger.warning("NOTIFICATION [%s] unsupported channel", channel)
