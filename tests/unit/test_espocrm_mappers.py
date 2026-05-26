"""EspoCRM field mappers."""

from src.integrations.espocrm import mappers
from src.integrations.espocrm.schema import EspoSchema


def _schema() -> EspoSchema:
    return EspoSchema(
        entity_contractor="C_GroupioContractor",
        entity_building="C_GroupioBuilding",
        entity_note="Note",
        field_contractor_external_id="cGroupioContractorId",
        field_contractor_verification="cGroupioVerificationStatus",
        field_building_external_id="cGroupioBuildingId",
        field_building_address="cGroupioAddress",
        field_building_city="cGroupioCity",
        field_building_region="cGroupioRegion",
    )


def test_contractor_to_crm_attributes() -> None:
    schema = _schema()
    attrs = mappers.contractor_to_crm_attributes(
        {
            "id": "c1",
            "business_name": "ACME",
            "verification_status": "pending",
            "email": "a@b.c",
            "phone": "050",
            "description": "d",
        },
        schema,
    )
    assert attrs[schema.field_contractor_external_id] == "c1"
    assert attrs[schema.field_contractor_verification] == "pending"


def test_building_to_crm_attributes() -> None:
    schema = _schema()
    attrs = mappers.building_to_crm_attributes(
        {"id": "b1", "name": "Tower", "address": "1 St", "city": "TLV", "region": "center"},
        schema,
    )
    assert attrs[schema.field_building_external_id] == "b1"
