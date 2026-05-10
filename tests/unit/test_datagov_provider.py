"""Tests for the deprecated datagov_provider shim.

Implementation details have moved to src.integrations.gov — see
tests/unit/integrations/gov/test_client.py for comprehensive coverage.
These tests verify the shim correctly delegates to GovDataClient.
"""

import warnings
from unittest.mock import MagicMock

# Import helpers that are still re-exported from the shim
with warnings.catch_warnings():
    warnings.simplefilter("ignore", DeprecationWarning)
    from src.services.datagov_provider import (
        DataGovIlProvider,
        _fuzzy_match,
        _normalize_hebrew,
    )


class TestNormalizeHebrew:
    def test_none_returns_empty(self):
        assert _normalize_hebrew(None) == ""

    def test_empty_string(self):
        assert _normalize_hebrew("") == ""

    def test_strips_whitespace(self):
        assert _normalize_hebrew("  תל אביב  ") == "תל אביב"

    def test_removes_lrm_rlm(self):
        assert _normalize_hebrew("‎תל אביב‏") == "תל אביב"

    def test_non_string(self):
        assert _normalize_hebrew(123) == ""  # type: ignore[arg-type]


class TestFuzzyMatch:
    def test_exact_match(self):
        assert _fuzzy_match("תל אביב", "תל אביב") is True

    def test_substring_match(self):
        assert _fuzzy_match("תל", "תל אביב") is True

    def test_no_match(self):
        assert _fuzzy_match("חיפה", "תל אביב") is False

    def test_empty_a(self):
        assert _fuzzy_match("", "תל אביב") is False

    def test_empty_b(self):
        assert _fuzzy_match("תל אביב", "") is False

    def test_both_empty(self):
        assert _fuzzy_match("", "") is False

    def test_none_input(self):
        assert _fuzzy_match(None, "test") is False  # type: ignore[arg-type]


class TestDataGovIlProviderShim:
    def _provider(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            return DataGovIlProvider(base_url="https://fake.api/action", timeout=1.0)

    def test_get_municipality_info_empty_city(self):
        p = self._provider()
        assert p.get_municipality_info("") is None

    def test_get_municipality_info_not_found(self):
        p = self._provider()
        p._client.resolve_municipality = MagicMock(return_value=MagicMock(ok=False, value=None, error="city not found"))
        assert p.get_municipality_info("עיר שלא קיימת") is None

    def test_get_municipality_info_found_delegates(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult, GovSource, Municipality

        p = self._provider()
        p._client.resolve_municipality = MagicMock(
            return_value=GovResult(
                value=Municipality("5000", "תל אביב - יפו", None, "תל אביב", "תל אביב"),
                confidence=0.9,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=datetime.now(UTC),
            )
        )
        result = p.get_municipality_info("תל אביב")
        assert result is not None
        assert result["city"] == "תל אביב - יפו"
        assert result["symbol"] == "5000"

    def test_normalize_address_empty_city(self):
        p = self._provider()
        assert p.normalize_address(city="") is None

    def test_normalize_address_no_municipality(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult, GovSource

        p = self._provider()
        p._client.normalize_address = MagicMock(
            return_value=GovResult(
                value=None,
                confidence=0.0,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=datetime.now(UTC),
                error="city not found",
            )
        )
        assert p.normalize_address(city="nowhere") is None

    def test_normalize_address_delegates_result(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult, GovSource, NormalizedAddressResult

        p = self._provider()
        p._client.normalize_address = MagicMock(
            return_value=GovResult(
                value=NormalizedAddressResult("הירקון 15 תל אביב", "תל אביב", "הירקון", "15", "תל אביב", "5000"),
                confidence=0.85,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=datetime.now(UTC),
            )
        )
        result = p.normalize_address(city="תל אביב", street="הירקון", house_number="15")
        assert result is not None
        assert result["confidence"] == 0.85
        assert result["street"] == "הירקון"

    def test_search_registered_entity_empty_name(self):
        p = self._provider()
        assert p.search_registered_entity("") == []

    def test_search_registered_entity_delegates(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import Company, GovResult, GovSource

        p = self._provider()
        p._client.lookup_company = MagicMock(
            return_value=GovResult(
                value=[Company("123456", "חברת בדיקה", "פעילה", "חיפה", "הרצל 10")],
                confidence=0.8,
                source=GovSource.DATA_GOV_IL_COMPANIES,
                fetched_at=datetime.now(UTC),
            )
        )
        result = p.search_registered_entity("חברת בדיקה", company_id="123456")
        assert len(result) == 1
        assert result[0]["company_id"] == "123456"
        assert result[0]["name"] == "חברת בדיקה"
