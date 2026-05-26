"""Minimal async EspoCRM REST client."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class EspoCRMClient:
    """POST/PATCH entities via Espo API (Api Key auth)."""

    def __init__(self, base_url: str, api_key: str) -> None:
        self._base = (base_url or "").rstrip("/")
        self._api_key = (api_key or "").strip()

    @classmethod
    def from_settings(cls) -> EspoCRMClient:
        s = get_settings()
        return cls(s.ESPOCRM_BASE_URL, s.ESPOCRM_API_KEY)

    def is_configured(self) -> bool:
        return bool(self._base and self._api_key)

    def _headers(self) -> dict[str, str]:
        return {
            "X-Api-Key": self._api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_entity(self, entity_type: str, attributes: dict[str, Any]) -> dict[str, Any]:
        """Create a record (entity_type e.g. Account, Contact, or custom GroupioContractor)."""
        if not self.is_configured():
            raise RuntimeError("EspoCRM is not configured")
        url = f"{self._base}/api/v1/{entity_type}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=attributes, headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def update_entity(self, entity_type: str, crm_id: str, attributes: dict[str, Any]) -> dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("EspoCRM is not configured")
        url = f"{self._base}/api/v1/{entity_type}/{crm_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            # PATCH merges fields; PUT can require a full record shape.
            r = await client.patch(url, json=attributes, headers=self._headers())
            r.raise_for_status()
            return r.json()
