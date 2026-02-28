"""Webhook routes for external integrations."""

import hashlib
import hmac
import logging
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request

from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.orchestration.graph import get_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


def _verify_whatsapp_signature(payload: bytes, signature: str | None) -> bool:
    """Verify WhatsApp webhook signature using HMAC-SHA256.

    Returns True if valid. Logs warnings and returns False otherwise.
    """
    settings = get_settings()
    secret = settings.WHATSAPP_WEBHOOK_SECRET
    if not secret:
        logger.warning("WHATSAPP_WEBHOOK_SECRET not set — skipping signature check")
        return True  # Allow in dev; will fail the validator in prod settings

    if not signature:
        logger.warning("Missing X-Hub-Signature-256 header")
        return False

    expected = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/whatsapp")
async def whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str | None = Header(None),
) -> dict[str, str]:
    """Handle incoming WhatsApp Business API messages.

    Verifies the X-Hub-Signature-256 header before processing.
    """
    raw_body = await request.body()

    if not _verify_whatsapp_signature(raw_body, x_hub_signature_256):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    import json

    try:
        payload: dict[str, Any] = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    message = _parse_whatsapp_payload(payload)

    if not message:
        return {"status": "ignored"}

    try:
        db = get_postgres_client()
        building_id = await db.get_building_by_phone(message["phone"])

        orchestrator = get_orchestrator()
        result = await orchestrator.run(
            user_message=message["text"],
            user_id=message["phone"],
            building_id=building_id,
        )

        response_obj = result.get("response", {})
        response_text = response_obj.get("message", "") if isinstance(response_obj, dict) else str(response_obj)

        background_tasks.add_task(
            _send_whatsapp_reply,
            phone=message["phone"],
            text=response_text,
        )

        return {"status": "processed"}
    except Exception:
        logger.exception("Error processing WhatsApp message")
        return {"status": "error"}


@router.get("/whatsapp")
async def whatsapp_verify(
    hub_mode: str = "",
    hub_challenge: str = "",
    hub_verify_token: str = "",
) -> Any:
    """WhatsApp webhook verification endpoint.

    Validates hub.verify_token against WHATSAPP_WEBHOOK_SECRET.
    """
    settings = get_settings()
    expected_token = settings.WHATSAPP_WEBHOOK_SECRET

    if hub_mode == "subscribe":
        if expected_token and hub_verify_token != expected_token:
            raise HTTPException(status_code=403, detail="Invalid verify token")
        return int(hub_challenge)

    if hub_mode == "subscribe" and not expected_token:
        # Dev fallback: accept when no secret is configured
        logger.warning("WhatsApp verification token not configured - accepting in dev mode")
        return int(hub_challenge)

    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/contractor-update")
async def contractor_update_webhook(
    payload: dict[str, Any],
    x_api_key: str | None = Header(None, alias="X-API-Key"),
) -> dict[str, str]:
    """Handle contractor profile update notifications — requires X-API-Key."""
    settings = get_settings()
    if settings.API_KEYS:
        if not x_api_key or x_api_key not in settings.API_KEYS:
            raise HTTPException(status_code=403, detail="Invalid or missing API key")
    contractor_id = payload.get("contractor_id")
    update_type = payload.get("type")

    if not contractor_id or not update_type:
        return {"status": "invalid"}

    logger.info("Contractor update: %s type=%s", contractor_id, update_type)

    # Trigger re-vetting if needed
    if update_type in ("document_uploaded", "license_updated"):
        orchestrator = get_orchestrator()
        vetting_agent = orchestrator.agents.get("vetting")
        if vetting_agent:
            from src.orchestration.state import create_initial_state

            state = create_initial_state(
                user_message=f"Re-vet contractor {contractor_id}",
                user_id="system",
            )
            state["actions_taken"] = [
                {
                    "details": {"entities": {"contractor_id": contractor_id}},
                }
            ]
            await vetting_agent.run(state)

    return {"status": "processed"}


def _parse_whatsapp_payload(payload: dict) -> dict[str, str] | None:
    """Extract message data from WhatsApp webhook payload."""
    try:
        entry = payload.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return None

        msg = messages[0]
        text = msg.get("text", {}).get("body", "")
        phone = msg.get("from", "")

        if not text or not phone:
            return None

        return {"phone": phone, "text": text}
    except (IndexError, KeyError):
        return None


async def _send_whatsapp_reply(phone: str, text: str) -> None:
    """Send a WhatsApp reply via the Meta WhatsApp Business Cloud API.

    Requires WHATSAPP_API_TOKEN and WHATSAPP_PHONE_ID to be set in settings.
    Falls back to logging only if either value is missing (development mode).
    """
    settings = get_settings()

    if not settings.WHATSAPP_API_TOKEN or not settings.WHATSAPP_PHONE_ID:
        logger.info(
            "WhatsApp reply (dev — no credentials): to=%s text=%s",
            phone,
            text[:100],
        )
        return

    url = f"https://graph.facebook.com/v17.0/{settings.WHATSAPP_PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"body": text},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}"},
                json=payload,
            )
            response.raise_for_status()
            logger.info("WhatsApp message sent to %s (status %d)", phone, response.status_code)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "WhatsApp API error: status=%d body=%s",
            exc.response.status_code,
            exc.response.text[:200],
        )
    except httpx.RequestError as exc:
        logger.error("WhatsApp network error: %s", exc)
