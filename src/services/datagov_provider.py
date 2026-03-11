"""data.gov.il CKAN provider for address, municipality, and company lookup.

Uses datastore_search, package_search, package_show per data.gov.il API.
User-Agent must include 'datagov-external-client' per provider requirements.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DATAGOV_BASE = "https://data.gov.il/api/3/action"
USER_AGENT = "datagov-external-client/1.0 Groupio/1.0"

# Real resource IDs from data.gov.il discovery
RESOURCE_SETTLEMENTS = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba"  # citiesandsettelments
RESOURCE_STREETS = "9ad3862c-8391-4b2f-84a4-2d4c68625f4b"  # רשימת רחובות ישראל
RESOURCE_COMPANIES = "f004176c-b85f-4542-8901-7b3176f9a054"  # ica_companies

# Hebrew field names from datastore schema
FLD_SYMBOL_YESHUV = "סמל_ישוב"
FLD_NAME_YESHUV = "שם_ישוב"
FLD_NAME_NAFA = "שם_נפה"
FLD_LISHKA = "לשכה"
FLD_SYMBOL_REHOV = "סמל_רחוב"
FLD_NAME_REHOV = "שם_רחוב"


def _normalize_hebrew(s: str | None) -> str:
    """Strip and normalize Hebrew text for matching."""
    if not s or not isinstance(s, str):
        return ""
    return s.strip().replace("\u200e", "").replace("\u200f", "")


def _fuzzy_match(a: str, b: str) -> bool:
    """Case-insensitive prefix/substring match for Hebrew."""
    na, nb = _normalize_hebrew(a).lower(), _normalize_hebrew(b).lower()
    if not na or not nb:
        return False
    return na in nb or nb in na


class DataGovIlProvider:
    """Provider for data.gov.il CKAN datastore and package APIs."""

    def __init__(
        self,
        base_url: str = DATAGOV_BASE,
        timeout: float = 10.0,
        user_agent: str = USER_AGENT,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._headers = {"User-Agent": user_agent, "Content-Type": "application/json"}

    def _post(self, action: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """POST to CKAN action API."""
        url = f"{self._base}/{action}"
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                resp = client.post(url, json=data)
                resp.raise_for_status()
                out = resp.json()
                if not out.get("success"):
                    logger.warning("data.gov.il %s returned success=false", action)
                    return None
                return out.get("result")
        except httpx.HTTPError as e:
            logger.warning("data.gov.il %s failed: %s", action, e)
            return None

    def datastore_search(
        self,
        resource_id: str,
        filters: dict[str, str | int] | None = None,
        fields: list[str] | None = None,
        limit: int = 10,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Search datastore resource. Returns list of records."""
        data: dict[str, Any] = {
            "resource_id": resource_id,
            "limit": limit,
            "offset": offset,
        }
        if filters:
            data["filters"] = filters
        if fields:
            data["fields"] = fields
        result = self._post("datastore_search", data)
        if not result or not isinstance(result, dict):
            return []
        records = result.get("records", [])
        return records if isinstance(records, list) else []

    def get_municipality_info(self, city: str) -> dict[str, Any] | None:
        """Get municipality metadata for a city from settlements dataset.

        Returns dict with: city, municipality_name, district, region, symbol.
        """
        city = _normalize_hebrew(city)
        if not city:
            return None
        records = self.datastore_search(
            RESOURCE_SETTLEMENTS,
            fields=[FLD_SYMBOL_YESHUV, FLD_NAME_YESHUV, FLD_NAME_NAFA, FLD_LISHKA],
            limit=20,
        )
        for rec in records:
            name = _normalize_hebrew(rec.get(FLD_NAME_YESHUV))
            if _fuzzy_match(city, name):
                return {
                    "city": name,
                    "municipality_name": name,
                    "district": _normalize_hebrew(rec.get(FLD_NAME_NAFA)) or None,
                    "region": _normalize_hebrew(rec.get(FLD_LISHKA)) or None,
                    "symbol": str(rec.get(FLD_SYMBOL_YESHUV, "")).strip(),
                }
        return None

    def normalize_address(
        self,
        city: str,
        street: str | None = None,
        house_number: str | None = None,
        free_text: str | None = None,
    ) -> dict[str, Any] | None:
        """Normalize address using settlements + streets datasets.

        free_text can be "street 5" or "רחוב הירקון 15". Returns best match with
        street, house_number, city, municipality, confidence.
        """
        city = _normalize_hebrew(city)
        if not city:
            return None

        # Resolve municipality first
        muni = self.get_municipality_info(city)
        if not muni:
            return None

        symbol_yeshuv = muni.get("symbol")
        if not symbol_yeshuv:
            return {
                "address": f"{street or free_text or ''} {city}".strip(),
                "city": city,
                "street": street,
                "house_number": house_number,
                "municipality": muni.get("municipality_name"),
                "confidence": 0.6,
                "source": "data.gov.il",
            }

        # Optional: match street in streets dataset (filter by settlement code)
        street_canon = None
        symbol_int: int | None = None
        try:
            symbol_int = int(str(symbol_yeshuv).strip())
        except (ValueError, TypeError):
            pass

        if (street or free_text) and symbol_int is not None:
            search_term = _normalize_hebrew(street or free_text)
            records = self.datastore_search(
                RESOURCE_STREETS,
                filters={FLD_SYMBOL_YESHUV: symbol_int},
                limit=50,
            )
            for rec in records:
                name_rehov = _normalize_hebrew(rec.get(FLD_NAME_REHOV))
                if _fuzzy_match(search_term, name_rehov):
                    street_canon = name_rehov
                    break

        addr_parts = [street_canon or street or free_text or "", house_number or ""]
        address = " ".join(p for p in addr_parts if p).strip() or city
        if street_canon or street:
            address = f"{street_canon or street} {house_number or ''}".strip() or address

        return {
            "address": address or city,
            "city": city,
            "street": street_canon or street,
            "house_number": house_number,
            "municipality": muni.get("municipality_name"),
            "confidence": 0.85 if street_canon else 0.7,
            "source": "data.gov.il",
        }

    def search_registered_entity(
        self,
        name: str,
        company_id: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Search companies registry (ICA). NOT contractor license verification.

        Returns list of matches with: company_id, name, status, city, address.
        Use for business name lookup only — no official contractor verification.
        """
        name = _normalize_hebrew(name)
        if not name:
            return []
        filters: dict[str, str | int] = {}
        if company_id:
            filters["מספר חברה"] = int(company_id) if str(company_id).isdigit() else company_id
        records = self.datastore_search(
            RESOURCE_COMPANIES,
            filters=filters if filters else None,
            fields=["מספר חברה", "שם חברה", "סטטוס חברה", "שם עיר", "שם רחוב", "מספר בית"],
            limit=limit,
        )
        out: list[dict[str, Any]] = []
        for rec in records:
            comp_name = _normalize_hebrew(rec.get("שם חברה"))
            if not _fuzzy_match(name, comp_name) and not _fuzzy_match(comp_name, name):
                continue
            out.append(
                {
                    "company_id": str(rec.get("מספר חברה", "")),
                    "name": comp_name,
                    "status": _normalize_hebrew(rec.get("סטטוס חברה", "")),
                    "city": _normalize_hebrew(rec.get("שם עיר", "")),
                    "address": f"{_normalize_hebrew(rec.get('שם רחוב', ''))} {rec.get('מספר בית', '')}".strip(),
                }
            )
        return out
