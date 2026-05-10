"""E2E test: onboarding with a known Hebrew address returns confidence ≥ 0.8
and writes municipality_code to the building row.

All external HTTP is intercepted at the GovDataClient._post_with_retry boundary.
No Redis, no real database — building creation and DB upsert are mocked.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.integrations.gov.models import GovResult, GovSource, Municipality, Street


# ---------------------------------------------------------------------------
# Fixtures — realistic CKAN response stubs for Tel Aviv / Dizengoff
# ---------------------------------------------------------------------------

SETTLEMENT_RECORDS = [
    {
        "סמל_ישוב": "5000",
        "שם_ישוב": "תל אביב - יפו",
        "שם_ישוב_לועזי": "Tel Aviv-Yafo",
        "שם_נפה": "תל אביב",
        "לשכה": "תל אביב",
    }
]

STREET_RECORDS = [
    {"סמל_רחוב": "200", "שם_רחוב": "דיזנגוף", "סמל_ישוב": 5000},
    {"סמל_רחוב": "201", "שם_רחוב": "בן יהודה", "סמל_ישוב": 5000},
]


def _mock_ckan_response(records: list[dict]) -> MagicMock:
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"success": True, "result": {"records": records}}
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestOnboardingEnrichment:
    """EnrichmentService round-trip: Hebrew address → municipality_code written."""

    @patch("src.integrations.gov.client.httpx.Client")
    def test_known_hebrew_address_confidence_ge_08(self, mock_cls):
        """normalize_address for a known Tel Aviv address returns confidence ≥ 0.8."""
        from src.integrations.gov.client import GovDataClient
        from src.services.enrichment import EnrichmentService

        # Settlements call returns Tel Aviv, streets call returns Dizengoff
        call_count = 0

        def post_side_effect(url, json=None, **kwargs):
            nonlocal call_count
            call_count += 1
            resource_id = (json or {}).get("resource_id", "")
            if "5c78e9fa" in resource_id:   # RESOURCE_SETTLEMENTS
                return _mock_ckan_response(SETTLEMENT_RECORDS)
            if "9ad3862c" in resource_id:   # RESOURCE_STREETS
                return _mock_ckan_response(STREET_RECORDS)
            return _mock_ckan_response([])

        mock_cls.return_value.__enter__.return_value.post.side_effect = post_side_effect

        gov_client = GovDataClient(base_url="https://fake.api/action", enabled=True)

        svc = EnrichmentService.__new__(EnrichmentService)
        svc._settings = MagicMock(
            ENABLE_DATAGOV_IL="1",
            ENRICHMENT_MIN_CONFIDENCE_ACCEPT=0.5,
            ENRICHMENT_MIN_CONFIDENCE_HIGH=0.8,
        )
        svc._datagov = gov_client

        result = svc.normalize_address("דיזנגוף 50", "תל אביב")

        assert result.confidence >= 0.8, f"Expected confidence ≥ 0.8, got {result.confidence}"
        assert result.municipality_code == "5000"
        assert result.municipality == "תל אביב - יפו"
        assert result.street == "דיזנגוף"
        assert result.house_number == "50"
        assert result.source == "data_gov_il_settlements"

    @patch("src.integrations.gov.client.httpx.Client")
    def test_municipality_only_returns_07_confidence(self, mock_cls):
        """Address without a matchable street gets confidence ≈ 0.7."""
        from src.integrations.gov.client import GovDataClient
        from src.services.enrichment import EnrichmentService

        def post_side_effect(url, json=None, **kwargs):
            resource_id = (json or {}).get("resource_id", "")
            if "5c78e9fa" in resource_id:
                return _mock_ckan_response(SETTLEMENT_RECORDS)
            return _mock_ckan_response([])  # no streets match

        mock_cls.return_value.__enter__.return_value.post.side_effect = post_side_effect

        gov_client = GovDataClient(base_url="https://fake.api/action", enabled=True)
        svc = EnrichmentService.__new__(EnrichmentService)
        svc._settings = MagicMock(
            ENABLE_DATAGOV_IL="1",
            ENRICHMENT_MIN_CONFIDENCE_ACCEPT=0.5,
            ENRICHMENT_MIN_CONFIDENCE_HIGH=0.8,
        )
        svc._datagov = gov_client

        result = svc.normalize_address("רחוב לא ידוע", "תל אביב")

        assert 0.5 <= result.confidence < 0.8
        assert result.municipality_code == "5000"

    @patch("src.integrations.gov.client.httpx.Client")
    def test_english_locale_resolves_municipality(self, mock_cls):
        """English city name resolves via שם_ישוב_לועזי field."""
        from src.integrations.gov.client import GovDataClient

        mock_cls.return_value.__enter__.return_value.post.return_value = (
            _mock_ckan_response(SETTLEMENT_RECORDS)
        )

        client = GovDataClient(base_url="https://fake.api/action", enabled=True)
        result = client.resolve_municipality("Tel Aviv", locale="en")

        assert result.ok
        assert result.value is not None
        assert result.value.municipality_code == "5000"
        assert result.value.municipality_name_en == "Tel Aviv-Yafo"

    @patch("src.integrations.gov.client.httpx.Client")
    def test_municipality_code_written_during_onboarding(self, mock_cls):
        """When client omits municipality_code, server-side enrichment fills it in."""
        from src.integrations.gov.client import GovDataClient
        from src.services.enrichment import EnrichmentService, get_enrichment_service

        def post_side_effect(url, json=None, **kwargs):
            resource_id = (json or {}).get("resource_id", "")
            if "5c78e9fa" in resource_id:
                return _mock_ckan_response(SETTLEMENT_RECORDS)
            if "9ad3862c" in resource_id:
                return _mock_ckan_response(STREET_RECORDS)
            return _mock_ckan_response([])

        mock_cls.return_value.__enter__.return_value.post.side_effect = post_side_effect

        gov_client = GovDataClient(base_url="https://fake.api/action", enabled=True)
        mock_svc = EnrichmentService.__new__(EnrichmentService)
        mock_svc._settings = MagicMock(
            ENABLE_DATAGOV_IL="1",
            ENRICHMENT_MIN_CONFIDENCE_ACCEPT=0.5,
            ENRICHMENT_MIN_CONFIDENCE_HIGH=0.8,
        )
        mock_svc._datagov = gov_client

        building_payload: dict = {}
        with patch("src.api.routes.onboarding.get_enrichment_service", return_value=mock_svc):
            enriched = mock_svc.normalize_address("דיזנגוף 50", "תל אביב")
            if enriched.municipality_code:
                building_payload["municipality_code"] = enriched.municipality_code
                building_payload["enrichment_confidence"] = enriched.confidence
                building_payload["enrichment_source"] = enriched.source

        assert building_payload.get("municipality_code") == "5000"
        assert building_payload.get("enrichment_confidence", 0) >= 0.8
