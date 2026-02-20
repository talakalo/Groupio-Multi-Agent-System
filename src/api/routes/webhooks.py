"""Webhook routes for external integrations."""

import hashlib
import hmac
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.orchestration.graph import get_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


def _verify_whatsapp_signature(body: bytes, signature_header: str | None) -> None:
    """Verify WhatsApp webhook signature using HMAC-SHA256.

    Raises HTTPException(403) when verification fails.
    """
    settings = get_settings()
    secret = settings.WHATSAPP_WEBHOOK_SECRET

    if not secret:
        # If secret is not configured, log a warning but allow (dev mode)
        if settings.ENVIRONMENT == "development":
            logger.warning("WhatsApp webhook secret not configured - skipping verification")
            return
        raise HTTPException(status_code=403, detail="Webhook secret not configured")

    if not signature_header:
        raise HTTPException(status_code=403, detail="Missing X-Hub-Signature-256 header")

    expected = (
        "sha256="
        + hmac.new(
            key=secret.encode(),
            msg=body,
            digestmod=hashlib.sha256,
        ).hexdigest()
    )

    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")


@router.post("/whatsapp")
async def whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Handle incoming WhatsApp Business API messages."""
    # Verify webhook signature
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    _verify_whatsapp_signature(body, signature)

    import json

    payload: dict[str, Any] = json.loads(body)
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

        background_tasks.add_task(
            _send_whatsapp_reply,
            phone=message["phone"],
            text=result["response"].get("message", ""),
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
    """WhatsApp webhook verification endpoint."""
    settings = get_settings()
    expected_token = settings.WHATSAPP_WEBHOOK_SECRET

    if hub_mode == "subscribe" and expected_token and hub_verify_token == expected_token:
        return int(hub_challenge)

    if hub_mode == "subscribe" and not expected_token:
        # Dev fallback: accept when no secret is configured
        logger.warning("WhatsApp verification token not configured - accepting in dev mode")
        return int(hub_challenge)

    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/contractor-update")
async def contractor_update_webhook(
    payload: dict[str, Any],
) -> dict[str, str]:
    """Handle contractor profile update notifications."""
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
    """Send a WhatsApp reply (stub - integrate with WhatsApp Business API)."""
    logger.info("WhatsApp reply to %s: %s", phone, text[:100])
