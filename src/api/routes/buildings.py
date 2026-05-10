"""Building API routes."""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.api.middleware.auth import (
    get_buildings_manager_user,
    get_current_user,
    is_admin,
)
from src.databases.postgres import get_postgres_client
from src.models.building import (
    BuildingCreate,
    BuildingListResponse,
    BuildingResident,
    BuildingResponse,
    BuildingStats,
    BuildingUpdate,
)
from src.models.contractor import Region
from src.models.user import UserInDB, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(tags=["buildings"])


@router.get("/me")
async def get_my_building(
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get current user's building (resident): residents, active offers, stats, invite code."""
    if not current_user.building_id:
        raise HTTPException(status_code=404, detail="No building associated with your account")
    db = get_postgres_client()
    building_id = current_user.building_id
    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    residents, _ = await db.get_building_residents(building_id, page=1, page_size=50)
    active_offers = await db.get_active_offers(building_id)
    stats = await db.get_building_stats(building_id)

    # Build resident summaries for frontend (BuildingProfile.residents)
    resident_summaries = []
    for r in residents:
        resident_summaries.append(
            {
                "id": r.get("user_id") or r.get("id"),
                "name": r.get("full_name", ""),
                "apartmentNumber": r.get("unit_number", ""),
                "joinedAt": (
                    (r.get("joined_at") or "").isoformat()
                    if hasattr(r.get("joined_at"), "isoformat")
                    else str(r.get("joined_at", ""))
                ),
                "isCommitteeMember": building.get("admin_user_id") == r.get("user_id"),
            }
        )

    # Shareable invite code: prefer the stored column populated by migration
    # 038. Fall back to the legacy id-derived form so existing share links
    # keep working during the deploy window before the column is backfilled.
    invite_code = building.get("invite_code") or (building_id.replace("-", "")[:8].upper() if building_id else "")

    return {
        **building,
        "residents": resident_summaries,
        "activeOffers": active_offers,
        "totalSavings": building.get("total_savings") or stats.get("total_savings", 0),
        "inviteCode": invite_code,
    }


class JoinBuildingRequest(BaseModel):
    """Request body for joining a building by invite code or building ID."""

    building_id: str | None = None
    invite_code: str | None = None


@router.post("/join")
async def join_building(
    request: JoinBuildingRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Join a building by invite code or building ID. User must not already be a resident."""
    if not request.building_id and not request.invite_code:
        raise HTTPException(status_code=400, detail="Provide building_id or invite_code")

    db = get_postgres_client()
    building_id: str | None = None

    if request.building_id:
        building = await db.get_building(request.building_id)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        building_id = request.building_id
    else:
        code = (request.invite_code or "").strip().upper()
        if len(code) < 6:
            raise HTTPException(status_code=400, detail="Invite code must be at least 6 characters")
        # Prefer the stored invite_code (migration 038), fall back to the
        # legacy id-derived form so codes shared before the migration still
        # resolve.
        rows = await db.execute_query(
            "SELECT id FROM buildings WHERE invite_code = $1 LIMIT 1",
            {"code": code},
        )
        if not rows:
            rows = await db.execute_query(
                "SELECT id FROM buildings WHERE UPPER(LEFT(REPLACE(id::text, '-', ''), 8)) = $1 LIMIT 1",
                {"code": code},
            )
        if not rows:
            raise HTTPException(status_code=404, detail="No building found for this invite code")
        building_id = rows[0]["id"]

    is_resident = await db.is_user_in_building(current_user.id, building_id)
    if is_resident:
        raise HTTPException(status_code=400, detail="Already a resident")

    unit_number = f"invite-{uuid4().hex[:8]}"
    await db.add_resident_to_building(
        user_id=current_user.id,
        building_id=building_id,
        unit_number=unit_number,
        floor=0,
        is_owner=False,
    )

    return {"status": "joined", "building_id": building_id}


@router.post("/", response_model=BuildingResponse)
async def create_building(
    request: BuildingCreate,
    current_user: UserInDB = Depends(get_buildings_manager_user),
) -> BuildingResponse:
    """Create a new building.

    Restricted to ``buildings_manager``, ``admin`` and ``super_admin``. Before
    this guard was added any authenticated user — including a resident —
    could create a building and silently become its ``admin_user_id``.
    """
    db = get_postgres_client()

    building_id = str(uuid4())
    building_data = request.model_dump()
    building_data["id"] = building_id
    building_data["admin_user_id"] = current_user.id

    building = await db.create_building(building_data)

    # Add creator as first resident
    await db.add_resident_to_building(
        user_id=current_user.id,
        building_id=building_id,
        unit_number="admin",
        floor=1,
        is_owner=True,
    )

    # Index in vector DB for semantic building search
    try:
        from src.databases.vector_store import get_vector_store
        from src.rag.embeddings import get_embedding_client

        parts = [building.get(k, "") for k in ("name", "address", "city", "neighborhood")]
        text = " ".join(p for p in parts if p)
        embedding = await get_embedding_client().embed_text(text)
        vs = get_vector_store()
        await vs.upsert(
            collection="buildings",
            ids=[building_id],
            vectors=[embedding],
            payloads=[
                {
                    "text": text,
                    "city": building.get("city", ""),
                    "neighborhood": building.get("neighborhood", ""),
                    "address": building.get("address", ""),
                }
            ],
        )
    except Exception as e:
        logger.warning("Failed to index building in vector DB: %s", e)

    return building


@router.get("/", response_model=BuildingListResponse)
async def list_buildings(
    city: str | None = None,
    region: Region | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> BuildingListResponse:
    """List buildings."""
    db = get_postgres_client()

    filters = {}
    if city:
        filters["city"] = city
    if region:
        filters["region"] = region.value

    # Non-admins can only see their own buildings
    if not is_admin(current_user):
        filters["user_id"] = current_user.id

    buildings, total = await db.list_buildings(
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return BuildingListResponse(
        items=buildings,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/search", response_model=BuildingListResponse)
async def search_buildings(
    q: str = Query(..., min_length=1, description="Search by address or city"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> BuildingListResponse:
    """Search buildings by address or city substring."""
    db = get_postgres_client()
    filters: dict = {"search": q}
    if not is_admin(current_user):
        filters["user_id"] = current_user.id
    buildings, total = await db.list_buildings(
        filters=filters,
        page=page,
        page_size=page_size,
    )
    return BuildingListResponse(
        items=buildings,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/{building_id}", response_model=BuildingResponse)
async def get_building(
    building_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> BuildingResponse:
    """Get building by ID."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Check access
    if not is_admin(current_user):
        is_resident = await db.is_user_in_building(current_user.id, building_id)
        if not is_resident:
            raise HTTPException(status_code=403, detail="Not authorized")

    return building


@router.put("/{building_id}", response_model=BuildingResponse)
async def update_building(
    building_id: str,
    request: BuildingUpdate,
    current_user: UserInDB = Depends(get_current_user),
) -> BuildingResponse:
    """Update building."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Only admin of building or system admin can update
    if building.get("admin_user_id") != current_user.id and current_user.role not in (
        "admin",
        "super_admin",
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = request.model_dump(exclude_unset=True)
    updated = await db.update_building(building_id, update_data)

    return updated


@router.delete("/{building_id}")
async def delete_building(
    building_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a building (admin only)."""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Check for active offers
    active_offers = await db.count_active_offers(building_id)
    if active_offers > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete building with {active_offers} active offers",
        )

    await db.delete_building(building_id)

    return {"status": "deleted", "building_id": building_id}


@router.get("/{building_id}/residents")
async def get_building_residents(
    building_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get building residents."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Only building admin or system admin can see all residents
    if building.get("admin_user_id") != current_user.id and current_user.role not in (
        "admin",
        "super_admin",
    ):
        is_resident = await db.is_user_in_building(current_user.id, building_id)
        if not is_resident:
            raise HTTPException(status_code=403, detail="Not authorized")

    residents, total = await db.get_building_residents(building_id, page, page_size)

    return {
        "items": residents,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@router.post("/{building_id}/residents")
async def add_resident(
    building_id: str,
    unit_number: str,
    floor: int,
    is_owner: bool = True,
    current_user: UserInDB = Depends(get_current_user),
) -> BuildingResident:
    """Add current user as a resident of the building."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Check if already a resident
    is_resident = await db.is_user_in_building(current_user.id, building_id)
    if is_resident:
        raise HTTPException(status_code=400, detail="Already a resident")

    # Check if unit is available
    unit_taken = await db.is_unit_taken(building_id, unit_number)
    if unit_taken:
        raise HTTPException(status_code=400, detail="Unit already occupied")

    resident = await db.add_resident_to_building(
        user_id=current_user.id,
        building_id=building_id,
        unit_number=unit_number,
        floor=floor,
        is_owner=is_owner,
    )

    return resident


@router.delete("/{building_id}/residents/{user_id}")
async def remove_resident(
    building_id: str,
    user_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Remove a resident from building."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Can remove self or building admin can remove others
    if user_id != current_user.id:
        if building.get("admin_user_id") != current_user.id and current_user.role not in (
            "admin",
            "super_admin",
        ):
            raise HTTPException(status_code=403, detail="Not authorized")

    # Cannot remove building admin
    if user_id == building.get("admin_user_id"):
        raise HTTPException(status_code=400, detail="Cannot remove building admin")

    await db.remove_resident_from_building(user_id, building_id)

    return {"status": "removed", "user_id": user_id, "building_id": building_id}


@router.post("/{building_id}/regenerate-invite")
async def regenerate_building_invite(
    building_id: str,
    current_user: UserInDB = Depends(get_buildings_manager_user),
) -> dict[str, str]:
    """Rotate the invite code for a building. Restricted to BM/admin.

    Existing share links using the old code stop resolving immediately —
    that's the whole point of rotation (a leaked code becomes invalid).
    """
    db = get_postgres_client()
    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # BM users can rotate only their own buildings; admin/super_admin can rotate any.
    if current_user.role == UserRole.BUILDINGS_MANAGER and building.get("admin_user_id") != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Buildings managers can only rotate codes for their own buildings",
        )

    new_code = await db.regenerate_building_invite_code(building_id)
    return {"building_id": building_id, "invite_code": new_code}


@router.get("/{building_id}/stats", response_model=BuildingStats)
async def get_building_stats(
    building_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> BuildingStats:
    """Get building statistics."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Check access
    if not is_admin(current_user):
        is_resident = await db.is_user_in_building(current_user.id, building_id)
        if not is_resident:
            raise HTTPException(status_code=403, detail="Not authorized")

    stats = await db.get_building_stats(building_id)
    return stats


@router.get("/{building_id}/offers")
async def get_building_offers(
    building_id: str,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get offers for a building."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Check access
    if not is_admin(current_user):
        is_resident = await db.is_user_in_building(current_user.id, building_id)
        if not is_resident:
            raise HTTPException(status_code=403, detail="Not authorized")

    filters = {"building_id": building_id}
    if status:
        filters["status"] = status

    offers, total = await db.list_offers(
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return {
        "items": offers,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@router.post("/{building_id}/invite")
async def invite_residents(
    building_id: str,
    emails: list[str],
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Invite residents to join the building (building admin only)."""
    db = get_postgres_client()

    building = await db.get_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    if building.get("admin_user_id") != current_user.id and current_user.role not in (
        "admin",
        "super_admin",
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    # In production, send invitation emails
    invited = []
    for email in emails:
        # Create invitation record
        await db.create_invitation(
            building_id=building_id,
            email=email,
            invited_by=current_user.id,
        )
        invited.append(email)
        logger.info("Invitation sent to %s for building %s", email, building_id)

    return {
        "status": "invitations_sent",
        "building_id": building_id,
        "invited": invited,
    }
