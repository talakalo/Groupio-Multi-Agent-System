"""Unified DB-first agent autonomy mode resolver.

Reads ``PAYMENT_AGENT_MODE``, ``MATCHING_AGENT_MODE``, etc. from the
``system_settings`` PostgreSQL table at runtime.  Falls back to the
``get_settings()`` env-based singleton when the DB has no entry or is
unreachable.

A lightweight process-level TTL cache (~10 seconds) prevents a DB round-trip
on every single agent invocation while still picking up admin changes within
one cache cycle.

Usage::

    from src.services.agent_config import get_agent_mode

    mode = await get_agent_mode("matching")   # "auto" | "recommend" | "gated"
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_CACHE_TTL: float = 10.0  # seconds

# Map agent short-name → settings key
_AGENT_KEY_MAP: dict[str, str] = {
    "matching": "MATCHING_AGENT_MODE",
    "pricing": "PRICING_AGENT_MODE",
    "vetting": "VETTING_AGENT_MODE",
    "outreach": "OUTREACH_AGENT_MODE",
    "payment": "PAYMENT_AGENT_MODE",
}

# ---------------------------------------------------------------------------
# Internal cache: key → (value, expiry_timestamp)
# ---------------------------------------------------------------------------

_cache: dict[str, tuple[str, float]] = {}


def _cache_get(key: str) -> str | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    value, expiry = entry
    if time.monotonic() > expiry:
        _cache.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: str) -> None:
    _cache[key] = (value, time.monotonic() + _CACHE_TTL)


def _cache_clear() -> None:
    """Clear the entire in-process cache (useful in tests)."""
    _cache.clear()


# ---------------------------------------------------------------------------
# Public helper
# ---------------------------------------------------------------------------


async def get_agent_mode(agent_name: str) -> str:
    """Return the current autonomy mode for *agent_name*.

    Resolution order:
    1. In-process TTL cache (avoids per-invocation DB calls)
    2. ``system_settings`` DB table (source of truth set by admin UI)
    3. ``get_settings()`` env value (fallback / initial default)

    Parameters
    ----------
    agent_name:
        One of ``"matching"``, ``"pricing"``, ``"vetting"``, ``"outreach"``,
        ``"payment"``.  Unrecognised names fall through to env lookup using
        ``{UPPER_NAME}_AGENT_MODE``.

    Returns
    -------
    str
        One of ``"auto"``, ``"recommend"``, or ``"gated"``.
    """
    settings_key = _AGENT_KEY_MAP.get(agent_name, f"{agent_name.upper()}_AGENT_MODE")

    # 1. Check TTL cache
    cached = _cache_get(settings_key)
    if cached is not None:
        return cached

    # 2. Env fallback value (used if DB unreachable or key absent)
    from src.config.settings import get_settings

    env_settings = get_settings()
    env_mode: str = getattr(env_settings, settings_key, "gated")

    # 3. Try DB
    try:
        from src.databases.postgres import get_postgres_client

        db = get_postgres_client()
        rows = await db.get_system_settings()
        db_map = {row["key"]: row["value"] for row in rows}
        db_mode = db_map.get(settings_key)
        if isinstance(db_mode, str) and db_mode:
            _cache_set(settings_key, db_mode)
            return db_mode
    except Exception as exc:
        logger.warning(
            "get_agent_mode(%r): failed to read %s from system_settings, using env fallback: %s",
            agent_name,
            settings_key,
            exc,
        )

    # 4. Env fallback
    _cache_set(settings_key, env_mode)
    return env_mode
