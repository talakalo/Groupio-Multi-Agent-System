"""Unit tests for src.integrations.gov.models."""

from src.integrations.gov.models import Company, GovSource


class TestCompany:
    def test_is_active_when_status_is_peila(self):
        c = Company("1", "test", "פעילה", "תל אביב", "רחוב 1")
        assert c.is_active is True

    def test_not_active_for_other_status(self):
        c = Company("1", "test", "מחוקה", "תל אביב", "רחוב 1")
        assert c.is_active is False


class TestGovSource:
    def test_string_values(self):
        assert GovSource.DATA_GOV_IL_COMPANIES == "data_gov_il_companies"
        assert GovSource.DATA_GOV_IL_STREETS == "data_gov_il_streets"
        assert GovSource.DATA_GOV_IL_SETTLEMENTS == "data_gov_il_settlements"
        assert GovSource.INTERNAL_STUB == "internal_stub"
        assert GovSource.DISABLED == "disabled"
