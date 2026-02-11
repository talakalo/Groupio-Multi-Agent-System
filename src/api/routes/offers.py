"""Offer API routes."""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.databases.vector_store import get_vector_store
from src.models.offer import (
    OfferCreate,
    OfferJoinRequest,
    OfferListResponse,
    OfferMatchRequest,
    OfferResponse,
    OfferStatus,
    OfferUpdate,
    ServiceCategory,
)
from src.models.user import UserInDB
from src.orchestration.graph import get_orchestrator
from src.rag.embeddings import get_embedding_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["offers"])


@router.post("/", response_model=OfferResponse)
async def create_offer(
    request: OfferCreate,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Create a new offer."""
    db = get_postgres_client()

    # Verify user belongs to the building
    building = await db.get_building(request.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    is_resident = await db.is_user_in_building(current_user.id, request.building_id)
    if not is_resident:
        raise HTTPException(status_code=403, detail="Not a resident of this building")

    # Create offer
    offer_id = str(uuid4())
    offer_data = request.model_dump()
    offer_data["id"] = offer_id
    offer_data["created_by"] = current_user.id
    offer_data["status"] = OfferStatus.DRAFT

    offer = await db.create_offer(offer_data)

    # Generate embedding for vector search
    try:
        embeddings = get_embedding_client()
        text = f"{offer.title} {offer.description} {offer.category.value}"
        embedding = await embeddings.embed_text(text)

        vs = get_vector_store()
        await vs.upsert(
            collection="offers",
            points=[
                {
                    "id": offer_id,
                    "vector": embedding,
                    "payload": {
                        "title": offer.title,
                        "category": offer.category.value,
                        "building_id": offer.building_id,
                        "status": offer.status.value,
                    },
                }
            ],
        )
    except Exception as e:
        logger.warning("Failed to index offer in vector DB: %s", e)

    return offer


@router.get("/", response_model=OfferListResponse)
async def list_offers(
    building_id: str | None = None,
    category: ServiceCategory | None = None,
    status: OfferStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> OfferListResponse:
    """List offers with optional filters."""
    db = get_postgres_client()

    filters = {}
    if building_id:
        filters["building_id"] = building_id
    if category:
        filters["category"] = category.value
    if status:
        filters["status"] = status.value

    offers, total = await db.list_offers(
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return OfferListResponse(
        items=offers,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/{offer_id}", response_model=OfferResponse)
async def get_offer(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Get offer by ID."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)

    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    return offer


@router.put("/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: str,
    request: OfferUpdate,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Update an offer."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    # Only creator or admin can update
    if offer.created_by != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to update this offer")

    # Cannot update completed/cancelled offers
    if offer.status in (OfferStatus.COMPLETED, OfferStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Cannot update completed or cancelled offer")

    update_data = request.model_dump(exclude_unset=True)
    updated_offer = await db.update_offer(offer_id, update_data)

    return updated_offer


@router.delete("/{offer_id}")
async def delete_offer(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Delete (cancel) an offer."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.created_by != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to delete this offer")

    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING):
        raise HTTPException(status_code=400, detail="Can only cancel draft or pending offers")

    await db.update_offer(offer_id, {"status": OfferStatus.CANCELLED})

    return {"status": "cancelled", "offer_id": offer_id}


@router.post("/{offer_id}/join")
async def join_offer(
    offer_id: str,
    request: OfferJoinRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Join an offer as a participant."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status not in (OfferStatus.PENDING, OfferStatus.MATCHING):
        raise HTTPException(status_code=400, detail="Offer is not open for joining")

    # Verify user is in the building
    is_resident = await db.is_user_in_building(current_user.id, offer.building_id)
    if not is_resident:
        raise HTTPException(status_code=403, detail="Not a resident of this building")

    # Check if already joined
    already_joined = await db.has_user_joined_offer(current_user.id, offer_id)
    if already_joined:
        raise HTTPException(status_code=400, detail="Already joined this offer")

    # Check capacity
    if offer.current_participants >= offer.max_participants:
        raise HTTPException(status_code=400, detail="Offer is at maximum capacity")

    await db.join_offer(current_user.id, offer_id, request.unit_count)

    return {"status": "joined", "offer_id": offer_id}


@router.post("/{offer_id}/leave")
async def leave_offer(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Leave an offer."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status not in (OfferStatus.PENDING, OfferStatus.MATCHING):
        raise HTTPException(status_code=400, detail="Cannot leave offer in current status")

    has_joined = await db.has_user_joined_offer(current_user.id, offer_id)
    if not has_joined:
        raise HTTPException(status_code=400, detail="Not a participant of this offer")

    await db.leave_offer(current_user.id, offer_id)

    return {"status": "left", "offer_id": offer_id}


@router.post("/{offer_id}/publish")
async def publish_offer(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Publish a draft offer to start collecting participants."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if offer.status != OfferStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only draft offers can be published")

    updated = await db.update_offer(offer_id, {"status": OfferStatus.PENDING})
    return updated


@router.post("/{offer_id}/start-matching")
async def start_matching(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Start the contractor matching process."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=400, detail="Offer must be pending to start matching")

    if offer.current_participants < offer.min_participants:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {offer.min_participants} participants",
        )

    # Update status and trigger matching agent
    await db.update_offer(offer_id, {"status": OfferStatus.MATCHING})

    # Trigger matching through orchestrator
    orchestrator = get_orchestrator()
    await orchestrator.run(
        user_message=f"Find contractors for offer {offer_id}",
        user_id="system",
        building_id=offer.building_id,
    )

    return {"status": "matching_started", "offer_id": offer_id}


@router.post("/{offer_id}/match")
async def match_contractor(
    offer_id: str,
    request: OfferMatchRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Match offer with a contractor (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    contractor = await db.get_contractor(request.contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    updated = await db.update_offer(
        offer_id,
        {
            "status": OfferStatus.MATCHED,
            "matched_contractor_id": request.contractor_id,
        },
    )

    return updated


@router.get("/{offer_id}/participants")
async def get_participants(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, list]:
    """Get offer participants."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    participants = await db.get_offer_participants(offer_id)

    return {"participants": participants, "total": len(participants)}
