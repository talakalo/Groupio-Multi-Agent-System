"""Graph-powered GMV feature API routes."""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.api.middleware.auth import get_current_user, is_admin
from src.databases.graph_store import get_graph_store
from src.databases.redis_client import get_redis_client
from src.models.user import UserInDB

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Graph Features"])


# ---------------------------------------------------------------------------
# Feature 1: Viral Invite Chain
# ---------------------------------------------------------------------------


class RecordInviteRequest(BaseModel):
    """Request body for recording an invite event."""

    invitee_phone: str
    channel: str = "whatsapp"


@router.get("/offers/{offer_id}/invite-chain")
async def get_invite_chain(
    offer_id: str,
    max_depth: int = Query(default=4, ge=1, le=6),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Return the viral invite chain rooted at the requesting resident for an offer."""
    graph = get_graph_store()
    try:
        chain = await graph.get_viral_invite_chain(
            offer_id=offer_id,
            resident_id=current_user.id,
            max_depth=max_depth,
        )
        momentum = await graph.get_invite_momentum_for_offer(
            offer_id=offer_id,
            building_id=current_user.building_id or "",
        )
    except Exception as exc:
        logger.warning("Failed to fetch invite chain for offer %s: %s", offer_id, exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve invite chain")

    return {"chain": chain, "momentum": momentum}


@router.post("/offers/{offer_id}/record-invite")
async def record_invite(
    offer_id: str,
    request: RecordInviteRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Record an invite event and return a shareable invite token/link."""
    from src.databases.postgres import get_postgres_client

    db = get_postgres_client()
    redis = get_redis_client()

    # Resolve invitee by phone (must be a registered resident)
    invitee = await db.get_user_by_phone(request.invitee_phone)
    if not invitee:
        raise HTTPException(status_code=404, detail="Invitee not found — must be a registered resident")

    invitee_id = invitee["id"]
    graph = get_graph_store()

    try:
        await graph.record_invite_event(
            inviter_id=current_user.id,
            invitee_id=invitee_id,
            offer_id=offer_id,
            channel=request.channel,
        )
    except Exception as exc:
        logger.warning("Failed to record invite event: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record invite")

    # Generate a short-lived invite token stored in Redis (24h)
    invite_token = str(uuid4()).replace("-", "")[:16]
    await redis.set(f"invite_token:{invite_token}", current_user.id, ex=86400)

    invite_link = f"/join/{offer_id}?invite={invite_token}"
    return {"invite_token": invite_token, "invite_link": invite_link}


# ---------------------------------------------------------------------------
# Feature 2: Building Similarity Clusters
# ---------------------------------------------------------------------------


@router.get("/buildings/{building_id}/similar")
async def get_similar_buildings(
    building_id: str,
    category: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Return similar buildings and their offer participation history."""
    graph = get_graph_store()
    try:
        clusters = await graph.get_building_similarity_clusters(
            building_id=building_id,
            category=category,
            limit=limit,
        )
    except Exception as exc:
        logger.warning("Failed to fetch similarity clusters for building %s: %s", building_id, exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve similar buildings")

    return {"building_id": building_id, "similar_buildings": clusters, "total": len(clusters)}


# ---------------------------------------------------------------------------
# Feature 3: Resident Influence Score
# ---------------------------------------------------------------------------


@router.get("/residents/{resident_id}/influence-score")
async def get_influence_score(
    resident_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Return a resident's influence score components.

    Non-admin users may only view their own score.
    """
    if resident_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    graph = get_graph_store()
    try:
        score = await graph.get_resident_influence_score(resident_id=resident_id)
    except Exception as exc:
        logger.warning("Failed to fetch influence score for resident %s: %s", resident_id, exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve influence score")

    if not score:
        raise HTTPException(status_code=404, detail="Resident not found in graph")

    return score


@router.get("/cities/{city}/top-influencers")
async def get_top_influencers(
    city: str,
    top_n: int = Query(default=20, ge=1, le=100),
    min_score: float = Query(default=5.0, ge=0.0),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Return top influencers in a city. Admin only."""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    graph = get_graph_store()
    try:
        influencers = await graph.get_top_influencers_by_city(city=city, top_n=top_n, min_score=min_score)
    except Exception as exc:
        logger.warning("Failed to fetch top influencers for city %s: %s", city, exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve influencers")

    return {"city": city, "influencers": influencers, "total": len(influencers)}
