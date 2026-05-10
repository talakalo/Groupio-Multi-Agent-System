"""Onboarding API route — POST /api/v1/onboarding.

Allows a newly-signed-up user to complete their profile by:
  - Residents: selecting (or auto-creating) their building and apartment.
  - Contractors: registering their business details.

After a successful call the user is considered onboarded (onboarded_at is set)
and may proceed to /dashboard or /contractor/dashboard.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB, UserResponse
from src.services.enrichment import get_enrichment_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["onboarding"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ResidentBuilding(BaseModel):
    # Accept camelCase from the frontend while keeping snake_case internals.
    model_config = ConfigDict(populate_by_name=True)

    building_address: str = Field(..., alias="buildingAddress", min_length=2, max_length=500)
    city: str = Field(..., min_length=1, max_length=100)
    region: str = Field(..., min_length=1, max_length=50)
    apartment_number: str = Field(..., alias="apartmentNumber", min_length=1, max_length=20)
    building_type: str = Field("new_residential", alias="buildingType", max_length=50)
    # Phase 2: optional enrichment from address normalization
    municipality_code: str | None = Field(None, alias="municipalityCode")
    municipality_name: str | None = Field(None, alias="municipalityName")
    address_normalized: str | None = Field(None, alias="addressNormalized")
    enrichment_confidence: float | None = Field(None, alias="enrichmentConfidence")
    enrichment_source: str | None = Field(None, alias="enrichmentSource")


class ContractorBusiness(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    business_name: str = Field(..., alias="businessName", min_length=2, max_length=200)
    license_number: str = Field(..., alias="licenseNumber", min_length=1, max_length=50)
    years_in_business: int = Field(0, alias="yearsInBusiness", ge=0, le=100)
    regions: list[str] = Field(default_factory=list)
    description: str = Field("", max_length=2000)


class OnboardingRequest(BaseModel):
    role: str = Field(..., pattern=r"^(resident|contractor)$")
    categories: list[str] = Field(default_factory=list)
    building: ResidentBuilding | None = None
    business: ContractorBusiness | None = None


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class OnboardingResponse(BaseModel):
    success: bool = True
    user: UserResponse


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("", response_model=OnboardingResponse, status_code=200)
async def complete_onboarding(
    request: OnboardingRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> OnboardingResponse:
    """Complete onboarding for a resident or contractor.

    - Residents: finds or creates a building record, links the user to it, and
      inserts a building_residents row for the given apartment.
    - Contractors: creates a contractors record and links it to the user.

    Idempotent: re-submitting after onboarding is already complete returns 200
    without creating duplicate DB rows, so the frontend can safely retry.
    """
    db = get_postgres_client()
    user_id = current_user.id

    # ------------------------------------------------------------------
    # Guard: already onboarded?
    # ------------------------------------------------------------------
    if request.role == "resident" and current_user.building_id:
        logger.info("User %s already onboarded as resident (building %s)", user_id, current_user.building_id)
        updated_user = await db.get_user(user_id)
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
        return OnboardingResponse(user=UserResponse.model_validate(updated_user.model_dump()))

    if request.role == "contractor" and current_user.contractor_id:
        logger.info("User %s already onboarded as contractor (%s)", user_id, current_user.contractor_id)
        updated_user = await db.get_user(user_id)
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
        return OnboardingResponse(user=UserResponse.model_validate(updated_user.model_dump()))

    # ------------------------------------------------------------------
    # Resident path
    # ------------------------------------------------------------------
    if request.role == "resident":
        if not request.building:
            raise HTTPException(status_code=400, detail="building info is required for residents")

        info = request.building

        # Find existing building by address + city (exact match, case-insensitive)
        building = await _find_building_by_address(db, info.building_address, info.city)

        if not building:
            # Create a new building record. The current user becomes its admin.
            building_id = str(uuid4())
            building_payload: dict[str, Any] = {
                "id": building_id,
                "name": f"{info.building_address}, {info.city}",
                "address": info.building_address,
                "city": info.city,
                "region": info.region,
                "total_units": 0,
                "floors": 1,
                "year_built": None,
                "admin_user_id": user_id,
                "resident_count": 0,
                "active_offers": 0,
                "completed_offers": 0,
                "total_savings": 0.0,
                "whatsapp_group_id": None,
            }
            # Server-side enrichment: if client didn't supply municipality_code,
            # call EnrichmentService to resolve it from data.gov.il.
            if not info.municipality_code:
                try:
                    enriched = get_enrichment_service().normalize_address(info.building_address, info.city)
                    if enriched.municipality_code:
                        building_payload["municipality_code"] = enriched.municipality_code
                        building_payload["municipality_name"] = enriched.municipality
                        building_payload["address_normalized"] = enriched.address
                        building_payload["enrichment_confidence"] = enriched.confidence
                        building_payload["enrichment_source"] = enriched.source
                        building_payload["enriched_at"] = datetime.now(UTC)
                        logger.info(
                            "Server-side enrichment: building %s got municipality_code=%s confidence=%.2f",
                            building_id,
                            enriched.municipality_code,
                            enriched.confidence,
                        )
                except Exception as enrich_exc:
                    logger.warning("Server-side enrichment failed for building %s: %s", building_id, enrich_exc)
            else:
                if info.municipality_code:
                    building_payload["municipality_code"] = info.municipality_code
                if info.municipality_name:
                    building_payload["municipality_name"] = info.municipality_name
                if info.address_normalized:
                    building_payload["address_normalized"] = info.address_normalized
                if info.enrichment_confidence is not None:
                    building_payload["enrichment_confidence"] = info.enrichment_confidence
                if info.enrichment_source:
                    building_payload["enrichment_source"] = info.enrichment_source
                building_payload["enriched_at"] = datetime.now(UTC)
            try:
                building = await db.create_building(building_payload)
                logger.info("Created new building %s for onboarding user %s", building_id, user_id)
            except Exception as exc:
                logger.error("Failed to create building for user %s: %s", user_id, exc)
                raise HTTPException(status_code=500, detail="Failed to create building") from exc

        building_id = building["id"]

        # Add resident to building_residents (skip if already linked)
        already_in_building = await db.is_user_in_building(user_id, building_id)
        if not already_in_building:
            try:
                floor = _floor_from_apartment(info.apartment_number)
                await db.add_resident_to_building(
                    user_id=user_id,
                    building_id=building_id,
                    unit_number=info.apartment_number,
                    floor=floor,
                    is_owner=True,
                )
            except Exception as exc:
                logger.error("Failed to add user %s to building %s: %s", user_id, building_id, exc)
                raise HTTPException(status_code=500, detail="Failed to link resident to building") from exc

        # Update user record: set building_id, role, onboarded_at
        try:
            updated_user = await db.update_user(
                user_id,
                {
                    "building_id": building_id,
                    "role": "resident",
                    "onboarded_at": datetime.now(UTC),
                },
            )
        except Exception as exc:
            logger.error("Failed to update user %s after resident onboarding: %s", user_id, exc)
            raise HTTPException(status_code=500, detail="Failed to update user") from exc

        logger.info("Resident onboarding complete for user %s → building %s", user_id, building_id)
        try:
            from src.messaging.envelope import EventEnvelope
            from src.messaging.outbox_helpers import try_enqueue_crm
            from src.messaging.topics import RK_CRM_BUILDING_CREATED

            env = EventEnvelope(
                event_name="crm.building.created",
                entity_type="building",
                entity_id=building_id,
                idempotency_key=f"crm:building:created:{building_id}",
                payload={"building_id": building_id, "user_id": user_id},
            )
            await try_enqueue_crm(
                db,
                RK_CRM_BUILDING_CREATED,
                env.event_name,
                env.to_json_dict(),
                idempotency_key=env.idempotency_key,
            )
        except Exception:
            logger.exception("CRM outbox enqueue failed after resident onboarding (non-fatal)")

        return OnboardingResponse(user=UserResponse.model_validate(updated_user.model_dump()))

    # ------------------------------------------------------------------
    # Contractor path
    # ------------------------------------------------------------------
    if request.role == "contractor":
        if not request.business:
            raise HTTPException(status_code=400, detail="business info is required for contractors")

        info = request.business
        contractor_id = str(uuid4())

        contractor_row: dict[str, Any] = {
            "id": contractor_id,
            "user_id": user_id,
            "business_name": info.business_name,
            "contact_name": current_user.full_name,
            "email": current_user.email,
            "phone": current_user.phone,
            "description": info.description or "",
            "categories": list(request.categories),
            "regions": info.regions,
            "years_experience": info.years_in_business,
            "employee_count": 1,
            "website": None,
            "verification_status": "pending",
            "trust_score": 0.0,
            "license_number": info.license_number,
        }

        try:
            await _insert_contractor_row(db, contractor_row)
        except Exception as exc:
            logger.error("Failed to create contractor profile for user %s: %s", user_id, exc)
            raise HTTPException(status_code=500, detail="Failed to create contractor profile") from exc

        try:
            updated_user = await db.update_user(
                user_id,
                {
                    "contractor_id": contractor_id,
                    "role": "contractor",
                    "onboarded_at": datetime.now(UTC),
                },
            )
        except Exception as exc:
            logger.error("Failed to update user %s after contractor onboarding: %s", user_id, exc)
            raise HTTPException(status_code=500, detail="Failed to update user") from exc

        logger.info("Contractor onboarding complete for user %s → contractor %s", user_id, contractor_id)
        try:
            from src.messaging.envelope import EventEnvelope
            from src.messaging.outbox_helpers import try_enqueue_crm
            from src.messaging.topics import RK_CRM_CONTRACTOR_REGISTERED

            env = EventEnvelope(
                event_name="crm.contractor.registered",
                entity_type="contractor",
                entity_id=contractor_id,
                idempotency_key=f"crm:contractor:registered:{contractor_id}",
                payload={"contractor_id": contractor_id, "source": "onboarding"},
            )
            await try_enqueue_crm(
                db,
                RK_CRM_CONTRACTOR_REGISTERED,
                env.event_name,
                env.to_json_dict(),
                idempotency_key=env.idempotency_key,
            )
        except Exception:
            logger.exception("CRM outbox enqueue failed after contractor onboarding (non-fatal)")

        return OnboardingResponse(user=UserResponse.model_validate(updated_user.model_dump()))

    # Should never reach here (pydantic validates role)
    raise HTTPException(status_code=400, detail="Invalid role")  # pragma: no cover


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


async def _find_building_by_address(db: Any, address: str, city: str) -> dict[str, Any] | None:
    """Find a building by address + city (case-insensitive)."""
    # list_buildings supports city filter; we filter by address locally.
    items, _total = await db.list_buildings(filters={"city": city}, page=1, page_size=50)
    address_lower = address.strip().lower()
    for b in items:
        if b.get("address", "").strip().lower() == address_lower:
            return b
    return None


def _floor_from_apartment(apartment_number: str) -> int:
    """Guess floor number from apartment string (e.g. '3A' → 3, '15' → 15).

    Falls back to 1 if the apartment number does not start with a digit.
    """
    digits = ""
    for ch in apartment_number:
        if ch.isdigit():
            digits += ch
        else:
            break
    if digits:
        return max(1, int(digits) // 4)  # rough heuristic: 4 units per floor
    return 1


async def _insert_contractor_row(db: Any, row: dict[str, Any]) -> None:
    """Insert a contractors row for an *existing* user (no user creation)."""
    if db._use_supabase_client():
        client = await db._get_client()
        await client.table("contractors").insert(row).execute()
        return
    await db._pg_execute(
        """INSERT INTO contractors
           (id, user_id, business_name, contact_name, email,
            phone, description, categories, regions,
            years_experience, employee_count, website,
            verification_status, trust_score, license_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   $10, $11, $12, $13, $14, $15)""",
        row["id"],
        row["user_id"],
        row["business_name"],
        row["contact_name"],
        row["email"],
        row["phone"],
        row["description"],
        row["categories"],
        row["regions"],
        row["years_experience"],
        row["employee_count"],
        row["website"],
        row["verification_status"],
        row["trust_score"],
        row["license_number"],
    )
