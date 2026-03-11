"""Enrichment service for address normalization, municipality lookup, and contractor verification.

Provides a trust/enrichment layer that can be backed by government or open-data sources.
Stub implementations return safe defaults until real APIs are configured via env vars.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from src.config.settings import get_settings

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


class EnrichmentService:
    """Service for address, municipality, and contractor enrichment.

    Stub implementations return safe defaults. Wire real APIs by setting
    GOV_ADDRESS_API_URL, GOV_CONTRACTOR_API_URL in settings.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    def normalize_address(self, address: str, city: str) -> NormalizedAddress:
        """Normalize an address to canonical form.

        Returns structured fields and confidence. Stub returns input with confidence=0.
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

        # Stub: no external API configured
        api_url = self._settings.GOV_ADDRESS_API_URL or ""
        if not api_url:
            return NormalizedAddress(
                address=address,
                city=city,
                street=None,
                house_number=None,
                municipality=None,
                confidence=0.0,
                source="stub",
            )

        # Placeholder for future: call external API
        # result = await self._call_address_api(api_url, address, city)
        logger.debug("Address API URL configured but not implemented: %s", api_url[:50])
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

        Returns None if not found or no data source configured.
        """
        city = (city or "").strip()
        if not city:
            return None

        # Stub: no reference data or API
        api_url = self._settings.GOV_MUNICIPALITY_API_URL or ""
        if not api_url:
            return None

        # Placeholder for future
        logger.debug("Municipality API URL configured but not implemented: %s", api_url[:50])
        return None

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

        # Stub: no external API configured
        api_url = self._settings.GOV_CONTRACTOR_API_URL or ""
        if not api_url:
            return ContractorVerificationResult(
                verified=False,
                confidence=0.0,
                source="stub",
                verified_at=datetime.now(UTC),
                raw_response={"license_number": license_number, "business_name": business_name},
            )

        # Placeholder for future: call external API
        logger.debug("Contractor API URL configured but not implemented: %s", api_url[:50])
        return ContractorVerificationResult(
            verified=False,
            confidence=0.0,
            source="stub",
            verified_at=datetime.now(UTC),
            raw_response={"license_number": license_number},
        )


_enrichment_service: EnrichmentService | None = None


def get_enrichment_service() -> EnrichmentService:
    """Get or create the singleton EnrichmentService."""
    global _enrichment_service
    if _enrichment_service is None:
        _enrichment_service = EnrichmentService()
    return _enrichment_service
