"""Contractor API routes."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.middleware.auth import get_current_user, get_current_user_optional, is_admin
from src.databases.graph_store import get_graph_store
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.databases.vector_store import get_vector_store
from src.domain.contractor_membership import (
    contractor_may_view_contractor_profile,
    contractor_visible_in_marketplace,
)
from src.models.contractor import (
    ContractorCreate,
    ContractorListResponse,
    ContractorResponse,
    ContractorReview,
    ContractorSearchRequest,
    ContractorStats,
    ContractorUpdate,
    Region,
    VerificationStatus,
)
from src.models.offer import ServiceCategory
from src.models.user import UserInDB, UserRole
from src.rag.embeddings import get_embedding_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["contractors"])


@router.post("/", response_model=ContractorResponse)
async def create_contractor(
    request: ContractorCreate,
    current_user: UserInDB = Depends(get_current_user),
) -> ContractorResponse:
    """Register a new contractor (requires authentication)."""
    db = get_postgres_client()

    # Check if email already exists
    existing = await db.get_user_by_email(request.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    contractor_id = str(uuid4())
    contractor_data = request.model_dump(exclude={"password"})
    contractor_data["id"] = contractor_id
    contractor_data["verification_status"] = VerificationStatus.PENDING

    contractor = await db.create_contractor(contractor_data, request.password)

    # Index in vector DB
    try:
        embeddings = get_embedding_client()
        categories = contractor.get("categories") or []
        regions = contractor.get("regions") or []
        cat_str = " ".join(str(c) for c in categories)
        text = f"{contractor.get('business_name', '')} {contractor.get('description', '')} {cat_str}"
        embedding = await embeddings.embed_text(text)

        vs = get_vector_store()
        await vs.upsert(
            collection="contractors",
            ids=[contractor_id],
            vectors=[embedding],
            payloads=[
                {
                    "business_name": contractor.get("business_name", ""),
                    "categories": categories,
                    "regions": regions,
                    "trust_score": contractor.get("trust_score", 0),
                },
            ],
        )
    except Exception as e:
        logger.warning("Failed to index contractor in vector DB: %s", e)

    # Add to graph DB
    try:
        graph = get_graph_store()
        await graph.create_contractor_node(contractor_id, contractor_data)
    except Exception as e:
        logger.warning("Failed to add contractor to graph DB: %s", e)

    return contractor


@router.get("/", response_model=ContractorListResponse)
async def list_contractors(
    category: ServiceCategory | None = None,
    region: Region | None = None,
    min_trust_score: float | None = Query(None, ge=0, le=100),
    verification_status: VerificationStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ContractorListResponse:
    """List contractors with optional filters."""
    db = get_postgres_client()

    filters = {}
    if category:
        filters["category"] = category.value
    if region:
        filters["region"] = region.value
    if min_trust_score is not None:
        filters["min_trust_score"] = min_trust_score
    if verification_status:
        filters["verification_status"] = verification_status.value

    filters["marketplace_visible_only"] = True

    contractors, total = await db.list_contractors(
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return ContractorListResponse(
        items=contractors,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.post("/search", response_model=ContractorListResponse)
async def search_contractors(
    request: ContractorSearchRequest,
) -> ContractorListResponse:
    """Search contractors with semantic search."""
    db = get_postgres_client()

    if request.query:
        # Use vector search
        embeddings = get_embedding_client()
        query_embedding = await embeddings.embed_text(request.query)

        vs = get_vector_store()
        filters = {}
        if request.categories:
            filters["categories"] = [c.value for c in request.categories]
        if request.regions:
            filters["regions"] = [r.value for r in request.regions]
        if request.min_trust_score:
            filters["min_trust_score"] = request.min_trust_score

        results = await vs.search(
            collection="contractors",
            query_vector=query_embedding,
            filters=filters if filters else None,
            top_k=request.page_size,
        )

        contractor_ids = [r["id"] for r in results]
        contractors = await db.get_contractors_by_ids(contractor_ids)
        contractors = [c for c in contractors if contractor_visible_in_marketplace(c)]
        total = len(contractors)
    else:
        # Regular filter search
        filters = {}
        if request.categories:
            filters["categories"] = [c.value for c in request.categories]
        if request.regions:
            filters["regions"] = [r.value for r in request.regions]
        if request.min_trust_score:
            filters["min_trust_score"] = request.min_trust_score
        if request.min_rating:
            filters["min_rating"] = request.min_rating
        if request.verification_status:
            filters["verification_status"] = request.verification_status.value

        filters["marketplace_visible_only"] = True

        contractors, total = await db.list_contractors(
            filters=filters,
            page=request.page,
            page_size=request.page_size,
        )

    return ContractorListResponse(
        items=contractors,
        total=total,
        page=request.page,
        page_size=request.page_size,
        has_more=(request.page * request.page_size) < total,
    )


@router.get("/me/doc-requests")
async def get_my_doc_requests(
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get pending document requests for the current contractor (set by admin via request-docs)."""
    if not current_user.contractor_id:
        return {"items": [], "pending": False}

    redis = get_redis_client()
    raw = await redis.get(f"doc_request:{current_user.contractor_id}")
    if not raw:
        return {"items": [], "pending": False}

    try:
        payload = json.loads(raw)
        return {
            "items": [payload],
            "pending": True,
            "requested_at": payload.get("requested_at"),
            "message": payload.get("message", ""),
        }
    except (json.JSONDecodeError, TypeError):
        return {"items": [], "pending": False}


_MEMBERSHIP_KEYS = (
    "membership_status",
    "membership_plan",
    "membership_provider",
    "provider_customer_id",
    "provider_subscription_id",
    "current_period_start",
    "current_period_end",
    "next_billing_at",
    "cancel_at_period_end",
    "canceled_at",
    "billing_failure_count",
    "membership_grace_until",
    "trial_ends_at",
    "last_payment_at",
)


@router.get("/me/membership")
async def get_my_contractor_membership(
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Current contractor marketplace membership state (no payment-provider side effects)."""
    if current_user.role != UserRole.CONTRACTOR or not current_user.contractor_id:
        raise HTTPException(status_code=403, detail="Contractor only")
    db = get_postgres_client()
    contractor = await db.get_contractor(current_user.contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {k: contractor.get(k) for k in _MEMBERSHIP_KEYS}


@router.get("/{contractor_id}", response_model=ContractorResponse)
async def get_contractor(
    contractor_id: str,
    current_user: UserInDB | None = Depends(get_current_user_optional),
) -> ContractorResponse:
    """Get contractor by ID."""
    db = get_postgres_client()
    contractor = await db.get_contractor(contractor_id)

    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    if not contractor_may_view_contractor_profile(current_user, contractor):
        raise HTTPException(status_code=404, detail="Contractor not found")

    return contractor


@router.put("/{contractor_id}", response_model=ContractorResponse)
async def update_contractor(
    contractor_id: str,
    request: ContractorUpdate,
    current_user: UserInDB = Depends(get_current_user),
) -> ContractorResponse:
    """Update contractor profile."""
    db = get_postgres_client()

    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    # Only the contractor or admin can update
    if current_user.contractor_id != contractor_id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = request.model_dump(exclude_unset=True)
    updated = await db.update_contractor(contractor_id, update_data)

    # Update vector DB
    try:
        embeddings = get_embedding_client()
        upd_categories = updated.get("categories") or []
        upd_regions = updated.get("regions") or []
        upd_cat_str = " ".join(str(c) for c in upd_categories)
        text = f"{updated.get('business_name', '')} {updated.get('description', '')} {upd_cat_str}"
        embedding = await embeddings.embed_text(text)

        vs = get_vector_store()
        await vs.upsert(
            collection="contractors",
            ids=[contractor_id],
            vectors=[embedding],
            payloads=[
                {
                    "business_name": updated.get("business_name", ""),
                    "categories": upd_categories,
                    "regions": upd_regions,
                    "trust_score": updated.get("trust_score", 0),
                },
            ],
        )
    except Exception as e:
        logger.warning("Failed to update contractor in vector DB: %s", e)

    return updated


@router.get("/{contractor_id}/reviews")
async def get_contractor_reviews(
    contractor_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Get contractor reviews."""
    db = get_postgres_client()

    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    reviews, total = await db.get_contractor_reviews(contractor_id, page, page_size)

    return {
        "items": reviews,
        "total": total,
        "page": page,
        "page_size": page_size,
        "average_rating": contractor.get("average_rating", 0),
    }


@router.post("/{contractor_id}/reviews")
async def add_review(
    contractor_id: str,
    review: ContractorReview,
    current_user: UserInDB = Depends(get_current_user),
) -> ContractorReview:
    """Add a review for a contractor."""
    db = get_postgres_client()

    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    # Verify user completed an offer with this contractor
    has_completed = await db.has_user_completed_offer_with_contractor(current_user.id, contractor_id)
    if not has_completed:
        raise HTTPException(
            status_code=403,
            detail="Can only review contractors after completing an offer",
        )

    review_data = review.model_dump()
    review_data["id"] = str(uuid4())
    review_data["user_id"] = current_user.id
    review_data["contractor_id"] = contractor_id

    created_review = await db.create_review(review_data)

    # Update contractor rating
    await db.update_contractor_rating(contractor_id)

    return created_review


@router.get("/{contractor_id}/stats", response_model=ContractorStats)
async def get_contractor_stats(
    contractor_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> ContractorStats:
    """Get contractor statistics (contractor or admin only)."""
    if current_user.contractor_id != contractor_id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    db = get_postgres_client()

    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    stats = await db.get_contractor_stats(contractor_id)
    return stats


# Admin routes


@router.post("/{contractor_id}/verify")
async def verify_contractor(
    contractor_id: str,
    status: VerificationStatus,
    current_user: UserInDB = Depends(get_current_user),
) -> ContractorResponse:
    """Verify or reject a contractor (admin only)."""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    updated = await db.update_contractor(
        contractor_id,
        {
            "verification_status": status,
        },
    )

    return updated


@router.post("/{contractor_id}/recalculate-trust-score")
async def recalculate_trust_score(
    contractor_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Trigger trust score recalculation (admin only)."""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    # Trigger vetting agent
    from src.models.agent_state import create_initial_state
    from src.orchestration.graph import get_orchestrator

    orchestrator = get_orchestrator()
    vetting_agent = orchestrator.agents.get("vetting")

    if vetting_agent:
        state = create_initial_state(
            user_message=f"Recalculate trust score for {contractor_id}",
            user_id="system",
        )
        state["actions_taken"] = [{"details": {"entities": {"contractor_id": contractor_id}}}]
        result = await vetting_agent.run(state)
        new_score = result.get("trust_score", contractor.get("trust_score", 0))

        await db.update_contractor(contractor_id, {"trust_score": new_score})

        return {"contractor_id": contractor_id, "new_trust_score": new_score}

    return {"contractor_id": contractor_id, "trust_score": contractor.get("trust_score", 0)}
