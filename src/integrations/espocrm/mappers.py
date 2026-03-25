"""Map Groupio rows to Espo attribute dicts using explicit schema field names."""

from __future__ import annotations

from typing import Any

from src.integrations.espocrm.schema import EspoSchema


def contractor_to_crm_attributes(contractor: dict[str, Any], schema: EspoSchema) -> dict[str, Any]:
    bid = contractor.get("id") or ""
    name = contractor.get("business_name") or contractor.get("contact_name") or "Contractor"
    attrs: dict[str, Any] = {
        "name": str(name)[:255],
        schema.field_contractor_external_id: str(bid)[:64],
        schema.field_contractor_verification: str(contractor.get("verification_status") or "")[:50],
    }
    # Common optional columns on Account-like / custom entities (omit if not in Espo).
    email = str(contractor.get("email") or "")[:255]
    phone = str(contractor.get("phone") or "")[:50]
    if email:
        attrs["emailAddress"] = email
    if phone:
        attrs["phoneNumber"] = phone
    desc = str(contractor.get("description") or "")[:4000]
    if desc:
        attrs["description"] = desc
    return attrs


def building_to_crm_attributes(building: dict[str, Any], schema: EspoSchema) -> dict[str, Any]:
    bid = building.get("id") or ""
    attrs: dict[str, Any] = {
        "name": str(building.get("name") or building.get("address") or "Building")[:255],
        schema.field_building_external_id: str(bid)[:64],
        schema.field_building_address: str(building.get("address") or "")[:255],
        schema.field_building_city: str(building.get("city") or "")[:100],
        schema.field_building_region: str(building.get("region") or "")[:100],
    }
    return attrs


def escalation_to_note_text(escalation: dict[str, Any]) -> str:
    return (
        f"Groupio escalation {escalation.get('id')}\n"
        f"Priority: {escalation.get('priority')}\n"
        f"Summary: {escalation.get('summary')}\n"
    )[:5000]
