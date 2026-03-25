"""EspoCRM entity + field mapping loaded from settings (explicit, testable)."""

from __future__ import annotations

from dataclasses import dataclass

from src.config.settings import get_settings


@dataclass(frozen=True)
class EspoSchema:
    """Maps Groupio concepts to Espo REST entity types and attribute keys."""

    entity_contractor: str
    entity_building: str
    entity_note: str
    field_contractor_external_id: str
    field_contractor_verification: str
    field_building_external_id: str
    field_building_address: str
    field_building_city: str
    field_building_region: str

    @classmethod
    def from_settings(cls) -> EspoSchema:
        s = get_settings()
        return cls(
            entity_contractor=(s.ESPOCRM_ENTITY_CONTRACTOR or "C_GroupioContractor").strip(),
            entity_building=(s.ESPOCRM_ENTITY_BUILDING or "C_GroupioBuilding").strip(),
            entity_note=(s.ESPOCRM_ENTITY_NOTE or "Note").strip(),
            field_contractor_external_id=s.ESPOCRM_FIELD_CONTRACTOR_EXTERNAL_ID.strip(),
            field_contractor_verification=s.ESPOCRM_FIELD_CONTRACTOR_VERIFICATION.strip(),
            field_building_external_id=s.ESPOCRM_FIELD_BUILDING_EXTERNAL_ID.strip(),
            field_building_address=s.ESPOCRM_FIELD_BUILDING_ADDRESS.strip(),
            field_building_city=s.ESPOCRM_FIELD_BUILDING_CITY.strip(),
            field_building_region=s.ESPOCRM_FIELD_BUILDING_REGION.strip(),
        )
