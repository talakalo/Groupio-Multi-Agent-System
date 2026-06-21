"""DEPRECATED: Redis client shim — delegates to PostgresStore.

This module is kept for backwards compatibility so any missed import
of get_redis_client() still returns a working store backed by Postgres.

All new code must use: from src.databases.pg_store import get_pg_store
"""

from src.databases.pg_store import PostgresStore as RedisClient  # noqa: F401
from src.databases.pg_store import get_pg_store  # noqa: F401


def get_redis_client() -> "RedisClient":
    """Deprecated. Use get_pg_store() instead."""
    import warnings

    warnings.warn(
        "get_redis_client() is deprecated. Use get_pg_store() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    return get_pg_store()
