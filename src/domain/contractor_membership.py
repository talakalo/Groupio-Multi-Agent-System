"""Contractor marketplace membership rules (visibility + privileged actions).

Provider webhooks and recurring charge logic live outside this module.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    return None


def contractor_membership_allows_offer_creation(contractor: dict[str, Any]) -> bool:
    """True if contractor may create new marketplace offers."""
    status = (contractor.get("membership_status") or "active").lower()
    if status in ("active", "trialing"):
        return True
    if status == "past_due":
        grace = _parse_datetime(contractor.get("membership_grace_until"))
        return grace is not None and grace > datetime.now(UTC)
    return False


def contractor_visible_in_marketplace(contractor: dict[str, Any]) -> bool:
    """True if contractor should appear in public discovery lists / anonymous profile views."""
    status = (contractor.get("membership_status") or "active").lower()
    if status in ("canceled", "inactive"):
        return False
    if status in ("active", "trialing"):
        return True
    if status == "past_due":
        grace = _parse_datetime(contractor.get("membership_grace_until"))
        return grace is not None and grace > datetime.now(UTC)
    return False


def contractor_may_view_contractor_profile(
    viewer: Any | None,
    contractor: dict[str, Any],
) -> bool:
    """Public or resident visibility; admins and the contractor always see their row."""
    if contractor_visible_in_marketplace(contractor):
        return True
    if viewer is None:
        return False
    role = getattr(viewer, "role", None)
    role_val = getattr(role, "value", role)
    if role_val in ("admin", "super_admin"):
        return True
    cid = getattr(viewer, "contractor_id", None)
    return bool(cid and cid == contractor.get("id"))
