"""DEPRECATED — re-export shim. Use src.integrations.gov instead.

This module exists for one release to avoid breaking existing imports.
All logic has moved to src/integrations/gov/client.py.
"""

import warnings as _warnings

import httpx  # noqa: F401 — re-exported so patch targets like src.services.datagov_provider.httpx still work

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
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._user_agent = user_agent
        self._client = _GovDataClient(
            base_url=base_url,
            connect_timeout=5.0,
            read_timeout=timeout,
            user_agent=user_agent,
        )

    def _post(self, action: str, params: dict) -> dict | None:
        """POST to CKAN action endpoint. Returns result dict or None on failure."""
        url = f"{self._base_url}/{action}"
        try:
            with httpx.Client(
                timeout=self._timeout,
                headers={"User-Agent": self._user_agent, "Content-Type": "application/json"},
            ) as client:
                resp = client.post(url, json=params)
                resp.raise_for_status()
                data = resp.json()
                if not data.get("success"):
                    return None
                return data.get("result")
        except httpx.HTTPError:
            return None

    def datastore_search(
        self,
        resource_id: str,
        filters: dict | None = None,
        fields: list | None = None,
        limit: int = 10,
        q: str | None = None,
    ) -> list[dict]:
        """Search CKAN datastore. Returns list of records."""
        params: dict = {"resource_id": resource_id, "limit": limit}
        if filters:
            params["filters"] = filters
        if fields:
            params["fields"] = fields
        if q:
            params["q"] = q
        result = self._post("datastore_search", params)
        if result is None:
            return []
        return result.get("records", [])

    def get_municipality_info(self, city: str) -> dict | None:
        if not city:
            return None
        records = self.datastore_search(
            RESOURCE_SETTLEMENTS,
            fields=[FLD_SYMBOL_YESHUV, FLD_NAME_YESHUV, FLD_NAME_NAFA, FLD_LISHKA],
            limit=10,
            q=_normalize_hebrew(city),
        )
        for rec in records:
            name = _normalize_hebrew(rec.get(FLD_NAME_YESHUV))
            if _fuzzy_match(city, name):
                return {
                    "city": name,
                    "municipality_name": name,
                    "symbol": str(rec.get(FLD_SYMBOL_YESHUV, "")),
                    "district": _normalize_hebrew(rec.get(FLD_NAME_NAFA, "")),
                    "region": _normalize_hebrew(rec.get(FLD_LISHKA, "")),
                }
        return None

    def normalize_address(
        self,
        city: str,
        street: str | None = None,
        house_number: str | None = None,
        free_text: str | None = None,
    ) -> dict | None:
        if not city:
            return None
        muni = self.get_municipality_info(city)
        if muni is None:
            return None
        symbol = muni.get("symbol", "")
        if not symbol:
            addr = f"{street or free_text or ''} {city}".strip()
            return {
                "address": addr,
                "city": city,
                "street": street,
                "house_number": house_number,
                "municipality": muni.get("municipality_name"),
                "confidence": 0.6,
                "source": "settlements",
            }
        street_name: str | None = None
        if street or free_text:
            q_street = street or free_text or ""
            filters = {FLD_SYMBOL_YESHUV: int(symbol)} if symbol.isdigit() else None
            records = self.datastore_search(RESOURCE_STREETS, filters=filters, limit=100)
            for rec in records:
                name = _normalize_hebrew(rec.get(FLD_NAME_REHOV))
                if _fuzzy_match(q_street, name):
                    street_name = name
                    break
        addr_parts = [street_name or street or free_text or "", house_number or ""]
        address = " ".join(p for p in addr_parts if p).strip() or city
        return {
            "address": address,
            "city": city,
            "street": street_name or street,
            "house_number": house_number,
            "municipality": muni.get("municipality_name"),
            "confidence": 0.85 if street_name else 0.7,
            "source": "settlements+streets",
        }

    def search_registered_entity(
        self,
        name: str,
        company_id: str | None = None,
        limit: int = 5,
    ) -> list[dict]:
        if not name:
            return []
        filters: dict | None = None
        if company_id:
            filters = {"מספר חברה": int(company_id) if str(company_id).isdigit() else company_id}
        records = self.datastore_search(
            RESOURCE_COMPANIES,
            filters=filters,
            fields=["מספר חברה", "שם חברה", "סטטוס חברה", "שם עיר", "שם רחוב", "מספר בית"],
            limit=limit,
        )
        results = []
        for rec in records:
            comp_name = _normalize_hebrew(rec.get("שם חברה", ""))
            if not company_id and not _fuzzy_match(name, comp_name):
                continue
            results.append({
                "company_id": str(rec.get("מספר חברה", "")),
                "name": comp_name,
                "status": _normalize_hebrew(rec.get("סטטוס חברה", "")),
                "city": _normalize_hebrew(rec.get("שם עיר", "")),
                "address": f"{_normalize_hebrew(rec.get('שם רחוב', ''))} {rec.get('מספר בית', '')}".strip(),
            })
        return results
