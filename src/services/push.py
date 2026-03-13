"""Push notification service (Firebase Cloud Messaging)."""

import asyncio
import logging
from typing import Any

import httpx

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class PushService:
    """Send push notifications via Firebase Cloud Messaging (FCM) legacy HTTP API.

    Requires ``FCM_SERVER_KEY`` to be set in settings. When the key is absent
    the service logs at DEBUG level and skips the delivery — so development
    environments work without configuration.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

    def _is_configured(self) -> bool:
        return bool(self.settings.FCM_SERVER_KEY)

    async def send(
        self,
        token: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send a push notification to a single device token.

        Returns a dict with ``message_id`` and ``success`` keys.
        """
        if not self._is_configured():
            logger.debug("Push service not configured (FCM_SERVER_KEY empty) — skipping delivery")
            return {"success": False, "reason": "not_configured"}

        if not token:
            logger.debug("Push: no device token provided, skipping")
            return {"success": False, "reason": "no_token"}

        payload: dict[str, Any] = {
            "to": token,
            "notification": {
                "title": title,
                "body": body,
                "sound": "default",
            },
        }
        if data:
            payload["data"] = {k: str(v) for k, v in data.items()}

        headers = {
            "Authorization": f"key={self.settings.FCM_SERVER_KEY}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self.settings.FCM_ENDPOINT,
                    json=payload,
                    headers=headers,
                )
            resp_json = response.json()
            if response.status_code == 200 and resp_json.get("success", 0) == 1:
                message_id = resp_json.get("results", [{}])[0].get("message_id", "")
                logger.info("Push notification sent: token=***%s message_id=%s", token[-6:], message_id)
                return {"success": True, "message_id": message_id}
            else:
                error = resp_json.get("results", [{}])[0].get("error", "unknown")
                logger.warning("Push notification failed: token=***%s error=%s", token[-6:], error)
                return {"success": False, "reason": error}
        except Exception as exc:
            logger.error("Push notification error: %s", exc)
            return {"success": False, "reason": str(exc)}

    async def send_multicast(
        self,
        tokens: list[str],
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send a push notification to multiple device tokens concurrently."""
        results = await asyncio.gather(
            *[self.send(token=t, title=title, body=body, data=data) for t in tokens],
            return_exceptions=True,
        )
        successes = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
        return {"total": len(tokens), "success": successes, "failed": len(tokens) - successes}


_push_service: PushService | None = None


def get_push_service() -> PushService:
    global _push_service
    if _push_service is None:
        _push_service = PushService()
    return _push_service
