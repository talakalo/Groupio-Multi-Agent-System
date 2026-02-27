"""Compatibility shim — all offer model definitions now live in offer.py.

This module re-exports for backward compatibility. New code should import
directly from src.models.offer.
"""
from src.models.offer import (
    AgentOffer as Offer,
    AgentOfferBase as OfferBase,
    AgentOfferCreate as OfferCreate,
    AgentPricingTier as PricingTier,
    CompletedOffer,
    MarketData,
    SEASONALITY_FACTORS,
    SeasonalFactor,
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
