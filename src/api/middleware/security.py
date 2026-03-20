"""Security headers middleware.

Adds industry-standard HTTP security headers to every response:

* **Strict-Transport-Security (HSTS)** – forces browsers to use HTTPS.
* **Content-Security-Policy (CSP)** – restricts content sources.
* **X-Content-Type-Options** – prevents MIME-sniffing.
* **X-Frame-Options** – prevents click-jacking.
* **Referrer-Policy** – limits referrer leakage.
* **Permissions-Policy** – disables unused browser features.
* **Cache-Control** – safe default for API responses.

Headers are applied only in non-development environments by default so
local dev servers are not impacted by HSTS or strict CSP.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject security headers into every HTTP response."""

    def __init__(self, app, *, environment: str = "production") -> None:  # noqa: ANN001
        super().__init__(app)
        self._is_production = environment not in {"development", "testing"}

    async def dispatch(self, request: Request, call_next) -> Response:  # noqa: ANN001
        response: Response = await call_next(request)

        # Always set these regardless of environment
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"

        if self._is_production:
            # HSTS: 1 year, include subdomains, allow preload submission
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

            # CSP: strict policy — no unsafe-inline.
            # Note: Swagger UI (/docs) uses inline styles. Disable it in production
            # (fastapi docs_url=None, redoc_url=None) or relax style-src only for
            # the /docs path via a reverse proxy if documentation must be accessible.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self'; "
                "img-src 'self' data: https:; "
                "font-src 'self'; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )

        # Safe cache default for API responses (don't cache authenticated data)
        if "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"

        return response
