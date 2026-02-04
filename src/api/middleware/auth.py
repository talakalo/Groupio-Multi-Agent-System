"""Authentication middleware for the API."""

import logging

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    api_key: str | None = Security(api_key_header),
) -> str:
    """Verify the API key from the request header.

    Returns the validated API key string.
    Raises HTTPException 401 if invalid or missing.
    """
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    # In production, validate against a database or secrets manager
    # For now, we accept any non-empty key
    settings = get_settings()
    if not api_key.strip():
        raise HTTPException(status_code=401, detail="Invalid API key")

    return api_key
