"""Unit tests for contractor marketplace membership domain rules."""

from datetime import UTC, datetime, timedelta

import pytest

from src.domain.contractor_membership import (
    contractor_may_view_contractor_profile,
    contractor_membership_allows_offer_creation,
    contractor_visible_in_marketplace,
)


@pytest.mark.parametrize(
    ("status", "grace", "expected"),
    [
        ("active", None, True),
        ("trialing", None, True),
        ("past_due", None, False),
        ("canceled", None, False),
        ("inactive", None, False),
    ],
)
def test_offer_creation_by_status(status, grace, expected):
    c = {"membership_status": status, "membership_grace_until": grace}
    assert contractor_membership_allows_offer_creation(c) is expected


def test_offer_creation_past_due_within_grace():
    future = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    c = {"membership_status": "past_due", "membership_grace_until": future}
    assert contractor_membership_allows_offer_creation(c) is True


def test_offer_creation_past_due_grace_expired():
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    c = {"membership_status": "past_due", "membership_grace_until": past}
    assert contractor_membership_allows_offer_creation(c) is False


def test_marketplace_visibility_matches_offer_rule_for_common_cases():
    c_active = {"membership_status": "active"}
    assert contractor_visible_in_marketplace(c_active) is True
    c_canceled = {"membership_status": "canceled"}
    assert contractor_visible_in_marketplace(c_canceled) is False


def test_profile_view_public_vs_owner():
    class _Viewer:
        def __init__(self, role, contractor_id=None):
            self.role = role
            self.contractor_id = contractor_id

    hidden = {"id": "c1", "membership_status": "canceled"}
    assert contractor_may_view_contractor_profile(None, hidden) is False
    assert contractor_may_view_contractor_profile(_Viewer("resident"), hidden) is False
    assert contractor_may_view_contractor_profile(_Viewer("contractor", "c1"), hidden) is True
    assert contractor_may_view_contractor_profile(_Viewer("admin"), hidden) is True
