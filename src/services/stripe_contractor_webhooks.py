"""Stripe webhook handlers for contractor marketplace membership (subscriptions).

Idempotency is enforced by ``PostgresClient.try_claim_stripe_webhook_event`` on the
event id before any handler runs. Checkout sessions for subscriptions should include
metadata ``contractor_id`` linking the Stripe customer/subscription to a contractor row.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

_GRACE_DAYS = 7


def _dt_from_unix(ts: Any) -> datetime | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _map_subscription_status(stripe_status: str) -> str:
    s = (stripe_status or "").lower()
    mapping = {
        "active": "active",
        "trialing": "trialing",
        "past_due": "past_due",
        "canceled": "canceled",
        "unpaid": "past_due",
        "incomplete": "inactive",
        "incomplete_expired": "inactive",
        "paused": "inactive",
    }
    return mapping.get(s, "inactive")


async def handle_stripe_subscription_event(db: Any, event_type: str, obj: dict[str, Any]) -> dict[str, Any]:
    """Dispatch subscription/membership-related Stripe events. Returns a small status dict."""
    if event_type == "checkout.session.completed":
        return await _checkout_session_completed(db, obj)
    if event_type == "customer.subscription.created":
        return await _subscription_upsert(db, obj, created=True)
    if event_type == "customer.subscription.updated":
        return await _subscription_upsert(db, obj, created=False)
    if event_type == "customer.subscription.deleted":
        return await _subscription_deleted(db, obj)
    if event_type == "invoice.paid":
        return await _invoice_paid(db, obj)
    if event_type == "invoice.payment_failed":
        return await _invoice_payment_failed(db, obj)
    return {"status": "unhandled_membership_event", "event_type": event_type}


async def _checkout_session_completed(db: Any, session: dict[str, Any]) -> dict[str, Any]:
    mode = session.get("mode")
    if mode != "subscription":
        return {"status": "ignored", "reason": "not_subscription_checkout"}

    meta = session.get("metadata") or {}
    contractor_id = meta.get("contractor_id")
    if not contractor_id:
        logger.info(
            "checkout.session.completed: missing metadata.contractor_id — cannot bind membership (subscription_id=%s)",
            session.get("subscription"),
        )
        return {"status": "ignored", "reason": "no_contractor_metadata"}

    customer = session.get("customer")
    sub_id = session.get("subscription")
    patch: dict[str, Any] = {
        "membership_provider": "stripe",
    }
    if isinstance(customer, str) and customer:
        patch["provider_customer_id"] = customer
    if isinstance(sub_id, str) and sub_id:
        patch["provider_subscription_id"] = sub_id

    # Optimistic until subscription.updated delivers authoritative status
    patch["membership_status"] = "active"
    cps = _dt_from_unix(session.get("created"))
    if cps:
        patch["current_period_start"] = cps

    await db.admin_update_contractor_membership(str(contractor_id), patch)
    logger.info(
        "Membership bound from checkout.session.completed contractor=%s customer=%s sub=%s",
        contractor_id,
        customer,
        sub_id,
    )
    return {"status": "membership_bound", "contractor_id": str(contractor_id)}


async def _resolve_contractor_for_subscription(db: Any, sub: dict[str, Any]) -> dict[str, Any] | None:
    sub_id = sub.get("id")
    customer = sub.get("customer")
    if isinstance(sub_id, str) and sub_id:
        row = await db.get_contractor_by_stripe_subscription_id(sub_id)
        if row:
            return row
    if isinstance(customer, str) and customer:
        return await db.get_contractor_by_stripe_customer_id(customer)
    return None


async def _subscription_upsert(db: Any, sub: dict[str, Any], *, created: bool) -> dict[str, Any]:
    contractor = await _resolve_contractor_for_subscription(db, sub)
    if not contractor:
        logger.warning(
            "subscription event: no contractor for subscription_id=%s customer=%s",
            sub.get("id"),
            sub.get("customer"),
        )
        return {"status": "ignored", "reason": "contractor_not_found"}

    cid = contractor["id"]
    stripe_status = str(sub.get("status") or "")
    mem = _map_subscription_status(stripe_status)

    patch: dict[str, Any] = {
        "membership_provider": "stripe",
        "provider_subscription_id": sub.get("id"),
        "membership_status": mem,
        "current_period_start": _dt_from_unix(sub.get("current_period_start")),
        "current_period_end": _dt_from_unix(sub.get("current_period_end")),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end", False)),
        "canceled_at": _dt_from_unix(sub.get("canceled_at")),
        "trial_ends_at": _dt_from_unix(sub.get("trial_end")),
    }
    nba = _dt_from_unix(sub.get("current_period_end"))
    if nba:
        patch["next_billing_at"] = nba

    customer = sub.get("customer")
    if isinstance(customer, str) and customer:
        patch["provider_customer_id"] = customer

    await db.admin_update_contractor_membership(cid, patch)
    logger.info(
        "Contractor %s membership synced from subscription (%s) status=%s -> %s",
        cid,
        "created" if created else "updated",
        stripe_status,
        mem,
    )
    return {"status": "subscription_synced", "contractor_id": cid}


async def _subscription_deleted(db: Any, sub: dict[str, Any]) -> dict[str, Any]:
    contractor = await _resolve_contractor_for_subscription(db, sub)
    if not contractor:
        return {"status": "ignored", "reason": "contractor_not_found"}
    cid = contractor["id"]
    patch = {
        "membership_status": "canceled",
        "canceled_at": datetime.now(UTC),
        "membership_grace_until": None,
    }
    await db.admin_update_contractor_membership(cid, patch)
    logger.info("Contractor %s membership canceled (subscription deleted)", cid)
    return {"status": "subscription_canceled", "contractor_id": cid}


async def _invoice_paid(db: Any, invoice: dict[str, Any]) -> dict[str, Any]:
    sub_ref = invoice.get("subscription")
    if not sub_ref:
        return {"status": "ignored", "reason": "no_subscription_on_invoice"}
    # subscription on invoice may be id string or expanded object
    sub_id = sub_ref if isinstance(sub_ref, str) else sub_ref.get("id")
    if not sub_id:
        return {"status": "ignored", "reason": "no_subscription_id"}

    contractor = await db.get_contractor_by_stripe_subscription_id(str(sub_id))
    if not contractor:
        customer = invoice.get("customer")
        cust_id = customer if isinstance(customer, str) else None
        if cust_id:
            contractor = await db.get_contractor_by_stripe_customer_id(cust_id)
    if not contractor:
        logger.warning("invoice.paid: no contractor for subscription %s", sub_id)
        return {"status": "ignored", "reason": "contractor_not_found"}

    cid = contractor["id"]
    patch: dict[str, Any] = {
        "last_payment_at": datetime.now(UTC),
        "membership_status": "active",
        "billing_failure_count": 0,
        "membership_grace_until": None,
    }
    period_end = invoice.get("lines", {}).get("data", [{}])[0].get("period", {}).get("end")
    pe = _dt_from_unix(period_end)
    if pe:
        patch["current_period_end"] = pe
        patch["next_billing_at"] = pe

    await db.admin_update_contractor_membership(cid, patch)
    logger.info("Contractor %s membership renewed (invoice.paid)", cid)
    return {"status": "invoice_paid", "contractor_id": cid}


async def _invoice_payment_failed(db: Any, invoice: dict[str, Any]) -> dict[str, Any]:
    sub_ref = invoice.get("subscription")
    if not sub_ref:
        return {"status": "ignored", "reason": "no_subscription_on_invoice"}
    sub_id = sub_ref if isinstance(sub_ref, str) else sub_ref.get("id")
    if not sub_id:
        return {"status": "ignored", "reason": "no_subscription_id"}

    contractor = await db.get_contractor_by_stripe_subscription_id(str(sub_id))
    if not contractor:
        return {"status": "ignored", "reason": "contractor_not_found"}

    cid = contractor["id"]
    prev_fail = int(contractor.get("billing_failure_count") or 0)
    grace_until = datetime.now(UTC) + timedelta(days=_GRACE_DAYS)
    patch: dict[str, Any] = {
        "membership_status": "past_due",
        "membership_grace_until": grace_until,
        "billing_failure_count": prev_fail + 1,
    }
    await db.admin_update_contractor_membership(cid, patch)
    logger.warning(
        "Contractor %s invoice.payment_failed (failures=%s grace_until=%s)",
        cid,
        prev_fail + 1,
        grace_until.isoformat(),
    )
    return {"status": "invoice_failed", "contractor_id": cid}
