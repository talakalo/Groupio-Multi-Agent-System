"""Typed result models for gov/open-data integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Generic, TypeVar

T = TypeVar("T")


class GovSource(str, Enum):
    DATA_GOV_IL_COMPANIES = "data_gov_il_companies"
    DATA_GOV_IL_STREETS = "data_gov_il_streets"
    DATA_GOV_IL_SETTLEMENTS = "data_gov_il_settlements"
    INTERNAL_STUB = "internal_stub"
    DISABLED = "disabled"


@dataclass
class GovResult(Generic[T]):
    """Typed result wrapper for all gov data client calls."""

    value: T | None
    confidence: float
    source: GovSource
    fetched_at: datetime
    cache_hit: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.value is not None and self.error is None


@dataclass
class Municipality:
    municipality_code: str
    municipality_name_he: str
    municipality_name_en: str | None
    district: str | None
    region: str | None


@dataclass
class Street:
    street_code: str
    street_name: str
    city: str


@dataclass
class Company:
    company_id: str
    name: str
    status: str
    city: str
    address: str

    @property
    def is_active(self) -> bool:
        return self.status == "פעילה"


@dataclass
class NormalizedAddressResult:
    address: str
    city: str
    street: str | None
    house_number: str | None
    municipality: str | None
    municipality_code: str | None = None
