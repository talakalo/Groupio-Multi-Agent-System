"""Request logging middleware with PII redaction."""

import logging
import re
import time
import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.utils.pii import redact_pii

logger = logging.getLogger(__name__)

# Accept only alphanumeric + hyphen request IDs to prevent log injection.
# Silently drop any X-Request-ID header that doesn't match.
_REQUEST_ID_RE = re.compile(r"^[a-zA-Z0-9\-]{1,64}$")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs request/response metadata with request ID tracking.

    All logged values are passed through :func:`redact_pii` so that emails,
    phone numbers, Israeli IDs, credit-card numbers, and JWTs never appear
    in plain text in application logs.

    X-Request-ID is validated against a strict pattern before being logged or
    propagated to prevent log injection via crafted header values.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        raw_request_id = request.headers.get("X-Request-ID", "")
        # Validate format to prevent log injection; generate fresh ID if invalid
        if raw_request_id and _REQUEST_ID_RE.match(raw_request_id):
            request_id = raw_request_id
        else:
            request_id = str(uuid.uuid4())
        start_time = time.time()

        # Add request ID to state for downstream access
        request.state.request_id = request_id

        # Redact query string to avoid leaking tokens / PII in URLs
        safe_path = redact_pii(str(request.url))

        logger.info(
            "Request %s: %s %s",
            request_id,
            request.method,
            safe_path,
        )

        try:
            response = await call_next(request)

            duration_ms = (time.time() - start_time) * 1000
            logger.info(
                "Response %s: status=%d duration=%.1fms",
                request_id,
                response.status_code,
                duration_ms,
            )

            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Duration-MS"] = f"{duration_ms:.1f}"

            return response

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            # Redact exception message to avoid PII leaking via error text
            logger.error(
                "Error %s: %s duration=%.1fms",
                request_id,
                redact_pii(str(e)),
                duration_ms,
                exc_info=True,
            )
            raise
