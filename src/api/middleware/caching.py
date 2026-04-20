"""Cache-Control middleware — PERF-12.

Sets `Cache-Control` on API responses so browsers can short-circuit round-trips
for safe, low-volatility GETs (offers list, contractor list, buildings,
recent activity). Every mutation and every sensitive prefix (auth, payments,
admin) is forced to `no-store`. Unlisted GETs fall back to `no-cache`
(validators can still be used if/when we add ETag support).

This middleware is added AFTER ``SecurityHeadersMiddleware``; in Starlette's
nested stack that makes it the outermost response handler, so the explicit
values here override the conservative ``no-store`` default that
``SecurityHeadersMiddleware`` sets when no other code has written the header.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Path prefix → max-age (seconds). Ordered by specificity; first match wins.
_CACHEABLE_GET_PREFIXES: tuple[tuple[str, int], ...] = (
    ("/api/v1/activity/recent", 30),
    ("/api/v1/offers", 60),
    ("/api/v1/contractors", 60),
    ("/api/v1/buildings", 300),
)

# Never cache these, even on GET. Admin is deliberately excluded from any
# browser cache because admins see mutable aggregate state.
_SENSITIVE_PREFIXES: tuple[str, ...] = (
    "/api/v1/auth",
    "/api/v1/payments",
    "/api/v1/admin",
    "/api/v1/webhooks",
)

_MUTATING_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class CacheHeaderMiddleware(BaseHTTPMiddleware):
    """Attach Cache-Control headers to API responses based on method + path."""

    async def dispatch(self, request: Request, call_next) -> Response:  # noqa: ANN001
        response: Response = await call_next(request)

        path = request.url.path
        method = request.method.upper()

        if method in _MUTATING_METHODS:
            response.headers["Cache-Control"] = "no-store"
            return response

        if method != "GET":
            # HEAD, OPTIONS — leave whatever downstream middleware set.
            return response

        for prefix in _SENSITIVE_PREFIXES:
            if path.startswith(prefix):
                response.headers["Cache-Control"] = "no-store"
                return response

        for prefix, max_age in _CACHEABLE_GET_PREFIXES:
            if path.startswith(prefix):
                response.headers["Cache-Control"] = f"private, max-age={max_age}"
                return response

        response.headers["Cache-Control"] = "no-cache"
        return response
