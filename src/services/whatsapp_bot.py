"""
WhatsApp Bot Service for Groupio Multi-Agent System.

Handles incoming WhatsApp messages via the WhatsApp Business API,
routes them through the multi-agent system, and sends responses back.
"""

import hashlib
import hmac
import logging
from typing import Any

import httpx
from pydantic import BaseModel

from src.config.settings import get_settings
from src.databases.redis_client import RedisClient
from src.orchestration.graph import GroupioOrchestrator
from src.utils.hebrew_utils import is_hebrew, normalize_hebrew

logger = logging.getLogger(__name__)


class WhatsAppMessage(BaseModel):
    """Incoming WhatsApp message structure."""

    message_id: str
    from_number: str
    timestamp: str
    text: str | None = None
    type: str = "text"
    # Media fields
    image_id: str | None = None
    document_id: str | None = None
    # Location fields
    latitude: float | None = None
    longitude: float | None = None
    # Interactive fields
    button_reply_id: str | None = None
    list_reply_id: str | None = None


class WhatsAppContact(BaseModel):
    """WhatsApp contact info."""

    wa_id: str
    profile_name: str | None = None


class WhatsAppWebhookPayload(BaseModel):
    """Parsed WhatsApp webhook payload."""

    messages: list[WhatsAppMessage] = []
    contacts: list[WhatsAppContact] = []
    statuses: list[dict[str, Any]] = []


class WhatsAppBotService:
    """
    WhatsApp Bot Service that integrates with the Groupio multi-agent system.

    Responsibilities:
    - Verify webhook signatures
    - Parse incoming messages
    - Maintain conversation context via Redis
    - Route messages through the orchestrator
    - Send responses back via WhatsApp API
    """

    def __init__(
        self,
        orchestrator: GroupioOrchestrator,
        redis_client: RedisClient,
    ) -> None:
        self.orchestrator = orchestrator
        self.redis = redis_client
        settings = get_settings()
        self.api_url = f"https://graph.facebook.com/v18.0/{settings.WHATSAPP_PHONE_ID}/messages"
        self.http_client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        Verify that the webhook payload is authentic using HMAC-SHA256.

        Args:
            payload: Raw request body bytes
            signature: X-Hub-Signature-256 header value

        Returns:
            True if signature is valid
        """
        settings = get_settings()
        if not settings.WHATSAPP_WEBHOOK_SECRET:
            logger.warning("WhatsApp webhook secret not configured")
            return False

        expected_signature = hmac.new(
            key=settings.WHATSAPP_WEBHOOK_SECRET.encode(),
            msg=payload,
            digestmod=hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(f"sha256={expected_signature}", signature)

    def parse_webhook_payload(self, data: dict[str, Any]) -> WhatsAppWebhookPayload:
        """
        Parse the incoming webhook payload from WhatsApp.

        Args:
            data: JSON payload from webhook

        Returns:
            Parsed WhatsAppWebhookPayload
        """
        messages: list[WhatsAppMessage] = []
        contacts: list[WhatsAppContact] = []
        statuses: list[dict[str, Any]] = []

        try:
            entry = data.get("entry", [{}])[0]
            changes = entry.get("changes", [{}])[0]
            value = changes.get("value", {})

            # Parse messages
            for msg in value.get("messages", []):
                message = WhatsAppMessage(
                    message_id=msg["id"],
                    from_number=msg["from"],
                    timestamp=msg["timestamp"],
                    type=msg.get("type", "text"),
                )

                if msg["type"] == "text":
                    message.text = msg.get("text", {}).get("body")
                elif msg["type"] == "interactive":
                    interactive = msg.get("interactive", {})
                    if interactive.get("type") == "button_reply":
                        message.button_reply_id = interactive.get("button_reply", {}).get("id")
                    elif interactive.get("type") == "list_reply":
                        message.list_reply_id = interactive.get("list_reply", {}).get("id")
                elif msg["type"] == "image":
                    message.image_id = msg.get("image", {}).get("id")
                elif msg["type"] == "document":
                    message.document_id = msg.get("document", {}).get("id")
                elif msg["type"] == "location":
                    location = msg.get("location", {})
                    message.latitude = location.get("latitude")
                    message.longitude = location.get("longitude")

                messages.append(message)

            # Parse contacts
            for contact in value.get("contacts", []):
                contacts.append(
                    WhatsAppContact(
                        wa_id=contact.get("wa_id", ""),
                        profile_name=contact.get("profile", {}).get("name"),
                    )
                )

            # Parse statuses
            statuses = value.get("statuses", [])

        except (KeyError, IndexError, TypeError) as e:
            logger.error("Failed to parse webhook payload: %s", e)

        return WhatsAppWebhookPayload(
            messages=messages,
            contacts=contacts,
            statuses=statuses,
        )

    async def handle_message(self, message: WhatsAppMessage, contact: WhatsAppContact | None) -> None:
        """
        Handle an incoming WhatsApp message.

        Args:
            message: The parsed message
            contact: Optional contact info
        """
        if not message.text:
            # Build a synthetic text prompt for the orchestrator based on media type.
            # This lets agents acknowledge media uploads (images, documents) and
            # give the user context-appropriate instructions instead of a hard error.
            if message.image_id:
                synthetic_text = "[המשתמש שלח תמונה]" if is_hebrew(message.from_number) else "[User sent an image]"
            elif message.document_id:
                synthetic_text = "[המשתמש שלח מסמך]" if is_hebrew(message.from_number) else "[User sent a document]"
            else:
                synthetic_text = (
                    "[המשתמש שלח קובץ מדיה]" if is_hebrew(message.from_number) else "[User sent a media file]"
                )
            message = message.__class__(
                message_id=message.message_id,
                from_number=message.from_number,
                timestamp=message.timestamp,
                text=synthetic_text,
                image_id=message.image_id,
                document_id=message.document_id,
            )

        # Normalize Hebrew text if applicable
        user_message = message.text
        if is_hebrew(user_message):
            user_message = normalize_hebrew(user_message)

        # Get or create conversation session
        session_id = f"whatsapp:{message.from_number}"
        _conversation_history = await self.redis.get_conversation_context(session_id)

        # Create user context
        user_context = {
            "channel": "whatsapp",
            "phone_number": message.from_number,
            "profile_name": contact.profile_name if contact else None,
            "message_id": message.message_id,
            "timestamp": message.timestamp,
        }

        try:
            # Send typing indicator (mark message as read — shows blue ticks)
            await self._send_typing_indicator(message.from_number, message_id=message.message_id)

            # Process through orchestrator
            result = await self.orchestrator.run(
                user_message=user_message,
                user_id=session_id,
                building_id=user_context.get("building_id"),
                conversation_id=session_id,
            )

            # Extract response from orchestrator result
            response_obj = result.get("response", {})
            response_text = response_obj.get("message", "") if isinstance(response_obj, dict) else str(response_obj)
            if not response_text:
                response_text = (
                    "מצטערים, לא הצלחנו לעבד את הבקשה שלך. אנא נסה שוב."
                    if is_hebrew(user_message)
                    else "Sorry, we couldn't process your request. Please try again."
                )

            # Check if we need to send interactive elements
            if result.get("offers"):
                await self._send_offers_list(message.from_number, result["offers"])
            elif result.get("contractors"):
                await self._send_contractors_list(message.from_number, result["contractors"])
            elif result.get("quick_replies"):
                await self._send_quick_replies(
                    message.from_number,
                    response_text,
                    result["quick_replies"],
                )
            else:
                await self._send_text_message(message.from_number, response_text)

            # Update conversation history
            await self.redis.add_conversation_message(
                session_id,
                {"role": "user", "content": user_message},
            )
            await self.redis.add_conversation_message(
                session_id,
                {"role": "assistant", "content": response_text},
            )

        except Exception as e:
            logger.exception("Error processing message: %s", e)
            await self._send_text_message(
                message.from_number,
                "מצטערים, אירעה שגיאה. אנא נסה שוב מאוחר יותר."
                if is_hebrew(user_message)
                else "Sorry, an error occurred. Please try again later.",
            )

    async def _send_text_message(self, to: str, text: str) -> None:
        """Send a simple text message."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

        try:
            response = await self.http_client.post(self.api_url, json=payload)
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Failed to send WhatsApp message: %s", e)

    async def _send_typing_indicator(self, to: str, message_id: str | None = None) -> None:
        """Send a typing indicator by marking the last message as read.

        The WhatsApp Business API does not expose a standalone "typing" event.
        Marking the incoming message as read causes WhatsApp to display two
        blue ticks on the sender's screen, which is the standard signal that
        the bot is processing their message.
        """
        if not message_id:
            return
        try:
            settings = get_settings()
            status_url = f"https://graph.facebook.com/v18.0/{settings.WHATSAPP_PHONE_ID}/messages"
            payload = {
                "messaging_product": "whatsapp",
                "status": "read",
                "message_id": message_id,
            }
            response = await self.http_client.post(status_url, json=payload)
            response.raise_for_status()
        except Exception as exc:
            # Non-critical: log and continue — delivery of the actual reply is unaffected
            logger.debug("WhatsApp typing indicator (mark-read) failed: %s", exc)

    async def _send_quick_replies(
        self,
        to: str,
        text: str,
        buttons: list[dict[str, str]],
    ) -> None:
        """Send a message with quick reply buttons."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": text},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {
                                "id": btn["id"],
                                "title": btn["title"][:20],  # Max 20 chars
                            },
                        }
                        for btn in buttons[:3]  # Max 3 buttons
                    ]
                },
            },
        }

        try:
            response = await self.http_client.post(self.api_url, json=payload)
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Failed to send quick replies: %s", e)

    async def _send_offers_list(self, to: str, offers: list[dict[str, Any]]) -> None:
        """Send a list of offers as an interactive list."""
        rows = [
            {
                "id": offer["id"],
                "title": offer.get("title", "הצעה")[:24],
                "description": f"₪{offer.get('price', 0):,} - {offer.get('category', '')}"[:72],
            }
            for offer in offers[:10]  # Max 10 rows
        ]

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "header": {"type": "text", "text": "הצעות זמינות"},
                "body": {"text": "בחר הצעה לפרטים נוספים:"},
                "action": {
                    "button": "צפה בהצעות",
                    "sections": [
                        {
                            "title": "הצעות",
                            "rows": rows,
                        }
                    ],
                },
            },
        }

        try:
            response = await self.http_client.post(self.api_url, json=payload)
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Failed to send offers list: %s", e)

    async def _send_contractors_list(
        self,
        to: str,
        contractors: list[dict[str, Any]],
    ) -> None:
        """Send a list of contractors as an interactive list."""
        rows = [
            {
                "id": contractor["id"],
                "title": contractor.get("name", "קבלן")[:24],
                "description": f"⭐ {contractor.get('rating', 0):.1f} - {contractor.get('category', '')}"[:72],
            }
            for contractor in contractors[:10]
        ]

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "header": {"type": "text", "text": "קבלנים מומלצים"},
                "body": {"text": "בחר קבלן לפרטים נוספים:"},
                "action": {
                    "button": "צפה בקבלנים",
                    "sections": [
                        {
                            "title": "קבלנים",
                            "rows": rows,
                        }
                    ],
                },
            },
        }

        try:
            response = await self.http_client.post(self.api_url, json=payload)
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Failed to send contractors list: %s", e)

    async def send_notification(
        self,
        to: str,
        template_name: str,
        template_params: list[str],
        language: str = "he",
    ) -> None:
        """
        Send a proactive notification using a pre-approved template.

        Args:
            to: Recipient phone number
            template_name: Name of the approved template
            template_params: Parameters to fill in the template
            language: Template language code
        """
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": param} for param in template_params],
                    }
                ],
            },
        }

        try:
            response = await self.http_client.post(self.api_url, json=payload)
            response.raise_for_status()
            logger.info("Sent notification to %s: %s", to, template_name)
        except httpx.HTTPError as e:
            logger.error("Failed to send notification: %s", e)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.http_client.aclose()


# Singleton instance
_whatsapp_bot: WhatsAppBotService | None = None


def get_whatsapp_bot() -> WhatsAppBotService:
    """Get or create the WhatsApp bot service instance."""
    global _whatsapp_bot
    if _whatsapp_bot is None:
        from src.databases.redis_client import get_redis_client
        from src.orchestration.graph import get_orchestrator

        _whatsapp_bot = WhatsAppBotService(
            orchestrator=get_orchestrator(),
            redis_client=get_redis_client(),
        )
    return _whatsapp_bot
