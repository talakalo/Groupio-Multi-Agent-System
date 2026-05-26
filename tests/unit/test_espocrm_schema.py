"""Espo schema loaded from settings."""

from unittest.mock import MagicMock, patch

from src.integrations.espocrm.schema import EspoSchema


def test_espo_schema_from_settings_defaults() -> None:
    with patch("src.integrations.espocrm.schema.get_settings") as gs:
        gs.return_value = MagicMock(
            ESPOCRM_ENTITY_CONTRACTOR="C_CustomContractor",
            ESPOCRM_ENTITY_BUILDING="C_CustomBuilding",
            ESPOCRM_ENTITY_NOTE="Note",
            ESPOCRM_FIELD_CONTRACTOR_EXTERNAL_ID="cExtId",
            ESPOCRM_FIELD_CONTRACTOR_VERIFICATION="cVer",
            ESPOCRM_FIELD_BUILDING_EXTERNAL_ID="cBld",
            ESPOCRM_FIELD_BUILDING_ADDRESS="cAddr",
            ESPOCRM_FIELD_BUILDING_CITY="cCity",
            ESPOCRM_FIELD_BUILDING_REGION="cReg",
        )
        s = EspoSchema.from_settings()
    assert s.entity_contractor == "C_CustomContractor"
    assert s.field_contractor_external_id == "cExtId"
