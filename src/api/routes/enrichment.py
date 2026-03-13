"""Enrichment API routes for address normalization (Phase 2)."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.services.enrichment import get_enrichment_service

router = APIRouter(tags=["enrichment"])


class NormalizeAddressRequest(BaseModel):
    """Request body for address normalization."""

    address: str = Field(..., min_length=1, max_length=500)
    city: str = Field(..., min_length=1, max_length=100)


class NormalizeAddressResponse(BaseModel):
    """Response for address normalization."""

    address: str
    city: str
    street: str | None
    house_number: str | None
    municipality: str | None
    confidence: float
    source: str


@router.post("/normalize-address", response_model=NormalizeAddressResponse)
async def normalize_address(req: NormalizeAddressRequest) -> NormalizeAddressResponse:
    """Normalize an address using enrichment service.

    Returns structured fields and confidence. Low confidence (e.g. < 0.5) indicates
    stub/fallback; caller should preserve user input and treat as tentative.
    """
    svc = get_enrichment_service()
    result = svc.normalize_address(req.address, req.city)
    return NormalizeAddressResponse(
        address=result.address,
        city=result.city,
        street=result.street,
        house_number=result.house_number,
        municipality=result.municipality,
        confidence=result.confidence,
        source=result.source,
    )
