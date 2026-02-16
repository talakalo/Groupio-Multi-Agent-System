"""Unit tests for business constants validation."""

from src.config.constants import (
    DEFAULT_PRICING_TIERS,
    DEFAULT_RATE_LIMIT_PER_USER,
    DEFAULT_RATE_LIMIT_WINDOW,
    INTERVAL_CHECK_EXPIRED_OFFERS,
    INTERVAL_CLEANUP_CONVERSATIONS,
    INTERVAL_DAILY_ANALYTICS,
    INTERVAL_RECALCULATE_TRUST,
    MATCH_WEIGHTS,
    PLATFORM_FEE_RATE,
    SEASONAL_FACTORS,
    TAX_RATE,
    TRUST_SCORE_WEIGHTS,
)

# ------------------------------------------------------------------
# Tax & Fees
# ------------------------------------------------------------------


def test_tax_rate_is_valid_percentage():
    """TAX_RATE should be between 0 and 1 (exclusive)."""
    assert 0 < TAX_RATE < 1
    # Israeli VAT is 17%
    assert TAX_RATE == 0.17


def test_platform_fee_rate_is_valid():
    """PLATFORM_FEE_RATE should be a small positive fraction."""
    assert 0 < PLATFORM_FEE_RATE < 1
    assert PLATFORM_FEE_RATE == 0.05


# ------------------------------------------------------------------
# Trust & Matching Weights
# ------------------------------------------------------------------


def test_trust_score_weights_sum_to_one():
    """Trust score weights must sum to 1.0 for proper normalization."""
    total = sum(TRUST_SCORE_WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9, f"Trust score weights sum to {total}, expected 1.0"


def test_match_weights_sum_to_one():
    """Match weights must sum to 1.0 for proper normalization."""
    total = sum(MATCH_WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9, f"Match weights sum to {total}, expected 1.0"


# ------------------------------------------------------------------
# Seasonal Factors
# ------------------------------------------------------------------


def test_seasonal_factors_cover_all_seasons():
    """SEASONAL_FACTORS should have entries for all four seasons."""
    expected_seasons = {"winter", "summer", "spring", "autumn"}
    assert set(SEASONAL_FACTORS.keys()) == expected_seasons

    # All factors should be positive multipliers
    for season, factor in SEASONAL_FACTORS.items():
        assert factor > 0, f"Season '{season}' has non-positive factor {factor}"


# ------------------------------------------------------------------
# Pricing Tiers
# ------------------------------------------------------------------


def test_default_pricing_tiers_are_ordered():
    """Pricing tiers should be ordered by ascending min_participants and discount_pct."""
    assert len(DEFAULT_PRICING_TIERS) >= 2, "Should have at least 2 pricing tiers"

    for i in range(1, len(DEFAULT_PRICING_TIERS)):
        prev = DEFAULT_PRICING_TIERS[i - 1]
        curr = DEFAULT_PRICING_TIERS[i]
        assert curr["min_participants"] > prev["min_participants"], (
            f"Tier {i} min_participants ({curr['min_participants']}) should be "
            f"greater than tier {i - 1} ({prev['min_participants']})"
        )
        assert curr["discount_pct"] >= prev["discount_pct"], (
            f"Tier {i} discount_pct ({curr['discount_pct']}) should be >= tier {i - 1} ({prev['discount_pct']})"
        )


# ------------------------------------------------------------------
# Scheduler Intervals
# ------------------------------------------------------------------


def test_scheduler_intervals_are_positive():
    """All scheduler intervals must be positive integers (seconds)."""
    intervals = [
        ("INTERVAL_CHECK_EXPIRED_OFFERS", INTERVAL_CHECK_EXPIRED_OFFERS),
        ("INTERVAL_RECALCULATE_TRUST", INTERVAL_RECALCULATE_TRUST),
        ("INTERVAL_CLEANUP_CONVERSATIONS", INTERVAL_CLEANUP_CONVERSATIONS),
        ("INTERVAL_DAILY_ANALYTICS", INTERVAL_DAILY_ANALYTICS),
    ]
    for name, value in intervals:
        assert isinstance(value, int), f"{name} should be an int, got {type(value)}"
        assert value > 0, f"{name} should be positive, got {value}"


# ------------------------------------------------------------------
# Rate Limiting
# ------------------------------------------------------------------


def test_rate_limit_values_are_positive():
    """Rate limit settings must be positive integers."""
    assert isinstance(DEFAULT_RATE_LIMIT_PER_USER, int)
    assert DEFAULT_RATE_LIMIT_PER_USER > 0

    assert isinstance(DEFAULT_RATE_LIMIT_WINDOW, int)
    assert DEFAULT_RATE_LIMIT_WINDOW > 0
