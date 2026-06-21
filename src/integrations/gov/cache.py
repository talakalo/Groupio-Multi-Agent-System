"""Cache backend for gov data client.

Provides a CacheBackend protocol with two implementations:
- RedisCacheBackend: production, backed by the project Redis instance (sync client)
- InMemoryCacheBackend: tests and offline dev, thread-safe dict with TTL
"""

from __future__ import annotations

import json
import threading
import time
from hashlib import sha1
from typing import Any, Protocol, runtime_checkable

# Cache key TTLs (seconds)
TTL_COMPANIES = 86_400  # 24h
TTL_SETTLEMENTS = 604_800  # 7d
TTL_STREETS = 604_800  # 7d
TTL_ADDRESS = 3_600  # 1h


def cache_key(source: str, **params: Any) -> str:
    """Deterministic cache key: gov:{source}:{sha1(sorted params)}."""
    digest = sha1(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()[:16]
    return f"gov:{source}:{digest}"


@runtime_checkable
class CacheBackend(Protocol):
    def get(self, key: str) -> bytes | None: ...
    def set(self, key: str, value: bytes, ttl: int) -> None: ...
    def delete(self, key: str) -> None: ...


class InMemoryCacheBackend:
    """Thread-safe in-memory cache with TTL. For tests and offline use."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[bytes, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> bytes | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: bytes, ttl: int) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + ttl)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._store)


class PostgresCacheBackend:
    """Postgres-backed cache (sync wrapper using a new event loop).

    The gov integration is sync (not async). We bridge by running
    asyncio coroutines via asyncio.get_event_loop().run_until_complete()
    or asyncio.run(). Falls back to no-op on any error.
    """

    def get(self, key: str) -> bytes | None:
        try:
            import asyncio

            from src.databases.pg_store import get_pg_store

            store = get_pg_store()
            result = asyncio.get_event_loop().run_until_complete(store.cache_get(key))
            if result is None:
                return None
            import json

            return json.dumps(result).encode() if not isinstance(result, bytes) else result
        except Exception:
            return None

    def set(self, key: str, value: bytes, ttl: int) -> None:
        try:
            import asyncio
            import json

            from src.databases.pg_store import get_pg_store

            store = get_pg_store()
            data = json.loads(value) if isinstance(value, bytes) else value
            asyncio.get_event_loop().run_until_complete(store.cache_set(key, data, ttl=ttl))
        except Exception:
            pass

    def delete(self, key: str) -> None:
        try:
            import asyncio

            from src.databases.pg_store import get_pg_store

            store = get_pg_store()
            asyncio.get_event_loop().run_until_complete(store.cache_delete(key))
        except Exception:
            pass


# Deprecated: use PostgresCacheBackend instead. Redis removed from production stack.
class RedisCacheBackend:
    """Redis-backed cache backend (sync client, gov: key namespace)."""

    def __init__(self, redis_url: str = "redis://localhost:6379/0") -> None:
        import redis as sync_redis

        self._redis = sync_redis.from_url(redis_url, decode_responses=False)

    def get(self, key: str) -> bytes | None:
        try:
            return self._redis.get(key)
        except Exception:
            return None

    def set(self, key: str, value: bytes, ttl: int) -> None:
        try:
            self._redis.set(key, value, ex=ttl)
        except Exception:
            pass

    def delete(self, key: str) -> None:
        try:
            self._redis.delete(key)
        except Exception:
            pass
