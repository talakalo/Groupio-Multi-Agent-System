"""Contractor membership Stripe webhook helpers."""

from unittest.mock import AsyncMock

import pytest

from src.services.stripe_contractor_webhooks import (
    _map_subscription_status,
    handle_stripe_subscription_event,
)


def test_map_subscription_status() -> None:
    assert _map_subscription_status("active") == "active"
    assert _map_subscription_status("trialing") == "trialing"
    assert _map_subscription_status("past_due") == "past_due"
    assert _map_subscription_status("canceled") == "canceled"
    assert _map_subscription_status("unknown_xyz") == "inactive"


@pytest.mark.asyncio
async def test_checkout_session_completed_binds_contractor() -> None:
    db = AsyncMock()
    db.admin_update_contractor_membership = AsyncMock()

    session = {
        "mode": "subscription",
        "metadata": {"contractor_id": "c1"},
        "customer": "cus_123",
        "subscription": "sub_456",
        "created": 1700000000,
    }
    out = await handle_stripe_subscription_event(db, "checkout.session.completed", session)
    assert out["status"] == "membership_bound"
    db.admin_update_contractor_membership.assert_called_once()
    call_kw = db.admin_update_contractor_membership.call_args[0]
    assert call_kw[0] == "c1"
    patch = call_kw[1]
    assert patch["provider_customer_id"] == "cus_123"
    assert patch["provider_subscription_id"] == "sub_456"
    assert patch["membership_provider"] == "stripe"


@pytest.mark.asyncio
async def test_invoice_payment_failed_sets_past_due() -> None:
    db = AsyncMock()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(
        return_value={"id": "c9", "billing_failure_count": 1},
    )
    db.admin_update_contractor_membership = AsyncMock()

    inv = {"subscription": "sub_x", "customer": "cus_x"}
    out = await handle_stripe_subscription_event(db, "invoice.payment_failed", inv)
    assert out["status"] == "invoice_failed"
    patch = db.admin_update_contractor_membership.call_args[0][1]
    assert patch["membership_status"] == "past_due"
    assert patch["billing_failure_count"] == 2
