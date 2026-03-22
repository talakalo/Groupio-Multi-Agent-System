"""Centralized business constants for the Groupio platform.

All business rules, thresholds, and magic numbers should be defined here
rather than scattered across agent and service files. For runtime
configurability, these can be loaded from environment variables or a
database settings table in the future.
"""

from __future__ import annotations

# -- Tax & Fees --
TAX_RATE = 0.18  # Israeli VAT — 18% as of 2025
PLATFORM_FEE_RATE = 0.05  # 5% platform commission

# -- Pricing --
DEFAULT_PRICING_TIERS = [
    {"min_participants": 5, "discount_pct": 0},
    {"min_participants": 10, "discount_pct": 5},
    {"min_participants": 20, "discount_pct": 10},
    {"min_participants": 50, "discount_pct": 15},
]

SEASONAL_FACTORS = {
    "winter": 1.1,
    "summer": 0.95,
    "spring": 1.0,
    "autumn": 1.0,
}

# -- Vetting & Trust --
MIN_INSURANCE_COVERAGE = 500_000  # ILS
TRUST_SCORE_WEIGHTS = {
    "license": 0.25,
    "insurance": 0.20,
    "experience": 0.15,
    "reviews": 0.20,
    "response_rate": 0.10,
    "completion_rate": 0.10,
}

# -- Matching --
MATCH_WEIGHTS = {
    "category_relevance": 0.30,
    "trust_score": 0.25,
    "price_competitiveness": 0.20,
    "experience": 0.15,
    "response_rate": 0.10,
}
MIN_CONTRACTOR_RATING = 4.0
MIN_SUCCESS_RATE = 0.85

# -- File Upload --
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB

# -- Scheduler Intervals (seconds) --
INTERVAL_CHECK_EXPIRED_OFFERS = 3600  # 1 hour
INTERVAL_RECALCULATE_TRUST = 604800  # 1 week
INTERVAL_CLEANUP_CONVERSATIONS = 86400  # 1 day
INTERVAL_DAILY_ANALYTICS = 86400  # 1 day

# -- Rate Limiting --
DEFAULT_RATE_LIMIT_PER_USER = 60  # requests per minute
DEFAULT_RATE_LIMIT_WINDOW = 60  # seconds

# -- Conversation --
CONVERSATION_TTL_SECONDS = 86400  # 24 hours
CONVERSATION_CONTEXT_WINDOW = 10  # messages to keep

# -- Router --
ROUTER_CONFIDENCE_THRESHOLD = 0.7
