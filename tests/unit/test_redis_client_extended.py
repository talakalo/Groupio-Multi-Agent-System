"""Tests for the redis_client.py backwards-compatibility shim.

The original RedisClient has been replaced by a thin shim that delegates
to PostgresStore. These tests verify the shim contract:

1. `from src.databases.redis_client import RedisClient` works (no ImportError).
2. `RedisClient` is an alias for `PostgresStore`.
3. `get_redis_client()` returns a `PostgresStore` instance and emits a DeprecationWarning.
4. `from src.databases.redis_client import get_pg_store` works.
"""

import warnings


def test_shim_imports_without_error():
    """Importing the shim must not raise (especially not ImportError for redis package)."""
    from src.databases.redis_client import RedisClient, get_pg_store, get_redis_client  # noqa: F401

    assert callable(get_redis_client)
    assert callable(get_pg_store)
    assert RedisClient is not None


def test_redis_client_is_postgres_store_alias():
    """RedisClient should be PostgresStore (backwards-compat alias)."""
    from src.databases.pg_store import PostgresStore
    from src.databases.redis_client import RedisClient

    assert RedisClient is PostgresStore


def test_get_pg_store_re_exported():
    """get_pg_store is re-exported from the shim for convenience."""
    from src.databases.pg_store import get_pg_store as canonical
    from src.databases.redis_client import get_pg_store as shim_export

    assert shim_export is canonical


def test_get_redis_client_emits_deprecation_warning():
    """get_redis_client() must emit DeprecationWarning when called."""
    from src.databases.redis_client import get_redis_client

    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        result = get_redis_client()

    assert len(w) == 1
    assert issubclass(w[0].category, DeprecationWarning)
    assert "deprecated" in str(w[0].message).lower()
    assert result is not None


def test_get_redis_client_returns_postgres_store():
    """get_redis_client() must return a PostgresStore (not a Redis connection)."""
    from src.databases.pg_store import PostgresStore
    from src.databases.redis_client import get_redis_client

    with warnings.catch_warnings(record=True):
        warnings.simplefilter("always")
        result = get_redis_client()

    assert isinstance(result, PostgresStore)


def test_no_redis_import_in_shim():
    """The shim must not import the redis package at module level."""
    import sys

    # Remove cached module to re-import fresh
    for key in list(sys.modules.keys()):
        if key == "src.databases.redis_client":
            del sys.modules[key]

    import ast

    src = open("src/databases/redis_client.py").read()
    tree = ast.parse(src)

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in getattr(node, "names", []):
                assert "redis" not in alias.name or "pg_store" in getattr(node, "module", ""), (
                    f"Bare redis import found in shim: {alias.name}"
                )
            module = getattr(node, "module", "") or ""
            assert not module.startswith("redis"), f"Redis module import found: {module}"
