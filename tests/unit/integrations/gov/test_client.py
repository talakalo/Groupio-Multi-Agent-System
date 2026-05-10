"""Unit tests for src.integrations.gov.client.GovDataClient."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.integrations.gov.client import GovDataClient, _fuzzy_match, _normalize_hebrew
from src.integrations.gov.models import GovSource


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
    def test_exact(self):
        assert _fuzzy_match("תל אביב", "תל אביב") is True

    def test_substring(self):
        assert _fuzzy_match("תל", "תל אביב") is True

    def test_no_match(self):
        assert _fuzzy_match("חיפה", "תל אביב") is False

    def test_empty_a(self):
        assert _fuzzy_match("", "תל אביב") is False

    def test_empty_b(self):
        assert _fuzzy_match("תל אביב", "") is False

    def test_none_input(self):
        assert _fuzzy_match(None, "test") is False  # type: ignore[arg-type]


class TestGovDataClientDisabled:
    def test_disabled_lookup_company(self):
        client = GovDataClient(enabled=False)
        result = client.lookup_company("some company")
        assert not result.ok
        assert result.source == GovSource.DISABLED

    def test_disabled_resolve_municipality(self):
        client = GovDataClient(enabled=False)
        result = client.resolve_municipality("תל אביב")
        assert not result.ok
        assert result.source == GovSource.DISABLED

    def test_disabled_resolve_street(self):
        client = GovDataClient(enabled=False)
        result = client.resolve_street("תל אביב", "דיזנגוף")
        assert not result.ok
        assert result.source == GovSource.DISABLED

    def test_disabled_normalize_address(self):
        client = GovDataClient(enabled=False)
        result = client.normalize_address("תל אביב", "דיזנגוף", "5")
        assert not result.ok
        assert result.source == GovSource.DISABLED


class TestLookupCompany:
    def _client(self):
        return GovDataClient(base_url="https://fake.api/action", enabled=True)

    @patch("src.integrations.gov.client.httpx.Client")
    def test_returns_matching_companies(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {
                        "מספר חברה": "12345",
                        "שם חברה": "חברה לדוגמה",
                        "סטטוס חברה": "פעילה",
                        "שם עיר": "תל אביב",
                        "שם רחוב": "דיזנגוף",
                        "מספר בית": "5",
                    }
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().lookup_company("חברה לדוגמה")
        assert result.ok
        assert result.value is not None
        assert len(result.value) == 1
        assert result.value[0].company_id == "12345"
        assert result.value[0].is_active is True
        assert result.source == GovSource.DATA_GOV_IL_COMPANIES

    @patch("src.integrations.gov.client.httpx.Client")
    def test_filters_non_matching_names(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {
                        "מספר חברה": "99",
                        "שם חברה": "חברה אחרת לגמרי",
                        "סטטוס חברה": "פעילה",
                        "שם עיר": "",
                        "שם רחוב": "",
                        "מספר בית": "",
                    }
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().lookup_company("XYZ בלתי קשורה")
        assert result.ok
        assert result.value == []

    @patch("src.integrations.gov.client.httpx.Client")
    def test_timeout_returns_error_result(self, mock_cls):
        import httpx as _httpx

        mock_cls.return_value.__enter__.return_value.post.side_effect = _httpx.TimeoutException("timeout")

        result = self._client().lookup_company("some name")
        assert not result.ok
        assert result.error is not None
        assert result.source == GovSource.DATA_GOV_IL_COMPANIES

    @patch("src.integrations.gov.client.httpx.Client")
    def test_success_false_raises_bad_response(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": False}
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().lookup_company("some name")
        assert not result.ok
        assert result.error is not None


class TestResolveMunicipality:
    def _client(self):
        return GovDataClient(base_url="https://fake.api/action", enabled=True)

    @patch("src.integrations.gov.client.httpx.Client")
    def test_found(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {
                        "סמל_ישוב": "5000",
                        "שם_ישוב": "תל אביב",
                        "שם_נפה": "תל אביב",
                        "לשכה": "תל אביב",
                    }
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().resolve_municipality("תל אביב")
        assert result.ok
        assert result.value is not None
        assert result.value.municipality_code == "5000"
        assert result.value.municipality_name_he == "תל אביב"
        assert result.source == GovSource.DATA_GOV_IL_SETTLEMENTS

    @patch("src.integrations.gov.client.httpx.Client")
    def test_not_found(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": True, "result": {"records": []}}
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().resolve_municipality("עיר לא קיימת")
        assert not result.ok
        assert result.error == "city not found"

    def test_empty_city_returns_error(self):
        result = self._client().resolve_municipality("")
        assert not result.ok


class TestNormalizeAddress:
    def _client(self):
        return GovDataClient(base_url="https://fake.api/action", enabled=True)

    @patch.object(GovDataClient, "resolve_municipality")
    @patch.object(GovDataClient, "resolve_street")
    def test_full_match_high_confidence(self, mock_street, mock_muni):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult, Municipality, Street

        mock_muni.return_value = GovResult(
            value=Municipality("5000", "תל אביב", None, "תל אביב", "תל אביב"),
            confidence=0.9,
            source=GovSource.DATA_GOV_IL_SETTLEMENTS,
            fetched_at=datetime.now(UTC),
        )
        mock_street.return_value = GovResult(
            value=Street("200", "דיזנגוף", "תל אביב"),
            confidence=0.85,
            source=GovSource.DATA_GOV_IL_STREETS,
            fetched_at=datetime.now(UTC),
        )

        result = self._client().normalize_address("תל אביב", "דיזנגוף", "5")
        assert result.ok
        assert result.confidence == 0.85
        assert result.value is not None
        assert result.value.street == "דיזנגוף"
        assert result.value.municipality_code == "5000"

    @patch.object(GovDataClient, "resolve_municipality")
    def test_municipality_not_found_returns_error(self, mock_muni):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult

        mock_muni.return_value = GovResult(
            value=None,
            confidence=0.0,
            source=GovSource.DATA_GOV_IL_SETTLEMENTS,
            fetched_at=datetime.now(UTC),
            error="city not found",
        )

        result = self._client().normalize_address("עיר לא קיימת", "רחוב")
        assert not result.ok


class TestGovResultModel:
    def test_ok_when_value_and_no_error(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult

        r = GovResult(value="x", confidence=0.9, source=GovSource.DATA_GOV_IL_COMPANIES, fetched_at=datetime.now(UTC))
        assert r.ok is True

    def test_not_ok_when_value_none(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult

        r = GovResult(value=None, confidence=0.0, source=GovSource.DISABLED, fetched_at=datetime.now(UTC))
        assert r.ok is False

    def test_not_ok_when_error_set(self):
        from datetime import UTC, datetime

        from src.integrations.gov.models import GovResult

        r = GovResult(
            value="x", confidence=0.0, source=GovSource.INTERNAL_STUB,
            fetched_at=datetime.now(UTC), error="boom",
        )
        assert r.ok is False


# ---------------------------------------------------------------------------
# M3 — locale support + rapidfuzz matching
# ---------------------------------------------------------------------------

class TestFuzzyHelpers:
    """Tests for the M3-added _street_match and _city_match helpers."""

    def test_street_match_exact(self):
        from src.integrations.gov.client import _street_match
        assert _street_match("דיזנגוף", "דיזנגוף") is True

    def test_street_match_prefix(self):
        from src.integrations.gov.client import _street_match
        assert _street_match("דיזנגו", "דיזנגוף") is True

    def test_street_match_below_threshold(self):
        from src.integrations.gov.client import _street_match
        assert _street_match("חיפה", "דיזנגוף", threshold=95) is False

    def test_city_match_exact_normalized(self):
        from src.integrations.gov.client import _city_match
        assert _city_match("תל אביב", "תל אביב - יפו") is True

    def test_city_match_english_close(self):
        from src.integrations.gov.client import _city_match
        assert _city_match("Tel Aviv", "Tel-Aviv") is True

    def test_city_match_no_match(self):
        from src.integrations.gov.client import _city_match
        assert _city_match("Haifa", "Beer Sheva") is False


class TestResolveMunicipalityLocale:
    def _client(self):
        return GovDataClient(base_url="https://fake.api/action", enabled=True)

    @patch("src.integrations.gov.client.httpx.Client")
    def test_english_locale_matches_laaz_field(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {
                        "סמל_ישוב": "5000",
                        "שם_ישוב": "תל אביב - יפו",
                        "שם_ישוב_לועזי": "Tel Aviv-Yafo",
                        "שם_נפה": "תל אביב",
                        "לשכה": "תל אביב",
                    }
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().resolve_municipality("Tel Aviv", locale="en")
        assert result.ok
        assert result.value is not None
        assert result.value.municipality_code == "5000"
        assert result.value.municipality_name_he == "תל אביב - יפו"
        assert result.value.municipality_name_en == "Tel Aviv-Yafo"

    @patch("src.integrations.gov.client.httpx.Client")
    def test_municipality_name_en_populated_on_hebrew_locale(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {
                        "סמל_ישוב": "3000",
                        "שם_ישוב": "ירושלים",
                        "שם_ישוב_לועזי": "Jerusalem",
                        "שם_נפה": "ירושלים",
                        "לשכה": "ירושלים",
                    }
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().resolve_municipality("ירושלים", locale="he")
        assert result.ok
        assert result.value.municipality_name_en == "Jerusalem"

    def test_locale_en_empty_city_returns_error(self):
        result = self._client().resolve_municipality("", locale="en")
        assert not result.ok


class TestResolveStreetRapidfuzz:
    def _client(self):
        return GovDataClient(base_url="https://fake.api/action", enabled=True)

    @patch("src.integrations.gov.client.httpx.Client")
    def test_fuzzy_match_picks_best_score(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {"סמל_רחוב": "100", "שם_רחוב": "הירקון", "סמל_ישוב": 5000},
                    {"סמל_רחוב": "101", "שם_רחוב": "בן יהודה", "סמל_ישוב": 5000},
                    {"סמל_רחוב": "102", "שם_רחוב": "דיזנגוף", "סמל_ישוב": 5000},
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().resolve_street("תל אביב", "הירקו", municipality_code="5000")
        assert result.ok
        assert result.value is not None
        assert result.value.street_name == "הירקון"
        assert result.confidence >= 0.7

    @patch("src.integrations.gov.client.httpx.Client")
    def test_no_match_below_threshold(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [
                    {"סמל_רחוב": "100", "שם_רחוב": "הירקון", "סמל_ישוב": 5000},
                ]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        result = self._client().resolve_street("תל אביב", "שם רחוב שונה לגמרי", municipality_code="5000")
        assert not result.ok
        assert result.error == "street not found"

    def test_empty_street_returns_error(self):
        result = self._client().resolve_street("תל אביב", "")
        assert not result.ok


class TestCacheIntegration:
    """Verify cache hit/miss semantics on GovDataClient methods."""

    @patch("src.integrations.gov.client.httpx.Client")
    def test_second_municipality_call_is_cache_hit(self, mock_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "result": {
                "records": [{"סמל_ישוב": "5000", "שם_ישוב": "תל אביב",
                              "שם_ישוב_לועזי": None, "שם_נפה": None, "לשכה": None}]
            },
        }
        mock_resp.raise_for_status = MagicMock()
        mock_cls.return_value.__enter__.return_value.post.return_value = mock_resp

        client = GovDataClient(base_url="https://fake.api/action", enabled=True)
        r1 = client.resolve_municipality("תל אביב")
        r2 = client.resolve_municipality("תל אביב")

        assert r1.ok and r2.ok
        assert not r1.cache_hit
        assert r2.cache_hit
        # HTTP was only called once
        assert mock_cls.return_value.__enter__.return_value.post.call_count == 1
