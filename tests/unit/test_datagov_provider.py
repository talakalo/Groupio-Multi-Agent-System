"""Unit tests for src.services.datagov_provider."""

from unittest.mock import MagicMock, patch

import httpx

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
        assert _normalize_hebrew("\u200eתל אביב\u200f") == "תל אביב"

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


class TestDataGovIlProvider:
    def _provider(self):
        return DataGovIlProvider(base_url="https://fake.api/action", timeout=1.0)

    @patch("src.services.datagov_provider.httpx.Client")
    def test_post_success(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": True, "result": {"records": [{"a": 1}]}}
        mock_resp.raise_for_status = MagicMock()
        mock_client = MagicMock()
        mock_client.post.return_value = mock_resp
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        p = self._provider()
        result = p._post("datastore_search", {"resource_id": "test"})
        assert result == {"records": [{"a": 1}]}

    @patch("src.services.datagov_provider.httpx.Client")
    def test_post_http_error(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client.post.side_effect = httpx.HTTPError("timeout")
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        p = self._provider()
        assert p._post("datastore_search", {}) is None

    @patch("src.services.datagov_provider.httpx.Client")
    def test_post_success_false(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": False}
        mock_resp.raise_for_status = MagicMock()
        mock_client = MagicMock()
        mock_client.post.return_value = mock_resp
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        p = self._provider()
        assert p._post("test", {}) is None

    def test_datastore_search_empty_result(self):
        p = self._provider()
        p._post = MagicMock(return_value=None)
        assert p.datastore_search("res123") == []

    def test_datastore_search_with_records(self):
        p = self._provider()
        p._post = MagicMock(return_value={"records": [{"id": 1}]})
        assert p.datastore_search("res123") == [{"id": 1}]

    def test_datastore_search_with_q_and_filters(self):
        p = self._provider()
        p._post = MagicMock(return_value={"records": []})
        result = p.datastore_search("res123", filters={"a": "b"}, fields=["c"], q="test")
        assert result == []

    def test_get_municipality_info_empty_city(self):
        p = self._provider()
        assert p.get_municipality_info("") is None

    def test_get_municipality_info_found(self):
        p = self._provider()
        p.datastore_search = MagicMock(
            return_value=[
                {
                    "סמל_ישוב": "5000",
                    "שם_ישוב": "תל אביב - יפו",
                    "שם_נפה": "תל אביב",
                    "לשכה": "תל אביב",
                }
            ]
        )
        result = p.get_municipality_info("תל אביב")
        assert result is not None
        assert result["city"] == "תל אביב - יפו"

    def test_get_municipality_info_not_found(self):
        p = self._provider()
        p.datastore_search = MagicMock(return_value=[])
        assert p.get_municipality_info("עיר שלא קיימת") is None

    def test_normalize_address_empty_city(self):
        p = self._provider()
        assert p.normalize_address(city="") is None

    def test_normalize_address_no_municipality(self):
        p = self._provider()
        p.get_municipality_info = MagicMock(return_value=None)
        assert p.normalize_address(city="nowhere") is None

    def test_normalize_address_no_symbol(self):
        p = self._provider()
        p.get_municipality_info = MagicMock(return_value={"symbol": "", "municipality_name": "Test"})
        result = p.normalize_address(city="Test", street="Main")
        assert result is not None
        assert result["confidence"] == 0.6

    def test_normalize_address_with_street_match(self):
        p = self._provider()
        p.get_municipality_info = MagicMock(return_value={"symbol": "5000", "municipality_name": "תל אביב"})
        p.datastore_search = MagicMock(return_value=[{"שם_רחוב": "הירקון", "סמל_רחוב": "100"}])
        result = p.normalize_address(city="תל אביב", street="הירקון", house_number="15")
        assert result is not None
        assert result["confidence"] == 0.85
        assert result["street"] == "הירקון"

    def test_search_registered_entity_empty_name(self):
        p = self._provider()
        assert p.search_registered_entity("") == []

    def test_search_registered_entity_with_company_id(self):
        p = self._provider()
        p.datastore_search = MagicMock(
            return_value=[
                {
                    "מספר חברה": "123456",
                    "שם חברה": "חברת בדיקה",
                    "סטטוס חברה": "פעילה",
                    "שם עיר": "חיפה",
                    "שם רחוב": "הרצל",
                    "מספר בית": "10",
                }
            ]
        )
        result = p.search_registered_entity("חברת בדיקה", company_id="123456")
        assert len(result) == 1
        assert result[0]["company_id"] == "123456"

    def test_search_registered_entity_fuzzy_filter(self):
        p = self._provider()
        p.datastore_search = MagicMock(
            return_value=[
                {
                    "מספר חברה": "1",
                    "שם חברה": "חברת בדיקה",
                    "סטטוס חברה": "פעילה",
                    "שם עיר": "",
                    "שם רחוב": "",
                    "מספר בית": "",
                },
                {
                    "מספר חברה": "2",
                    "שם חברה": "חברה אחרת לגמרי",
                    "סטטוס חברה": "פעילה",
                    "שם עיר": "",
                    "שם רחוב": "",
                    "מספר בית": "",
                },
            ]
        )
        result = p.search_registered_entity("בדיקה")
        assert len(result) == 1
        assert result[0]["company_id"] == "1"
