"""Compatibility shim — all offer model definitions now live in offer.py.

This module re-exports for backward compatibility. New code should import
directly from src.models.offer.
"""
from src.models.offer import (
    SEASONALITY_FACTORS,
    CompletedOffer,
    MarketData,
    SeasonalFactor,
)
from src.models.offer import (
    AgentOffer as Offer,
)
from src.models.offer import (
    AgentOfferBase as OfferBase,
)
from src.models.offer import (
    AgentOfferCreate as OfferCreate,
)
from src.models.offer import (
    AgentPricingTier as PricingTier,
)

__all__ = [
    "CompletedOffer",
    "MarketData",
    "Offer",
    "OfferBase",
    "OfferCreate",
    "PricingTier",
    "SEASONALITY_FACTORS",
    "SeasonalFactor",
]
