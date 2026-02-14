"""Request logging middleware."""

import logging
import time
import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs request/response metadata with request ID tracking."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start_time = time.time()

        # Add request ID to state for downstream access
        request.state.request_id = request_id

        logger.info(
            "Request %s: %s %s",
            request_id,
            request.method,
            request.url.path,
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
            logger.error(
                "Error %s: %s duration=%.1fms",
                request_id,
                str(e),
                duration_ms,
                exc_info=True,
            )
            raise
