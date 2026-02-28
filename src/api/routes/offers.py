"""Offer API routes."""

import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from src.api.middleware.auth import get_current_user, is_admin
from src.databases.postgres import get_postgres_client
from src.databases.vector_store import get_vector_store
from src.models.offer import (
    ContractorInOffer,
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
from src.services.email import get_email_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["offers"])


def _build_contractor_in_offer(contractor: dict) -> dict:
    """Build a contractor trust summary dict for embedding in offer responses."""
    return {
        "id": contractor.get("id", ""),
        "businessName": contractor.get("business_name"),
        "verified": contractor.get("verification_status") == "verified",
        "rating": contractor.get("average_rating"),
        "trustScore": contractor.get("trust_score"),
        "yearsInBusiness": contractor.get("years_in_business"),
        "categories": contractor.get("categories") or [],
        "description": contractor.get("description"),
        "phone": contractor.get("phone"),
        "licenseNumber": contractor.get("license_number"),
        "regions": contractor.get("regions") or [],
    }


def _get_current_discount_percent(offer: dict, participants: int) -> int:
    """Return the discount percentage unlocked at the given participant count."""
    tiers = offer.get("pricing_tiers") or offer.get("tiers") or []
    best = 0
    for tier in tiers:
        tier_min = tier.get("min", 0)
        if participants >= tier_min:
            pct = tier.get("discount_percent") or int((tier.get("discount", 0)) * 100)
            if pct > best:
                best = pct
    return best


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
        text = f"{offer.get('title', '')} {offer.get('description', '')} {offer.get('category', '')}"
        embedding = await embeddings.embed_text(text)

        vs = get_vector_store()
        await vs.upsert(
            collection="offers",
            ids=[offer_id],
            vectors=[embedding],
            payloads=[
                {
                    "title": offer.get("title", ""),
                    "category": offer.get("category", ""),
                    "building_id": offer.get("building_id", ""),
                    "status": offer.get("status", "draft"),
                },
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

    for offer in offers:
        if offer.get("matched_contractor_id"):
            try:
                contractor = await db.get_contractor(offer["matched_contractor_id"])
                if contractor:
                    offer["contractor"] = _build_contractor_in_offer(contractor)
            except Exception:
                pass

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

    if offer.get("matched_contractor_id"):
        try:
            contractor = await db.get_contractor(offer["matched_contractor_id"])
            if contractor:
                offer["contractor"] = _build_contractor_in_offer(contractor)
        except Exception:
            logger.warning("Failed to enrich offer %s with contractor data", offer_id)

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
    if offer.get("created_by") != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to update this offer")

    # Cannot update completed/cancelled offers
    if offer.get("status") in (OfferStatus.COMPLETED, OfferStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Cannot update completed or cancelled offer")

    update_data = request.model_dump(exclude_unset=True)
    updated_offer = await db.update_offer(offer_id, update_data)

    return updated_offer


@router.delete("/{offer_id}")
async def delete_offer(
    offer_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Delete (cancel) an offer."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.get("created_by") != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete this offer")

    if offer.get("status") not in (OfferStatus.DRAFT, OfferStatus.PENDING):
        raise HTTPException(status_code=400, detail="Can only cancel draft or pending offers")

    # Fetch participants before cancelling so we can notify them
    try:
        participants = await db.get_offer_participants(offer_id)
    except Exception:
        participants = []

    await db.update_offer(offer_id, {"status": OfferStatus.CANCELLED})

    offer_title = offer.get("title", "")
    email_svc = get_email_service()
    for p in participants:
        p_email = p.get("email") or p.get("user_email", "")
        if p_email:
            background_tasks.add_task(
                email_svc.send_offer_cancelled,
                to_email=p_email,
                user_name=p.get("full_name") or p.get("user_name", "דייר"),
                offer_title=offer_title,
            )

    return {"status": "cancelled", "offer_id": offer_id}


@router.post("/{offer_id}/join")
async def join_offer(
    offer_id: str,
    request: OfferJoinRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Join an offer as a participant."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.get("status") not in (OfferStatus.PENDING, OfferStatus.MATCHING):
        raise HTTPException(status_code=400, detail="Offer is not open for joining")

    # Verify user is in the building
    is_resident = await db.is_user_in_building(current_user.id, offer["building_id"])
    if not is_resident:
        raise HTTPException(status_code=403, detail="Not a resident of this building")

    # Check if already joined
    already_joined = await db.has_user_joined_offer(current_user.id, offer_id)
    if already_joined:
        raise HTTPException(status_code=400, detail="Already joined this offer")

    # Check capacity
    current_count = offer.get("current_participants", 0)
    if current_count >= offer.get("max_participants", 50):
        raise HTTPException(status_code=400, detail="Offer is at maximum capacity")

    await db.join_offer(current_user.id, offer_id, request.unit_count)

    # Dispatch join confirmation email (fire-and-forget)
    new_count = current_count + 1
    min_participants = offer.get("min_participants", 5)
    offer_title = offer.get("title", "")
    email_svc = get_email_service()

    if current_user.email:
        background_tasks.add_task(
            email_svc.send_offer_joined,
            to_email=current_user.email,
            user_name=current_user.full_name or "דייר",
            offer_title=offer_title,
            current_participants=new_count,
            min_participants=min_participants,
            offer_id=offer_id,
        )

    # If threshold just reached, notify all participants
    if new_count == min_participants:
        try:
            participants = await db.get_offer_participants(offer_id)
            discount_percent = _get_current_discount_percent(offer, new_count)
            for p in participants:
                p_email = p.get("email") or p.get("user_email", "")
                if p_email:
                    background_tasks.add_task(
                        email_svc.send_offer_threshold_reached,
                        to_email=p_email,
                        user_name=p.get("full_name") or p.get("user_name", "דייר"),
                        offer_title=offer_title,
                        participants=new_count,
                        discount_percent=discount_percent,
                        offer_id=offer_id,
                    )
        except Exception:
            logger.warning("Failed to fetch participants for threshold notification: offer=%s", offer_id)

    return {"status": "joined", "offer_id": offer_id}


@router.post("/{offer_id}/leave")
async def leave_offer(
    offer_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Leave an offer."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.get("status") not in (OfferStatus.PENDING, OfferStatus.MATCHING):
        raise HTTPException(status_code=400, detail="Cannot leave offer in current status")

    has_joined = await db.has_user_joined_offer(current_user.id, offer_id)
    if not has_joined:
        raise HTTPException(status_code=400, detail="Not a participant of this offer")

    await db.leave_offer(current_user.id, offer_id)

    if current_user.email:
        background_tasks.add_task(
            get_email_service().send_offer_left,
            to_email=current_user.email,
            user_name=current_user.full_name or "דייר",
            offer_title=offer.get("title", ""),
            offer_id=offer_id,
        )

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

    if offer.get("created_by") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if offer.get("status") != OfferStatus.DRAFT:
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

    if offer.get("status") != OfferStatus.PENDING:
        raise HTTPException(status_code=400, detail="Offer must be pending to start matching")

    current_participants = offer.get("current_participants", 0)
    min_participants = offer.get("min_participants", 5)
    if current_participants < min_participants:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {min_participants} participants",
        )

    # Update status and trigger matching agent
    await db.update_offer(offer_id, {"status": OfferStatus.MATCHING})

    # Trigger matching through orchestrator
    orchestrator = get_orchestrator()
    await orchestrator.run(
        user_message=f"Find contractors for offer {offer_id}",
        user_id="system",
        building_id=offer["building_id"],
    )

    return {"status": "matching_started", "offer_id": offer_id}


@router.post("/{offer_id}/match")
async def match_contractor(
    offer_id: str,
    request: OfferMatchRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Match offer with a contractor (admin only)."""
    if not is_admin(current_user):
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

    # Notify all participants of the match
    try:
        participants = await db.get_offer_participants(offer_id)
        contractor_name = contractor.get("business_name") or contractor.get("name", "קבלן")
        offer_title = offer.get("title", "")
        email_svc = get_email_service()
        for p in participants:
            p_email = p.get("email") or p.get("user_email", "")
            if p_email:
                background_tasks.add_task(
                    email_svc.send_offer_matched,
                    to_email=p_email,
                    user_name=p.get("full_name") or p.get("user_name", "דייר"),
                    offer_title=offer_title,
                    contractor_name=contractor_name,
                    offer_id=offer_id,
                )
    except Exception:
        logger.warning("Failed to send match notifications for offer=%s", offer_id)

    return updated


@router.get("/{offer_id}/participants")
async def get_participants(
    offer_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get offer participants.

    Non-admin users see only unit numbers (anonymized). Admins see full details.
    Each user can always see their own full record.
    """
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    participants = await db.get_offer_participants(offer_id)

    if is_admin(current_user):
        return {"participants": participants, "total": len(participants)}

    # Anonymize: expose personal details only to the participant themselves
    anonymized = [
        {
            "participant_id": p.get("id"),
            "unit_number": p.get("unit_number", "דייר"),
            "unit_count": p.get("unit_count", 1),
            "joined_at": p.get("joined_at"),
            "is_self": p.get("user_id") == current_user.id,
            # Personal fields only for the requesting user's own record
            "name": p.get("full_name") if p.get("user_id") == current_user.id else None,
            "email": p.get("email") if p.get("user_id") == current_user.id else None,
        }
        for p in participants
    ]
    return {"participants": anonymized, "total": len(anonymized)}
