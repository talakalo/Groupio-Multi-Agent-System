"""Offer API routes."""

import json
import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from src.api.middleware.auth import get_current_user
from src.api.routes.websocket import OFFERS_CHANNEL
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.pg_store import get_pg_store
from src.databases.vector_store import get_vector_store
from src.domain.contractor_membership import contractor_membership_allows_offer_creation
from src.messaging.envelope import EventEnvelope
from src.messaging.outbox_helpers import try_enqueue_outbox
from src.messaging.topics import RK_NOTIFICATIONS_SEND_REQUESTED
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
from src.models.user import UserInDB, UserRole
from src.orchestration.graph import get_orchestrator
from src.rag.embeddings import get_embedding_client
from src.services.email import get_email_service
from src.services.whatsapp_bot import get_whatsapp_bot

logger = logging.getLogger(__name__)

router = APIRouter(tags=["offers"])


async def _offer_building_managed_by_user(db, user: UserInDB, offer: dict) -> bool:
    if user.role != UserRole.BUILDINGS_MANAGER:
        return False
    bid = offer.get("building_id")
    if not bid:
        return False
    b = await db.get_building(bid)
    return bool(b and b.get("admin_user_id") == user.id)


async def _assert_can_view_offer(db, user: UserInDB, offer: dict) -> None:
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return
    if user.role == UserRole.CONTRACTOR:
        return
    bid = offer.get("building_id")
    if user.role == UserRole.RESIDENT:
        if bid and await db.is_user_in_building(user.id, bid):
            return
        raise HTTPException(status_code=403, detail="Not authorized to view this offer")
    if user.role == UserRole.BUILDINGS_MANAGER:
        if await _offer_building_managed_by_user(db, user, offer):
            return
        raise HTTPException(status_code=403, detail="Not authorized to view this offer")
    raise HTTPException(status_code=403, detail="Not authorized to view this offer")


async def _can_modify_offer(db, user: UserInDB, offer: dict) -> bool:
    if offer.get("created_by") == user.id:
        return True
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return True
    if user.role == UserRole.BUILDINGS_MANAGER:
        return await _offer_building_managed_by_user(db, user, offer)
    return False


async def _can_operator_match_or_resolve(db, user: UserInDB, offer: dict) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return True
    if user.role == UserRole.BUILDINGS_MANAGER:
        return await _offer_building_managed_by_user(db, user, offer)
    return False


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

    if current_user.role == UserRole.CONTRACTOR:
        if not current_user.contractor_id:
            raise HTTPException(status_code=403, detail="Contractor profile not linked to user")
        contractor = await db.get_contractor(current_user.contractor_id)
        if not contractor:
            raise HTTPException(status_code=404, detail="Contractor profile not found")
        if not contractor_membership_allows_offer_creation(contractor):
            raise HTTPException(
                status_code=403,
                detail="Active marketplace membership is required to create offers",
            )
    elif current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        pass
    elif current_user.role == UserRole.BUILDINGS_MANAGER:
        managed = await db.get_building_ids_where_user_is_admin(current_user.id)
        if request.building_id not in (managed or []):
            raise HTTPException(status_code=403, detail="Not authorized for this building")
    else:
        is_resident = await db.is_user_in_building(current_user.id, request.building_id)
        if not is_resident:
            raise HTTPException(status_code=403, detail="Not a resident of this building")

    # Create offer
    offer_id = str(uuid4())
    offer_data = request.model_dump(exclude_none=True)
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
    """List offers with optional filters.
    Residents are scoped to buildings they belong to. Buildings managers see only managed buildings.
    """
    db = get_postgres_client()

    filters: dict = {}

    if current_user.role == UserRole.RESIDENT:
        resident_buildings = await db.get_building_ids_for_user(current_user.id)
        if building_id:
            if building_id not in resident_buildings:
                raise HTTPException(status_code=403, detail="Not authorized to list offers for this building")
            filters["building_id"] = building_id
        elif not resident_buildings:
            return OfferListResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                has_more=False,
            )
        elif len(resident_buildings) == 1:
            filters["building_id"] = resident_buildings[0]
        else:
            raise HTTPException(
                status_code=400,
                detail="Multiple buildings associated; pass building_id",
            )
    elif current_user.role == UserRole.BUILDINGS_MANAGER:
        managed = await db.get_building_ids_where_user_is_admin(current_user.id)
        if building_id:
            if building_id not in managed:
                raise HTTPException(status_code=403, detail="Not authorized to list offers for this building")
            filters["building_id"] = building_id
        elif not managed:
            return OfferListResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                has_more=False,
            )
        elif len(managed) == 1:
            filters["building_id"] = managed[0]
        else:
            filters["building_ids"] = managed
    else:
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

    await _assert_can_view_offer(db, current_user, offer)

    # Annotate whether this caller is already a participant so the UI can
    # show the correct state without waiting for a failed join attempt.
    offer = dict(offer)
    offer["user_is_participant"] = await db.has_user_joined_offer(current_user.id, offer_id)

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

    if not await _can_modify_offer(db, current_user, offer):
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

    if not await _can_modify_offer(db, current_user, offer):
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

    if request.user_id is not None and request.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Cannot join on behalf of another user",
        )

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

    try:
        await db.join_offer(current_user.id, offer_id, request.unit_count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Publish real-time update so WebSocket clients get the new participant count.
    try:
        updated_offer = await db.get_offer(offer_id)
        if updated_offer:
            store = get_pg_store()
            await store.publish(
                OFFERS_CHANNEL,
                json.dumps(
                    {
                        "event_type": "UPDATE",
                        "building_id": offer["building_id"],
                        "record": updated_offer,
                        "old_record": {"current_participants": offer.get("current_participants", 0)},
                    },
                    default=str,
                ),
            )
    except Exception as _pub_exc:
        logger.warning("Failed to publish offer update after join: %s", _pub_exc)

    # Record viral invite conversion in the graph (fire-and-forget)
    if request.invite_token:
        from src.databases.graph_store import get_graph_store

        async def _mark_converted() -> None:
            try:
                store = get_pg_store()
                inviter_id = await store.get(f"invite_token:{request.invite_token}")
                if inviter_id:
                    graph = get_graph_store()
                    await graph.mark_invite_converted(
                        invitee_id=current_user.id,
                        offer_id=offer_id,
                    )
            except Exception as exc:
                logger.warning("Failed to mark invite converted: %s", exc)

        background_tasks.add_task(_mark_converted)

    # Dispatch join confirmation email (fire-and-forget)
    new_count = current_count + 1
    min_participants = offer.get("min_participants", 5)
    offer_title = offer.get("title", "")
    email_svc = get_email_service()

    if current_user.email:
        settings = get_settings()
        if settings.ENABLE_NOTIFICATION_QUEUE and settings.ENABLE_OUTBOX:
            env = EventEnvelope(
                event_name="notifications.offer_joined_email",
                entity_type="offer",
                entity_id=offer_id,
                idempotency_key=f"offer_joined_email:{offer_id}:{current_user.id}",
                payload={
                    "channel": "email",
                    "to_email": current_user.email,
                    "user_name": current_user.full_name or "דייר",
                    "offer_title": offer_title,
                    "current_participants": new_count,
                    "min_participants": min_participants,
                    "offer_id": offer_id,
                },
            )
            await try_enqueue_outbox(
                db,
                RK_NOTIFICATIONS_SEND_REQUESTED,
                env.event_name,
                env.to_json_dict(),
                idempotency_key=env.idempotency_key,
            )
        else:
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

    # P3-4: WhatsApp notification on join
    if current_user.phone:
        wa_number = f"972{current_user.phone.lstrip('0')}"
        background_tasks.add_task(
            get_whatsapp_bot()._send_text_message,
            to=wa_number,
            text=f"הצטרפת בהצלחה להצעה '{offer_title}'! כרגע {new_count} דיירים. מינימום נדרש: {min_participants}.",
        )

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

    # P3-4: WhatsApp notification on leave
    if current_user.phone:
        wa_number = f"972{current_user.phone.lstrip('0')}"
        background_tasks.add_task(
            get_whatsapp_bot()._send_text_message,
            to=wa_number,
            text=f"עזבת את ההצעה '{offer.get('title', '')}'. אנחנו מקווים לראותך בהצעות עתידיות!",
        )

    # P3-3: Threshold collapse detection — notify remaining participants if below minimum
    updated_offer = await db.get_offer(offer_id)
    new_count = updated_offer.get("current_participants", 0) if updated_offer else 0
    min_participants = offer.get("min_participants", 5)
    if new_count < min_participants:
        remaining = await db.get_offer_participants(offer_id)
        for participant in remaining:
            p_email = participant.get("email") or (participant.get("users") or {}).get("email")
            p_name = participant.get("full_name") or (participant.get("users") or {}).get("full_name") or "דייר"
            if p_email:
                background_tasks.add_task(
                    get_email_service().send_offer_at_risk,
                    to_email=p_email,
                    user_name=p_name,
                    offer_title=offer.get("title", ""),
                    offer_id=offer_id,
                    current_count=new_count,
                    min_count=min_participants,
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

    if not await _can_operator_match_or_resolve(db, current_user, offer):
        raise HTTPException(status_code=403, detail="Admin access required")

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
    """Match offer with a contractor (platform admin or building admin)."""
    db = get_postgres_client()

    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if not await _can_operator_match_or_resolve(db, current_user, offer):
        raise HTTPException(status_code=403, detail="Admin access required")

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

    await _assert_can_view_offer(db, current_user, offer)

    participants = await db.get_offer_participants(offer_id)

    full_detail = current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN) or (
        current_user.role == UserRole.BUILDINGS_MANAGER
        and await _offer_building_managed_by_user(db, current_user, offer)
    )
    if full_detail:
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


@router.post("/{offer_id}/resolve-undersubscription", response_model=OfferResponse)
async def resolve_undersubscription(
    offer_id: str,
    action: str = Query(..., pattern="^(extend_deadline|cancel_with_refund|lower_minimum)$"),
    new_deadline: datetime | None = None,
    new_minimum: int | None = None,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Handle an offer that failed to reach minimum participants."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if not await _can_operator_match_or_resolve(db, current_user, offer):
        raise HTTPException(status_code=403, detail="Admin access required")

    if action == "extend_deadline":
        if not new_deadline:
            raise HTTPException(status_code=400, detail="new_deadline required")
        await db.update_offer(offer_id, {"deadline": new_deadline})
        logger.info("Admin %s extended deadline for offer %s", current_user.id, offer_id)

    elif action == "lower_minimum":
        if not new_minimum or new_minimum < 1:
            raise HTTPException(status_code=400, detail="new_minimum must be >= 1")
        await db.update_offer(offer_id, {"min_participants": new_minimum})
        logger.info(
            "Admin %s lowered minimum for offer %s to %d",
            current_user.id,
            offer_id,
            new_minimum,
        )

    elif action == "cancel_with_refund":
        await db.update_offer(offer_id, {"status": "cancelled"})
        logger.info(
            "Admin %s cancelled under-subscribed offer %s with refund",
            current_user.id,
            offer_id,
        )
        # Trigger payment reversal notifications (actual refund via payment provider)
        try:
            participants = await db.get_offer_participants(offer_id)
            email_service = get_email_service()
            for p in participants:
                p_email = p.get("email") or (p.get("users") or {}).get("email")
                p_name = p.get("full_name") or (p.get("users") or {}).get("full_name") or "דייר"
                if p_email:
                    await email_service.send_offer_cancelled(
                        to_email=p_email,
                        user_name=p_name,
                        offer_title=offer.get("title", ""),
                        reason="ההצעה בוטלה עקב אי-עמידה במינימום משתתפים. תקבל/י החזר כספי מלא.",
                    )
        except Exception:
            logger.warning("Failed to notify participants of under-subscription cancellation")

    updated = await db.get_offer(offer_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated offer")
    return OfferResponse(**updated)
