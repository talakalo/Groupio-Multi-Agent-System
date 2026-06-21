"""Reusable PostgresStore-backed TTL cache decorator for async functions.

Built on top of :class:`src.databases.pg_store.PostgresStore` so it shares
the same connection pool, JSON serialisation, and graceful-degradation
semantics as :class:`src.agents.base.LLMResponseCache`.

Usage:
    @cached("embed", ttl=86400, key_fn=lambda self, text: f"{self._model}:{text}")
    async def embed_text(self, text: str) -> list[float]: ...

Semantics:
    * Deterministic SHA256 cache key under the namespace ``{prefix}:``.
    * On a Redis outage the wrapped function is called and its result is
      returned without caching — cache failures never break the hot path.
    * A ``None`` return value from the wrapped function is **not** cached,
      so callers that legitimately return ``None`` do not poison the cache.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

KeyFn = Callable[..., str]


def _default_raw_key(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    """Build a stable string from positional and keyword arguments.

    ``self``/``cls`` (typically ``args[0]`` on bound methods) is intentionally
    *included* — if the instance state affects the result (e.g. the embedding
    model changes), the key should change too. Callers that want finer control
    should pass ``key_fn``.
    """
    return json.dumps({"a": args, "k": kwargs}, sort_keys=True, default=repr)


def cached(
    prefix: str,
    ttl: int = 3600,
    key_fn: KeyFn | None = None,
) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Decorator: memoize an async function in Redis with TTL.

    Args:
        prefix: Namespace for the cache key (e.g. ``"embed"``, ``"match"``).
            Keeps different caches from colliding and makes invalidation
            (``KEYS cache:embed:*``) straightforward during incidents.
        ttl: Time-to-live in seconds. Default 1 hour.
        key_fn: Optional ``(*args, **kwargs) -> str`` that builds the raw
            cache key. Useful for excluding ``self`` or for picking only a
            subset of the arguments. If omitted, all args/kwargs are hashed.

    Returns:
        A decorator that wraps the target coroutine.
    """

    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            from src.databases.pg_store import get_pg_store

            cache_key: str | None = None
            store = None
            try:
                raw = key_fn(*args, **kwargs) if key_fn else _default_raw_key(args, kwargs)
                digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
                cache_key = f"{prefix}:{digest}"
                store = get_pg_store()
                hit = await store.cache_get(cache_key)
                if hit is not None:
                    logger.debug("cache HIT %s", cache_key[:40])
                    return hit  # type: ignore[return-value]
            except Exception as exc:
                logger.debug("cache lookup bypassed for %s: %s", prefix, exc)
                cache_key = None

            result = await func(*args, **kwargs)

            if cache_key is not None and store is not None and result is not None:
                try:
                    await store.cache_set(cache_key, result, ttl=ttl)
                except Exception as exc:
                    logger.debug("cache store bypassed for %s: %s", prefix, exc)

            return result

        return wrapper

    return decorator
