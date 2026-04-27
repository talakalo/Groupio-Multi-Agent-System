"""Contractor membership Stripe webhook helpers."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from src.services import stripe_contractor_webhooks as mod
from src.services.stripe_contractor_webhooks import (
    _dt_from_unix,
    _map_subscription_status,
    handle_stripe_subscription_event,
)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_map_subscription_status() -> None:
    assert _map_subscription_status("active") == "active"
    assert _map_subscription_status("trialing") == "trialing"
    assert _map_subscription_status("past_due") == "past_due"
    assert _map_subscription_status("canceled") == "canceled"
    assert _map_subscription_status("unknown_xyz") == "inactive"


@pytest.mark.parametrize(
    "stripe_status, expected",
    [
        ("unpaid", "past_due"),
        ("incomplete", "inactive"),
        ("incomplete_expired", "inactive"),
        ("paused", "inactive"),
        ("", "inactive"),
    ],
)
def test_map_subscription_status_edge_states(stripe_status: str, expected: str) -> None:
    assert _map_subscription_status(stripe_status) == expected


def test_dt_from_unix_parses_int() -> None:
    dt = _dt_from_unix(1_700_000_000)
    assert dt is not None and dt.tzinfo is UTC


def test_dt_from_unix_handles_none_and_garbage() -> None:
    assert _dt_from_unix(None) is None
    assert _dt_from_unix("not-a-timestamp") is None
    assert _dt_from_unix({"x": 1}) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Dispatcher fixture
# ---------------------------------------------------------------------------


def _db() -> AsyncMock:
    db = AsyncMock()
    db.admin_update_contractor_membership = AsyncMock()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value=None)
    db.get_contractor_by_stripe_customer_id = AsyncMock(return_value=None)
    return db


# ---------------------------------------------------------------------------
# checkout.session.completed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkout_session_completed_binds_contractor() -> None:
    db = _db()
    session = {
        "mode": "subscription",
        "metadata": {"contractor_id": "c1"},
        "customer": "cus_123",
        "subscription": "sub_456",
        "created": 1_700_000_000,
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
    assert patch["membership_status"] == "active"


@pytest.mark.asyncio
async def test_checkout_completed_skips_non_subscription_mode() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(
        db, "checkout.session.completed", {"mode": "payment"}
    )
    assert result == {"status": "ignored", "reason": "not_subscription_checkout"}
    db.admin_update_contractor_membership.assert_not_called()


@pytest.mark.asyncio
async def test_checkout_completed_skips_missing_contractor_metadata() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(
        db,
        "checkout.session.completed",
        {"mode": "subscription", "subscription": "sub_x"},
    )
    assert result == {"status": "ignored", "reason": "no_contractor_metadata"}
    db.admin_update_contractor_membership.assert_not_called()


# ---------------------------------------------------------------------------
# customer.subscription.created / updated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_created_resolves_by_sub_id() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value={"id": "c1"})
    sub = {
        "id": "sub_a",
        "customer": "cus_a",
        "status": "active",
        "current_period_start": 1_700_000_000,
        "current_period_end": 1_702_000_000,
        "cancel_at_period_end": False,
    }
    result = await handle_stripe_subscription_event(db, "customer.subscription.created", sub)
    assert result == {"status": "subscription_synced", "contractor_id": "c1"}
    patch = db.admin_update_contractor_membership.await_args.args[1]
    assert patch["membership_status"] == "active"
    assert patch["provider_subscription_id"] == "sub_a"
    assert patch["next_billing_at"] is not None


@pytest.mark.asyncio
async def test_subscription_updated_falls_back_to_customer_lookup() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value=None)
    db.get_contractor_by_stripe_customer_id = AsyncMock(return_value={"id": "c2"})
    sub = {"id": "sub_b", "customer": "cus_b", "status": "past_due"}
    result = await handle_stripe_subscription_event(db, "customer.subscription.updated", sub)
    assert result == {"status": "subscription_synced", "contractor_id": "c2"}
    patch = db.admin_update_contractor_membership.await_args.args[1]
    assert patch["membership_status"] == "past_due"


@pytest.mark.asyncio
async def test_subscription_event_ignored_when_contractor_not_found() -> None:
    db = _db()
    sub = {"id": "sub_c", "customer": "cus_c", "status": "active"}
    result = await handle_stripe_subscription_event(db, "customer.subscription.created", sub)
    assert result == {"status": "ignored", "reason": "contractor_not_found"}
    db.admin_update_contractor_membership.assert_not_called()


# ---------------------------------------------------------------------------
# customer.subscription.deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_deleted_marks_canceled() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value={"id": "c1"})
    result = await handle_stripe_subscription_event(
        db, "customer.subscription.deleted", {"id": "sub_a"}
    )
    assert result == {"status": "subscription_canceled", "contractor_id": "c1"}
    patch = db.admin_update_contractor_membership.await_args.args[1]
    assert patch["membership_status"] == "canceled"
    assert patch["membership_grace_until"] is None


@pytest.mark.asyncio
async def test_subscription_deleted_ignored_when_contractor_missing() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(
        db, "customer.subscription.deleted", {"id": "sub_missing"}
    )
    assert result == {"status": "ignored", "reason": "contractor_not_found"}


# ---------------------------------------------------------------------------
# invoice.paid
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_paid_renews_membership_and_clears_grace() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value={"id": "c1"})
    invoice = {
        "subscription": "sub_a",
        "lines": {"data": [{"period": {"end": 1_702_000_000}}]},
    }
    result = await handle_stripe_subscription_event(db, "invoice.paid", invoice)
    assert result == {"status": "invoice_paid", "contractor_id": "c1"}
    patch = db.admin_update_contractor_membership.await_args.args[1]
    assert patch["membership_status"] == "active"
    assert patch["billing_failure_count"] == 0
    assert patch["membership_grace_until"] is None
    assert patch["next_billing_at"] is not None


@pytest.mark.asyncio
async def test_invoice_paid_accepts_expanded_subscription_object() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value={"id": "c1"})
    invoice = {
        "subscription": {"id": "sub_x"},
        "lines": {"data": [{"period": {"end": None}}]},
    }
    result = await handle_stripe_subscription_event(db, "invoice.paid", invoice)
    assert result["status"] == "invoice_paid"


@pytest.mark.asyncio
async def test_invoice_paid_falls_back_to_customer_when_sub_lookup_empty() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(return_value=None)
    db.get_contractor_by_stripe_customer_id = AsyncMock(return_value={"id": "c1"})
    invoice = {
        "subscription": "sub_a",
        "customer": "cus_a",
        "lines": {"data": [{"period": {"end": 0}}]},
    }
    result = await handle_stripe_subscription_event(db, "invoice.paid", invoice)
    assert result == {"status": "invoice_paid", "contractor_id": "c1"}
    db.get_contractor_by_stripe_customer_id.assert_awaited_once_with("cus_a")


@pytest.mark.asyncio
async def test_invoice_paid_ignored_without_subscription_field() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(db, "invoice.paid", {})
    assert result == {"status": "ignored", "reason": "no_subscription_on_invoice"}


@pytest.mark.asyncio
async def test_invoice_paid_ignored_when_contractor_not_resolvable() -> None:
    db = _db()
    invoice = {"subscription": "sub_a", "customer": "cus_a", "lines": {"data": [{}]}}
    result = await handle_stripe_subscription_event(db, "invoice.paid", invoice)
    assert result == {"status": "ignored", "reason": "contractor_not_found"}


# ---------------------------------------------------------------------------
# invoice.payment_failed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_payment_failed_sets_past_due() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(
        return_value={"id": "c9", "billing_failure_count": 1}
    )
    inv = {"subscription": "sub_x", "customer": "cus_x"}
    out = await handle_stripe_subscription_event(db, "invoice.payment_failed", inv)
    assert out["status"] == "invoice_failed"
    patch = db.admin_update_contractor_membership.call_args[0][1]
    assert patch["membership_status"] == "past_due"
    assert patch["billing_failure_count"] == 2


@pytest.mark.asyncio
async def test_invoice_payment_failed_computes_grace_window() -> None:
    db = _db()
    db.get_contractor_by_stripe_subscription_id = AsyncMock(
        return_value={"id": "c1", "billing_failure_count": 0}
    )
    before = datetime.now(UTC)
    out = await handle_stripe_subscription_event(
        db, "invoice.payment_failed", {"subscription": "sub_a"}
    )
    assert out["status"] == "invoice_failed"
    grace = db.admin_update_contractor_membership.await_args.args[1]["membership_grace_until"]
    assert isinstance(grace, datetime)
    delta = grace - before
    # Tolerate up to 1 day drift either side of _GRACE_DAYS (= 7).
    assert timedelta(days=mod._GRACE_DAYS - 1) <= delta <= timedelta(days=mod._GRACE_DAYS + 1)


@pytest.mark.asyncio
async def test_invoice_payment_failed_ignored_without_sub_id() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(db, "invoice.payment_failed", {})
    assert result == {"status": "ignored", "reason": "no_subscription_on_invoice"}


@pytest.mark.asyncio
async def test_invoice_payment_failed_ignored_when_contractor_not_found() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(
        db, "invoice.payment_failed", {"subscription": "sub_missing"}
    )
    assert result == {"status": "ignored", "reason": "contractor_not_found"}


# ---------------------------------------------------------------------------
# Dispatcher fallthrough
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unhandled_event_type_returns_verbatim() -> None:
    db = _db()
    result = await handle_stripe_subscription_event(db, "customer.created", {})
    assert result == {"status": "unhandled_membership_event", "event_type": "customer.created"}
    db.admin_update_contractor_membership.assert_not_called()
