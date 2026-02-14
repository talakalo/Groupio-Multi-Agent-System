"""Unit tests for the request logging middleware."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.api.middleware.logging import RequestLoggingMiddleware

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def middleware():
    """Create a RequestLoggingMiddleware instance with a dummy app."""
    app = AsyncMock()
    return RequestLoggingMiddleware(app)


@pytest.fixture
def mock_request():
    """Build a fake Starlette Request."""

    def _build(request_id: str | None = None, method: str = "GET", path: str = "/api/test"):
        request = MagicMock()
        request.method = method
        request.url.path = path
        request.state = MagicMock()

        headers = {}
        if request_id:
            headers["X-Request-ID"] = request_id
        request.headers.get = lambda key, default=None: headers.get(key, default)

        return request

    return _build


@pytest.fixture
def mock_response():
    """Build a fake Starlette Response returned by call_next."""
    response = MagicMock()
    response.status_code = 200
    response.headers = {}
    return response


# ------------------------------------------------------------------
# Tests
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_adds_request_id_header_to_response(middleware, mock_request, mock_response):
    """Response should include an X-Request-ID header."""
    call_next = AsyncMock(return_value=mock_response)
    request = mock_request()

    response = await middleware.dispatch(request, call_next)

    assert "X-Request-ID" in response.headers
    # Should be a valid UUID when auto-generated
    uuid.UUID(response.headers["X-Request-ID"])


@pytest.mark.asyncio
async def test_uses_client_provided_request_id(middleware, mock_request, mock_response):
    """When the client sends X-Request-ID, use that value."""
    client_id = "client-req-abc-123"
    call_next = AsyncMock(return_value=mock_response)
    request = mock_request(request_id=client_id)

    response = await middleware.dispatch(request, call_next)

    assert response.headers["X-Request-ID"] == client_id


@pytest.mark.asyncio
async def test_generates_new_request_id_when_not_provided(middleware, mock_request, mock_response):
    """When no X-Request-ID is sent, generate a new UUID."""
    call_next = AsyncMock(return_value=mock_response)
    request = mock_request(request_id=None)

    response = await middleware.dispatch(request, call_next)

    request_id = response.headers["X-Request-ID"]
    # Should be a valid UUID4
    parsed = uuid.UUID(request_id)
    assert parsed.version == 4


@pytest.mark.asyncio
async def test_logs_request_and_response(middleware, mock_request, mock_response):
    """Middleware should log both the incoming request and outgoing response."""
    call_next = AsyncMock(return_value=mock_response)
    request = mock_request(method="POST", path="/api/messages")

    with patch("src.api.middleware.logging.logger") as mock_logger:
        await middleware.dispatch(request, call_next)

        # At least two info calls: one for request, one for response
        assert mock_logger.info.call_count >= 2

        # First call should log the request method and path
        first_call_args = mock_logger.info.call_args_list[0]
        assert "POST" in str(first_call_args)
        assert "/api/messages" in str(first_call_args)

        # Second call should log the response status
        second_call_args = mock_logger.info.call_args_list[1]
        assert "200" in str(second_call_args)


@pytest.mark.asyncio
async def test_adds_duration_header(middleware, mock_request, mock_response):
    """Response should include an X-Duration-MS header with a numeric value."""
    call_next = AsyncMock(return_value=mock_response)
    request = mock_request()

    response = await middleware.dispatch(request, call_next)

    assert "X-Duration-MS" in response.headers
    duration = float(response.headers["X-Duration-MS"])
    assert duration >= 0


@pytest.mark.asyncio
async def test_logs_error_and_reraises_on_exception(middleware, mock_request):
    """When call_next raises, the middleware should log an error and re-raise."""
    error = RuntimeError("Something went wrong")
    call_next = AsyncMock(side_effect=error)
    request = mock_request()

    with patch("src.api.middleware.logging.logger") as mock_logger:
        with pytest.raises(RuntimeError, match="Something went wrong"):
            await middleware.dispatch(request, call_next)

        mock_logger.error.assert_called_once()
        error_args = str(mock_logger.error.call_args)
        assert "Something went wrong" in error_args
