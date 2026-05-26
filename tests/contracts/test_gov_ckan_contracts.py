"""CKAN schema-drift guardrails for data.gov.il API contracts.

Each test loads a pre-recorded fixture file and asserts:
1. Top-level shape (success, result.fields, result.records) is intact.
2. All Hebrew column names the client code depends on are present.
3. GovDataClient maps the fixture into the expected typed models.

These tests serve as early-warning detectors: if the live CKAN API adds,
renames, or removes a field the fixture drifts from reality and CI fails.
Update the fixture file (and possibly the client) when a drift is intentional.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

FIXTURES = Path(__file__).parent.parent / "fixtures" / "gov"


# ---------------------------------------------------------------------------
# Fixture loader helpers
# ---------------------------------------------------------------------------


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _mock_post(fixture_name: str):
    """Return a mock httpx client whose .post() returns the named fixture."""
    data = _load(fixture_name)
    resp = MagicMock()
    resp.json.return_value = data
    resp.raise_for_status = MagicMock()
    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    client.post.return_value = resp
    return client


# ---------------------------------------------------------------------------
# Settlements fixture
# ---------------------------------------------------------------------------


class TestSettlementsContract:
    def test_top_level_shape(self):
        d = _load("ckan_settlements.json")
        assert d["success"] is True
        assert "result" in d
        assert "fields" in d["result"]
        assert "records" in d["result"]

    def test_required_hebrew_columns_present(self):
        d = _load("ckan_settlements.json")
        fields = {f["id"] for f in d["result"]["fields"]}
        required = {"סמל_ישוב", "שם_ישוב", "שם_ישוב_לועזי", "שם_נפה", "לשכה"}
        missing = required - fields
        assert not missing, f"Missing settlement columns: {missing}"

    def test_records_have_required_columns(self):
        d = _load("ckan_settlements.json")
        for rec in d["result"]["records"]:
            assert "סמל_ישוב" in rec
            assert "שם_ישוב" in rec
            assert "שם_ישוב_לועזי" in rec

    def test_client_maps_to_municipality(self):
        from src.integrations.gov.client import GovDataClient

        with patch("src.integrations.gov.client.httpx.Client", return_value=_mock_post("ckan_settlements.json")):
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            result = client.resolve_municipality("תל אביב", locale="he")

        assert result.ok
        assert result.value is not None
        assert result.value.municipality_code == "5000"
        assert result.value.municipality_name_he == "תל אביב - יפו"
        assert result.value.municipality_name_en == "Tel Aviv-Yafo"

    def test_client_locale_en_maps_to_municipality(self):
        from src.integrations.gov.client import GovDataClient

        with patch("src.integrations.gov.client.httpx.Client", return_value=_mock_post("ckan_settlements.json")):
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            result = client.resolve_municipality("Tel Aviv", locale="en")

        assert result.ok
        assert result.value is not None
        assert result.value.municipality_code == "5000"


# ---------------------------------------------------------------------------
# Streets fixture
# ---------------------------------------------------------------------------


class TestStreetsContract:
    def test_top_level_shape(self):
        d = _load("ckan_streets.json")
        assert d["success"] is True
        assert "result" in d
        assert "records" in d["result"]

    def test_required_hebrew_columns_present(self):
        d = _load("ckan_streets.json")
        fields = {f["id"] for f in d["result"]["fields"]}
        required = {"סמל_ישוב", "שם_רחוב", "סמל_רחוב"}
        missing = required - fields
        assert not missing, f"Missing street columns: {missing}"

    def test_records_have_required_columns(self):
        d = _load("ckan_streets.json")
        for rec in d["result"]["records"]:
            assert "שם_רחוב" in rec
            assert "סמל_ישוב" in rec

    def test_client_maps_to_street(self):
        from src.integrations.gov.client import GovDataClient

        # Streets lookup requires municipality_code — use two-call pattern:
        # first settlements (to get code), then streets.
        settlements_data = _load("ckan_settlements.json")
        streets_data = _load("ckan_streets.json")

        call_count = 0

        def post_side_effect(url, json=None, **kwargs):
            nonlocal call_count
            call_count += 1
            resource_id = (json or {}).get("resource_id", "")
            resp = MagicMock()
            resp.raise_for_status = MagicMock()
            if "5c78e9fa" in resource_id:
                resp.json.return_value = settlements_data
            else:
                resp.json.return_value = streets_data
            return resp

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = post_side_effect

        with patch("src.integrations.gov.client.httpx.Client", return_value=mock_client):
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            result = client.resolve_street("תל אביב", "דיזנגוף", municipality_code="5000")

        assert result.ok
        assert result.value is not None
        assert result.value.street_name == "דיזנגוף"


# ---------------------------------------------------------------------------
# Companies fixture
# ---------------------------------------------------------------------------


class TestCompaniesContract:
    def test_top_level_shape(self):
        d = _load("ckan_companies.json")
        assert d["success"] is True
        assert "result" in d
        assert "records" in d["result"]

    def test_required_hebrew_columns_present(self):
        d = _load("ckan_companies.json")
        fields = {f["id"] for f in d["result"]["fields"]}
        # These are the exact field names the GovDataClient reads from CKAN
        required = {"מספר חברה", "שם חברה", "סטטוס חברה", "שם עיר"}
        missing = required - fields
        assert not missing, f"Missing company columns: {missing}"

    def test_records_have_required_columns(self):
        d = _load("ckan_companies.json")
        for rec in d["result"]["records"]:
            assert "מספר חברה" in rec
            assert "שם חברה" in rec
            assert "סטטוס חברה" in rec

    def test_active_company_is_active(self):
        d = _load("ckan_companies.json")
        active = [r for r in d["result"]["records"] if r["סטטוס חברה"] == "פעילה"]
        assert len(active) >= 1, "Fixture must contain at least one active company"

    def test_inactive_company_present(self):
        d = _load("ckan_companies.json")
        inactive = [r for r in d["result"]["records"] if r["סטטוס חברה"] != "פעילה"]
        assert len(inactive) >= 1, "Fixture must contain at least one non-active company"

    def test_client_maps_to_company_active(self):
        from src.integrations.gov.client import GovDataClient

        with patch("src.integrations.gov.client.httpx.Client", return_value=_mock_post("ckan_companies.json")):
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            # Name matches the fixture record closely enough for fuzzy threshold
            result = client.lookup_company(name="חברת בניה לדוגמה", limit=5)

        assert result.ok
        assert result.value is not None
        assert len(result.value) >= 1
        best = result.value[0]
        assert best.is_active is True
        assert best.company_id == "12345678"

    def test_client_maps_inactive_company(self):
        from src.integrations.gov.client import GovDataClient

        # Return only the inactive record
        inactive_data = _load("ckan_companies.json")
        inactive_data = dict(inactive_data)
        inactive_data["result"] = dict(inactive_data["result"])
        inactive_data["result"]["records"] = [
            r for r in inactive_data["result"]["records"] if r["סטטוס חברה"] != "פעילה"
        ]

        resp = MagicMock()
        resp.json.return_value = inactive_data
        resp.raise_for_status = MagicMock()
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = resp

        with patch("src.integrations.gov.client.httpx.Client", return_value=mock_client):
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            result = client.lookup_company(name="חברה מחוקה לדוגמה", limit=5)

        assert result.ok
        assert result.value is not None
        assert result.value[0].is_active is False


# ---------------------------------------------------------------------------
# Cross-fixture: GovResult shape invariants
# ---------------------------------------------------------------------------


class TestGovResultContract:
    def test_ok_property_true_when_value_and_no_error(self):
        from src.integrations.gov.client import GovDataClient

        with patch("src.integrations.gov.client.httpx.Client", return_value=_mock_post("ckan_settlements.json")):
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            result = client.resolve_municipality("תל אביב")

        assert result.ok is True
        assert result.error is None
        assert result.value is not None

    def test_disabled_client_returns_not_ok(self):
        from src.integrations.gov.client import GovDataClient

        client = GovDataClient(base_url="https://fake.api/action", enabled=False)
        result = client.resolve_municipality("תל אביב")

        assert result.ok is False

    def test_cache_hit_flag_on_second_call(self):
        from src.integrations.gov.client import GovDataClient

        mock_http = _mock_post("ckan_settlements.json")
        with patch("src.integrations.gov.client.httpx.Client", return_value=mock_http) as mock_cls:
            client = GovDataClient(base_url="https://fake.api/action", enabled=True)
            first = client.resolve_municipality("ירושלים")
            second = client.resolve_municipality("ירושלים")

        assert first.cache_hit is False
        assert second.cache_hit is True
        # HTTP client only called once
        actual_client = mock_cls.return_value.__enter__.return_value
        assert actual_client.post.call_count == 1
