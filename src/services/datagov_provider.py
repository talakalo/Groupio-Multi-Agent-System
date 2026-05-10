"""DEPRECATED — re-export shim. Use src.integrations.gov instead.

This module exists for one release to avoid breaking existing imports.
All logic has moved to src/integrations/gov/client.py.
"""

import warnings as _warnings

from src.integrations.gov.client import (
    DATAGOV_BASE,
    FLD_LISHKA,
    FLD_NAME_NAFA,
    FLD_NAME_REHOV,
    FLD_NAME_YESHUV,
    FLD_SYMBOL_REHOV,
    FLD_SYMBOL_YESHUV,
    RESOURCE_COMPANIES,
    RESOURCE_SETTLEMENTS,
    RESOURCE_STREETS,
    USER_AGENT,
    _fuzzy_match,
    _normalize_hebrew,
)
from src.integrations.gov.client import GovDataClient as _GovDataClient

_warnings.warn(
    "src.services.datagov_provider is deprecated — import from src.integrations.gov instead",
    DeprecationWarning,
    stacklevel=1,
)

__all__ = [
    "DataGovIlProvider",
    "DATAGOV_BASE",
    "USER_AGENT",
    "RESOURCE_SETTLEMENTS",
    "RESOURCE_STREETS",
    "RESOURCE_COMPANIES",
    "FLD_SYMBOL_YESHUV",
    "FLD_NAME_YESHUV",
    "FLD_NAME_NAFA",
    "FLD_LISHKA",
    "FLD_SYMBOL_REHOV",
    "FLD_NAME_REHOV",
    "_normalize_hebrew",
    "_fuzzy_match",
]


class DataGovIlProvider:
    """DEPRECATED — backwards-compat wrapper around GovDataClient.

    Use GovDataClient from src.integrations.gov directly.
    """

    def __init__(
        self,
        base_url: str = DATAGOV_BASE,
        timeout: float = 10.0,
        user_agent: str = USER_AGENT,
    ) -> None:
        _warnings.warn(
            "DataGovIlProvider is deprecated — use GovDataClient from src.integrations.gov",
            DeprecationWarning,
            stacklevel=2,
        )
        self._client = _GovDataClient(
            base_url=base_url,
            connect_timeout=5.0,
            read_timeout=timeout,
            user_agent=user_agent,
        )

    def get_municipality_info(self, city: str) -> dict | None:
        result = self._client.resolve_municipality(city)
        if not result.ok or result.value is None:
            return None
        m = result.value
        return {
            "city": m.municipality_name_he,
            "municipality_name": m.municipality_name_he,
            "district": m.district,
            "region": m.region,
            "symbol": m.municipality_code,
        }

    def normalize_address(
        self,
        city: str,
        street: str | None = None,
        house_number: str | None = None,
        free_text: str | None = None,
    ) -> dict | None:
        result = self._client.normalize_address(city, street, house_number, free_text)
        if not result.ok or result.value is None:
            return None
        v = result.value
        return {
            "address": v.address,
            "city": v.city,
            "street": v.street,
            "house_number": v.house_number,
            "municipality": v.municipality,
            "confidence": result.confidence,
            "source": result.source.value,
        }

    def search_registered_entity(
        self,
        name: str,
        company_id: str | None = None,
        limit: int = 5,
    ) -> list[dict]:
        result = self._client.lookup_company(name, company_id, limit)
        if result.value is None:
            return []
        return [
            {
                "company_id": c.company_id,
                "name": c.name,
                "status": c.status,
                "city": c.city,
                "address": c.address,
            }
            for c in result.value
        ]

    def datastore_search(self, resource_id: str, **kwargs) -> list[dict]:
        return self._client._datastore_search(resource_id, **kwargs)
