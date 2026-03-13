"""Enrichment service for address normalization, municipality lookup, and contractor verification.

Provides a trust/enrichment layer that can be backed by government or open-data sources.
Phase 3: data.gov.il integration when ENABLE_DATAGOV_IL=1.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from src.config.settings import get_settings
from src.services.datagov_provider import DataGovIlProvider

logger = logging.getLogger(__name__)


@dataclass
class NormalizedAddress:
    """Result of address normalization."""

    address: str
    city: str
    street: str | None
    house_number: str | None
    municipality: str | None
    confidence: float
    source: str


@dataclass
class MunicipalityInfo:
    """Municipality metadata for a city."""

    city: str
    municipality_name: str
    district: str | None
    region: str | None


@dataclass
class ContractorVerificationResult:
    """Result of contractor license verification."""

    verified: bool
    confidence: float
    source: str
    verified_at: datetime
    raw_response: dict | None = None


def _is_datagov_enabled(settings: object) -> bool:
    val = getattr(settings, "ENABLE_DATAGOV_IL", "") or ""
    return str(val).lower() in ("1", "true", "yes")


class EnrichmentService:
    """Service for address, municipality, and contractor enrichment.

    Phase 3: Uses data.gov.il when ENABLE_DATAGOV_IL=1. Fallback to stub otherwise.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._datagov: DataGovIlProvider | None = DataGovIlProvider() if _is_datagov_enabled(self._settings) else None

    def normalize_address(self, address: str, city: str) -> NormalizedAddress:
        """Normalize an address to canonical form.

        Returns structured fields and confidence. Uses data.gov.il when enabled.
        """
        address = (address or "").strip()
        city = (city or "").strip()
        if not address or not city:
            return NormalizedAddress(
                address=address or "",
                city=city or "",
                street=None,
                house_number=None,
                municipality=None,
                confidence=0.0,
                source="stub",
            )

        if self._datagov:
            try:
                parts = address.split()
                street = None
                house_num = None
                for i, p in enumerate(parts):
                    if p.isdigit():
                        house_num = p
                        street = " ".join(parts[:i]).strip() if i else None
                        break
                if not street and parts:
                    street = address
                result = self._datagov.normalize_address(
                    city=city,
                    street=street,
                    house_number=house_num,
                    free_text=address,
                )
                if result and result.get("confidence", 0) >= 0.5:
                    return NormalizedAddress(
                        address=result.get("address", address),
                        city=result.get("city", city),
                        street=result.get("street"),
                        house_number=result.get("house_number"),
                        municipality=result.get("municipality"),
                        confidence=float(result.get("confidence", 0.7)),
                        source=result.get("source", "data.gov.il"),
                    )
            except Exception as e:
                logger.warning("data.gov.il normalize_address failed: %s", e)

        return NormalizedAddress(
            address=address,
            city=city,
            street=None,
            house_number=None,
            municipality=None,
            confidence=0.0,
            source="stub",
        )

    def get_municipality_info(self, city: str) -> MunicipalityInfo | None:
        """Get municipality metadata for a city.

        Returns None if not found. Uses data.gov.il when enabled.
        """
        city = (city or "").strip()
        if not city:
            return None

        if self._datagov:
            try:
                result = self._datagov.get_municipality_info(city)
                if result:
                    return MunicipalityInfo(
                        city=result.get("city", city),
                        municipality_name=result.get("municipality_name", city),
                        district=result.get("district"),
                        region=result.get("region"),
                    )
            except Exception as e:
                logger.warning("data.gov.il get_municipality_info failed: %s", e)

        return None

    def search_registered_company(self, business_name: str) -> list[dict[str, Any]]:
        """Search ICA company registry by business name. NOT contractor license verification."""
        if not self._datagov or not (business_name or "").strip():
            return []
        try:
            return self._datagov.search_registered_entity(
                name=business_name.strip(),
                limit=5,
            )
        except Exception as e:
            logger.warning("data.gov.il company search failed: %s", e)
            return []

    def verify_contractor_license(
        self,
        license_number: str,
        business_name: str | None = None,
    ) -> ContractorVerificationResult:
        """Verify a contractor license against a government registry.

        Stub returns verified=False, confidence=0 until API is configured.
        """
        license_number = (license_number or "").strip()
        if not license_number:
            return ContractorVerificationResult(
                verified=False,
                confidence=0.0,
                source="stub",
                verified_at=datetime.now(UTC),
                raw_response={"error": "license_number required"},
            )

        # Phase 3: use data.gov.il company registry to cross-reference business name.
        # NOTE: data.gov.il does not provide official contractor *license* verification.
        # This performs a best-effort business name + company-ID lookup only.
        if self._datagov:
            try:
                matches: list[dict] = []
                # Try searching by company ID (license number may be company registration number)
                if license_number.isdigit():
                    matches = self._datagov.search_registered_entity(
                        name=business_name or "",
                        company_id=license_number,
                        limit=3,
                    )
                # Fall back to name search
                if not matches and business_name:
                    matches = self._datagov.search_registered_entity(
                        name=business_name,
                        limit=3,
                    )
                if matches:
                    best = matches[0]
                    is_active = best.get("status", "") == "פעילה"
                    confidence = 0.75 if is_active else 0.4
                    return ContractorVerificationResult(
                        verified=is_active,
                        confidence=confidence,
                        source="data.gov.il (company registry)",
                        verified_at=datetime.now(UTC),
                        raw_response=best,
                    )
            except Exception as e:
                logger.warning("data.gov.il contractor verification failed: %s", e)

        # No external verification available — return not-verified result
        return ContractorVerificationResult(
            verified=False,
            confidence=0.0,
            source="stub",
            verified_at=datetime.now(UTC),
            raw_response={"license_number": license_number, "business_name": business_name},
        )


_enrichment_service: EnrichmentService | None = None


def get_enrichment_service() -> EnrichmentService:
    """Get or create the singleton EnrichmentService."""
    global _enrichment_service
    if _enrichment_service is None:
        _enrichment_service = EnrichmentService()
    return _enrichment_service
