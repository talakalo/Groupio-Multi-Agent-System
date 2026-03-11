"""Unit tests for enrichment service (address, municipality, contractor verification)."""

from src.services.enrichment import (
    ContractorVerificationResult,
    EnrichmentService,
    NormalizedAddress,
    get_enrichment_service,
)


def test_normalize_address_returns_stub():
    """Stub returns input with confidence=0 when no API configured."""
    svc = EnrichmentService()
    result = svc.normalize_address("רחוב הרצל 10", "תל אביב")
    assert isinstance(result, NormalizedAddress)
    assert result.address == "רחוב הרצל 10"
    assert result.city == "תל אביב"
    assert result.confidence == 0.0
    assert result.source == "stub"
    assert result.street is None
    assert result.house_number is None
    assert result.municipality is None


def test_normalize_address_empty_input():
    """Empty address/city returns safe defaults."""
    svc = EnrichmentService()
    result = svc.normalize_address("", "tel aviv")
    assert result.address == ""
    assert result.city == "tel aviv"
    assert result.confidence == 0.0

    result2 = svc.normalize_address("  ", "")
    assert result2.address == ""
    assert result2.city == ""


def test_get_municipality_info_returns_none():
    """Stub returns None when no API configured."""
    svc = EnrichmentService()
    result = svc.get_municipality_info("תל אביב")
    assert result is None


def test_get_municipality_info_empty_city():
    """Empty city returns None."""
    svc = EnrichmentService()
    assert svc.get_municipality_info("") is None
    assert svc.get_municipality_info("   ") is None


def test_verify_contractor_license_returns_stub():
    """Stub returns verified=False, confidence=0 when no API configured."""
    svc = EnrichmentService()
    result = svc.verify_contractor_license("12345", "Acme Ltd")
    assert isinstance(result, ContractorVerificationResult)
    assert result.verified is False
    assert result.confidence == 0.0
    assert result.source == "stub"
    assert result.raw_response is not None
    assert result.raw_response.get("license_number") == "12345"
    assert result.raw_response.get("business_name") == "Acme Ltd"


def test_verify_contractor_license_empty_license():
    """Empty license returns verified=False with error in raw_response."""
    svc = EnrichmentService()
    result = svc.verify_contractor_license("", "Acme")
    assert result.verified is False
    assert result.confidence == 0.0
    assert "error" in (result.raw_response or {})


def test_get_enrichment_service_returns_service():
    """get_enrichment_service returns EnrichmentService instance."""
    svc = get_enrichment_service()
    assert isinstance(svc, EnrichmentService)
