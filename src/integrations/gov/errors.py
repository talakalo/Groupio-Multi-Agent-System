"""Error taxonomy for gov/open-data integration."""

from __future__ import annotations


class GovError(Exception):
    """Base error for all gov integration failures."""


class GovTimeoutError(GovError):
    """HTTP connect or read timeout."""


class GovBadResponseError(GovError):
    """Unexpected response structure or non-2xx status."""


class GovNotFoundError(GovError):
    """Record not found in the registry."""


class GovDisabledError(GovError):
    """Integration disabled via feature flag."""
