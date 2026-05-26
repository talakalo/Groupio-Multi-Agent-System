"""gov integration package — typed access to data.gov.il open data."""

from .client import GovDataClient, get_gov_client
from .errors import GovBadResponseError, GovDisabledError, GovError, GovNotFoundError, GovTimeoutError
from .models import Company, GovResult, GovSource, Municipality, NormalizedAddressResult, Street

__all__ = [
    "GovDataClient",
    "get_gov_client",
    "GovResult",
    "GovSource",
    "GovError",
    "GovTimeoutError",
    "GovBadResponseError",
    "GovNotFoundError",
    "GovDisabledError",
    "Municipality",
    "Street",
    "Company",
    "NormalizedAddressResult",
]
