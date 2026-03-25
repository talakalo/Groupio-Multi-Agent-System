"""EspoCRM REST projection (Groupio remains source of truth)."""

from src.integrations.espocrm.client import EspoCRMClient
from src.integrations.espocrm.service import EspoCRMService

__all__ = ["EspoCRMClient", "EspoCRMService"]
