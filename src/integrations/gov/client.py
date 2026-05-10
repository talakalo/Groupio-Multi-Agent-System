"""Gov data client — typed interface to data.gov.il CKAN datastore.

Single entry point for all government/open-data access. Replaces the old
src/services/datagov_provider.DataGovIlProvider.

M3 additions (over M2):
- locale parameter on resolve_municipality / resolve_street (he / en)
- English name field (שם_ישוב_לועזי) populated on Municipality
- rapidfuzz-based street matching (partial_ratio ≥ STREET_FUZZY_THRESHOLD)

Usage:
    from src.integrations.gov.client import GovDataClient
    client = GovDataClient()
    result = client.lookup_company("some company name")
    result = client.resolve_municipality("Tel Aviv", locale="en")
"""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

import httpx
from rapidfuzz import fuzz
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .cache import (
    TTL_ADDRESS,
    TTL_COMPANIES,
    TTL_SETTLEMENTS,
    TTL_STREETS,
    CacheBackend,
    InMemoryCacheBackend,
    RedisCacheBackend,
    cache_key,
)
from .circuit import CircuitBreaker, CircuitOpenError
from .errors import GovBadResponseError, GovTimeoutError
from .models import (
    Company,
    GovResult,
    GovSource,
    Municipality,
    NormalizedAddressResult,
    Street,
)

logger = logging.getLogger(__name__)

DATAGOV_BASE = "https://data.gov.il/api/3/action"
USER_AGENT = "datagov-external-client/1.0 Groupio/1.0"

RESOURCE_SETTLEMENTS = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba"
RESOURCE_STREETS = "9ad3862c-8391-4b2f-84a4-2d4c68625f4b"
RESOURCE_COMPANIES = "f004176c-b85f-4542-8901-7b3176f9a054"

FLD_SYMBOL_YESHUV = "סמל_ישוב"
FLD_NAME_YESHUV = "שם_ישוב"
FLD_NAME_YESHUV_LAAZ = "שם_ישוב_לועזי"  # English transliteration
FLD_NAME_NAFA = "שם_נפה"
FLD_LISHKA = "לשכה"
FLD_SYMBOL_REHOV = "סמל_רחוב"
FLD_NAME_REHOV = "שם_רחוב"

STREET_FUZZY_THRESHOLD = 75  # rapidfuzz partial_ratio 0-100

# ---------------------------------------------------------------------------
# Prometheus metrics (registered once at import time)
# ---------------------------------------------------------------------------
try:
    from prometheus_client import Counter, Histogram

    _gov_requests_total = Counter(
        "gov_requests_total",
        "Total gov data requests",
        ["source", "outcome"],
    )
    _gov_request_seconds = Histogram(
        "gov_request_seconds",
        "Gov data request latency",
        ["source"],
        buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    )
    _gov_cache_hits_total = Counter(
        "gov_cache_hits_total",
        "Gov data cache hits",
        ["source"],
    )
    _METRICS_ENABLED = True
except Exception:
    _METRICS_ENABLED = False


def _record_request(source: str, outcome: str, elapsed: float) -> None:
    if not _METRICS_ENABLED:
        return
    try:
        _gov_requests_total.labels(source=source, outcome=outcome).inc()
        _gov_request_seconds.labels(source=source).observe(elapsed)
    except Exception:
        pass


def _record_cache_hit(source: str) -> None:
    if not _METRICS_ENABLED:
        return
    try:
        _gov_cache_hits_total.labels(source=source).inc()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_hebrew(s: str | None) -> str:
    if not s or not isinstance(s, str):
        return ""
    return s.strip().replace("‎", "").replace("‏", "")


def _fuzzy_match(a: str, b: str) -> bool:
    """Simple substring match — used for company names."""
    na, nb = _normalize_hebrew(a).lower(), _normalize_hebrew(b).lower()
    if not na or not nb:
        return False
    return na in nb or nb in na


def _street_match(query: str, candidate: str, threshold: int = STREET_FUZZY_THRESHOLD) -> bool:
    """rapidfuzz partial_ratio match for street names — tolerates prefix/typo variations."""
    nq = _normalize_hebrew(query).strip()
    nc = _normalize_hebrew(candidate).strip()
    if not nq or not nc:
        return False
    return fuzz.partial_ratio(nq, nc) >= threshold


def _city_match(query: str, candidate: str) -> bool:
    """Match city name: exact after normalization, or rapidfuzz WRatio ≥ 85."""
    nq = _normalize_hebrew(query).lower()
    nc = _normalize_hebrew(candidate).lower()
    if not nq or not nc:
        return False
    if nq == nc or nq in nc or nc in nq:
        return True
    return fuzz.WRatio(nq, nc) >= 85


def _serialize(obj: Any) -> bytes:
    return json.dumps(obj, default=str).encode()


def _deserialize(raw: bytes) -> Any:
    return json.loads(raw)


# ---------------------------------------------------------------------------
# GovDataClient
# ---------------------------------------------------------------------------


class GovDataClient:
    """Typed client for data.gov.il CKAN datastore with caching, retries, and circuit breaking.

    All methods return GovResult[T]. Failures are caught and returned as error results
    rather than raised, so callers never need to handle exceptions.
    """

    def __init__(
        self,
        base_url: str = DATAGOV_BASE,
        connect_timeout: float = 5.0,
        read_timeout: float = 10.0,
        user_agent: str = USER_AGENT,
        enabled: bool = True,
        cache: CacheBackend | None = None,
        circuit_fail_threshold: int = 5,
        circuit_cooldown_sec: float = 60.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._connect_timeout = connect_timeout
        self._read_timeout = read_timeout
        self._headers = {"User-Agent": user_agent, "Content-Type": "application/json"}
        self._enabled = enabled
        self._cache: CacheBackend = cache if cache is not None else InMemoryCacheBackend()
        self._circuit = CircuitBreaker(
            fail_threshold=circuit_fail_threshold,
            cooldown_sec=circuit_cooldown_sec,
            name="gov",
        )

    def _now(self) -> datetime:
        return datetime.now(UTC)

    # --- raw HTTP + tenacity retry ---

    @retry(
        retry=retry_if_exception_type((GovTimeoutError, GovBadResponseError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
        reraise=True,
    )
    def _post_with_retry(self, action: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """POST to CKAN with tenacity retry on timeout/5xx."""
        url = f"{self._base}/{action}"
        timeout = httpx.Timeout(connect=self._connect_timeout, read=self._read_timeout, write=5.0, pool=5.0)
        try:
            with httpx.Client(timeout=timeout, headers=self._headers) as client:
                resp = client.post(url, json=data)
                resp.raise_for_status()
                out = resp.json()
                if not out.get("success"):
                    raise GovBadResponseError(f"data.gov.il {action} returned success=false")
                return out.get("result")
        except httpx.TimeoutException as e:
            raise GovTimeoutError(str(e)) from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500:
                raise GovBadResponseError(str(e)) from e
            raise GovBadResponseError(str(e)) from e
        except httpx.HTTPError as e:
            raise GovBadResponseError(str(e)) from e

    def _post(self, action: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """POST through circuit breaker → retry → HTTP."""
        if not self._circuit.allow_request():
            raise CircuitOpenError(f"gov circuit is open (state={self._circuit.state})")
        t0 = time.perf_counter()
        source_label = "gov"
        try:
            result = self._post_with_retry(action, data)
            self._circuit.record_success()
            _record_request(source_label, "success", time.perf_counter() - t0)
            return result
        except (GovTimeoutError, GovBadResponseError):
            self._circuit.record_failure()
            _record_request(source_label, "error", time.perf_counter() - t0)
            raise

    def _datastore_search(
        self,
        resource_id: str,
        filters: dict[str, str | int] | None = None,
        fields: list[str] | None = None,
        limit: int = 10,
        offset: int = 0,
        q: str | None = None,
    ) -> list[dict[str, Any]]:
        data: dict[str, Any] = {"resource_id": resource_id, "limit": limit, "offset": offset}
        if q:
            data["q"] = q
        if filters:
            data["filters"] = filters
        if fields:
            data["fields"] = fields
        result = self._post("datastore_search", data)
        if not result or not isinstance(result, dict):
            return []
        records = result.get("records", [])
        return records if isinstance(records, list) else []

    # --- cache helpers ---

    def _cache_get(self, key: str, source: str) -> list[dict] | None:
        raw = self._cache.get(key)
        if raw is not None:
            _record_cache_hit(source)
            return _deserialize(raw)
        return None

    def _cache_set(self, key: str, records: list[dict], ttl: int) -> None:
        self._cache.set(key, _serialize(records), ttl)

    # --- result builders ---

    def _disabled_result(self) -> GovResult[Any]:
        return GovResult(
            value=None,
            confidence=0.0,
            source=GovSource.DISABLED,
            fetched_at=self._now(),
            error="gov integration disabled",
        )

    def _error_result(self, source: GovSource, err: Exception) -> GovResult[Any]:
        return GovResult(
            value=None,
            confidence=0.0,
            source=source,
            fetched_at=self._now(),
            error=str(err),
        )

    # ---------------------------------------------------------------------------
    # Public API
    # ---------------------------------------------------------------------------

    def lookup_company(
        self,
        name: str,
        company_id: str | None = None,
        limit: int = 5,
    ) -> GovResult[list[Company]]:
        """Search companies registry (ICA). NOT contractor license verification."""
        if not self._enabled:
            return self._disabled_result()
        name = _normalize_hebrew(name)
        if not name and not company_id:
            return GovResult(value=[], confidence=0.0, source=GovSource.DATA_GOV_IL_COMPANIES, fetched_at=self._now())

        ck = cache_key("companies", name=name, company_id=company_id, limit=limit)
        cached = self._cache_get(ck, "companies")
        if cached is not None:
            companies = [Company(**r) for r in cached]
            return GovResult(
                value=companies,
                confidence=0.8 if companies else 0.0,
                source=GovSource.DATA_GOV_IL_COMPANIES,
                fetched_at=self._now(),
                cache_hit=True,
            )

        try:
            filters: dict[str, str | int] | None = None
            if company_id:
                filters = {"מספר חברה": int(company_id) if str(company_id).isdigit() else company_id}
            records = self._datastore_search(
                RESOURCE_COMPANIES,
                filters=filters,
                fields=["מספר חברה", "שם חברה", "סטטוס חברה", "שם עיר", "שם רחוב", "מספר בית"],
                limit=limit,
                q=name if not company_id else None,
            )
            companies = []
            for rec in records:
                comp_name = _normalize_hebrew(rec.get("שם חברה"))
                if not company_id and not _fuzzy_match(name, comp_name) and not _fuzzy_match(comp_name, name):
                    continue
                companies.append(
                    Company(
                        company_id=str(rec.get("מספר חברה", "")),
                        name=comp_name,
                        status=_normalize_hebrew(rec.get("סטטוס חברה", "")),
                        city=_normalize_hebrew(rec.get("שם עיר", "")),
                        address=f"{_normalize_hebrew(rec.get('שם רחוב', ''))} {rec.get('מספר בית', '')}".strip(),
                    )
                )
            self._cache_set(ck, [c.__dict__ for c in companies], TTL_COMPANIES)
            return GovResult(
                value=companies,
                confidence=0.8 if companies else 0.0,
                source=GovSource.DATA_GOV_IL_COMPANIES,
                fetched_at=self._now(),
            )
        except (GovTimeoutError, GovBadResponseError, CircuitOpenError) as e:
            logger.warning("gov lookup_company failed: %s", e)
            return self._error_result(GovSource.DATA_GOV_IL_COMPANIES, e)

    def resolve_municipality(self, city: str, locale: str = "he") -> GovResult[Municipality]:
        """Resolve city name to municipality metadata via settlements dataset.

        locale="he": match against Hebrew name field (שם_ישוב).
        locale="en": match against English transliteration field (שם_ישוב_לועזי),
                     fall back to Hebrew fuzzy match if no English field found.
        """
        if not self._enabled:
            return self._disabled_result()
        city_norm = _normalize_hebrew(city) if locale == "he" else city.strip()
        if not city_norm:
            return self._error_result(GovSource.DATA_GOV_IL_SETTLEMENTS, ValueError("city required"))

        ck = cache_key("settlements", city=city_norm, locale=locale)
        cached = self._cache_get(ck, "settlements")
        if cached is not None:
            if not cached:
                return GovResult(
                    value=None,
                    confidence=0.0,
                    source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                    fetched_at=self._now(),
                    cache_hit=True,
                    error="city not found",
                )
            m = Municipality(**cached[0])
            return GovResult(
                value=m,
                confidence=0.9,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=self._now(),
                cache_hit=True,
            )

        try:
            records = self._datastore_search(
                RESOURCE_SETTLEMENTS,
                fields=[FLD_SYMBOL_YESHUV, FLD_NAME_YESHUV, FLD_NAME_YESHUV_LAAZ, FLD_NAME_NAFA, FLD_LISHKA],
                limit=20,
                q=city_norm,
            )
            for rec in records:
                name_he = _normalize_hebrew(rec.get(FLD_NAME_YESHUV))
                name_en = _normalize_hebrew(rec.get(FLD_NAME_YESHUV_LAAZ)) or None

                if locale == "en":
                    matched = (name_en and _city_match(city_norm, name_en)) or _city_match(city_norm, name_he)
                else:
                    matched = _city_match(city_norm, name_he)

                if matched:
                    m = Municipality(
                        municipality_code=str(rec.get(FLD_SYMBOL_YESHUV, "")).strip(),
                        municipality_name_he=name_he,
                        municipality_name_en=name_en,
                        district=_normalize_hebrew(rec.get(FLD_NAME_NAFA)) or None,
                        region=_normalize_hebrew(rec.get(FLD_LISHKA)) or None,
                    )
                    self._cache_set(ck, [m.__dict__], TTL_SETTLEMENTS)
                    return GovResult(
                        value=m, confidence=0.9, source=GovSource.DATA_GOV_IL_SETTLEMENTS, fetched_at=self._now()
                    )
            self._cache_set(ck, [], TTL_SETTLEMENTS)
            return GovResult(
                value=None,
                confidence=0.0,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=self._now(),
                error="city not found",
            )
        except (GovTimeoutError, GovBadResponseError, CircuitOpenError) as e:
            logger.warning("gov resolve_municipality failed: %s", e)
            return self._error_result(GovSource.DATA_GOV_IL_SETTLEMENTS, e)

    def resolve_street(
        self,
        city: str,
        street: str,
        municipality_code: str | None = None,
        locale: str = "he",
    ) -> GovResult[Street]:
        """Resolve street name within a city via streets dataset.

        Uses rapidfuzz partial_ratio (threshold=STREET_FUZZY_THRESHOLD) for
        tolerant matching of prefixes, typographic variants, and abbreviations.
        """
        if not self._enabled:
            return self._disabled_result()
        city = _normalize_hebrew(city)
        street_norm = _normalize_hebrew(street) if locale == "he" else street.strip()
        if not city or not street_norm:
            return self._error_result(GovSource.DATA_GOV_IL_STREETS, ValueError("city and street required"))

        ck = cache_key("streets", city=city, street=street_norm, municipality_code=municipality_code, locale=locale)
        cached = self._cache_get(ck, "streets")
        if cached is not None:
            if not cached:
                return GovResult(
                    value=None,
                    confidence=0.0,
                    source=GovSource.DATA_GOV_IL_STREETS,
                    fetched_at=self._now(),
                    cache_hit=True,
                    error="street not found",
                )
            s = Street(**cached[0])
            return GovResult(
                value=s, confidence=0.85, source=GovSource.DATA_GOV_IL_STREETS, fetched_at=self._now(), cache_hit=True
            )

        try:
            symbol_int: int | None = None
            if municipality_code:
                try:
                    symbol_int = int(municipality_code)
                except (ValueError, TypeError):
                    pass

            if symbol_int is not None:
                records = self._datastore_search(RESOURCE_STREETS, filters={FLD_SYMBOL_YESHUV: symbol_int}, limit=100)
            else:
                records = self._datastore_search(RESOURCE_STREETS, limit=50, q=street_norm)

            best_score = 0
            best_rec: dict | None = None
            for rec in records:
                name_rehov = _normalize_hebrew(rec.get(FLD_NAME_REHOV))
                score = fuzz.partial_ratio(_normalize_hebrew(street_norm), name_rehov)
                if score > best_score:
                    best_score = score
                    best_rec = rec

            if best_rec and best_score >= STREET_FUZZY_THRESHOLD:
                name_rehov = _normalize_hebrew(best_rec.get(FLD_NAME_REHOV))
                confidence = min(0.95, 0.7 + (best_score - STREET_FUZZY_THRESHOLD) / 100)
                s = Street(
                    street_code=str(best_rec.get(FLD_SYMBOL_REHOV, "")).strip(),
                    street_name=name_rehov,
                    city=city,
                )
                self._cache_set(ck, [s.__dict__], TTL_STREETS)
                return GovResult(
                    value=s, confidence=confidence, source=GovSource.DATA_GOV_IL_STREETS, fetched_at=self._now()
                )

            self._cache_set(ck, [], TTL_STREETS)
            return GovResult(
                value=None,
                confidence=0.0,
                source=GovSource.DATA_GOV_IL_STREETS,
                fetched_at=self._now(),
                error="street not found",
            )
        except (GovTimeoutError, GovBadResponseError, CircuitOpenError) as e:
            logger.warning("gov resolve_street failed: %s", e)
            return self._error_result(GovSource.DATA_GOV_IL_STREETS, e)

    def normalize_address(
        self,
        city: str,
        street: str | None = None,
        house_number: str | None = None,
        free_text: str | None = None,
        locale: str = "he",
    ) -> GovResult[NormalizedAddressResult]:
        """Normalize address using settlements + streets datasets.

        Returns municipality_code when confidence ≥ ENRICHMENT_MIN_CONFIDENCE_ACCEPT.
        """
        if not self._enabled:
            return self._disabled_result()
        city_norm = _normalize_hebrew(city) if locale == "he" else city.strip()
        if not city_norm:
            return self._error_result(GovSource.DATA_GOV_IL_SETTLEMENTS, ValueError("city required"))

        ck = cache_key(
            "address", city=city_norm, street=street, house_number=house_number, free_text=free_text, locale=locale
        )
        cached_raw = self._cache.get(ck)
        if cached_raw is not None:
            _record_cache_hit("address")
            data = _deserialize(cached_raw)
            return GovResult(
                value=NormalizedAddressResult(**data["value"]) if data.get("value") else None,
                confidence=data["confidence"],
                source=GovSource(data["source"]),
                fetched_at=self._now(),
                cache_hit=True,
                error=data.get("error"),
            )

        muni_result = self.resolve_municipality(city_norm, locale=locale)
        if not muni_result.ok:
            return GovResult(
                value=None,
                confidence=0.0,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=self._now(),
                error=muni_result.error or "municipality not found",
            )

        muni = muni_result.value
        assert muni is not None

        if not muni.municipality_code:
            addr = f"{street or free_text or ''} {city_norm}".strip()
            result = GovResult(
                value=NormalizedAddressResult(addr, city_norm, street, house_number, muni.municipality_name_he, None),
                confidence=0.6,
                source=GovSource.DATA_GOV_IL_SETTLEMENTS,
                fetched_at=self._now(),
            )
            self._cache_set_address(ck, result)
            return result

        street_canon: str | None = None
        if street or free_text:
            street_result = self.resolve_street(
                city_norm, street or free_text or "", muni.municipality_code, locale=locale
            )
            if street_result.ok and street_result.value:
                street_canon = street_result.value.street_name

        addr_parts = [street_canon or street or free_text or "", house_number or ""]
        address = " ".join(p for p in addr_parts if p).strip() or city_norm

        confidence = 0.85 if street_canon else 0.7
        result = GovResult(
            value=NormalizedAddressResult(
                address,
                city_norm,
                street_canon or street,
                house_number,
                muni.municipality_name_he,
                muni.municipality_code,
            ),
            confidence=confidence,
            source=GovSource.DATA_GOV_IL_SETTLEMENTS,
            fetched_at=self._now(),
        )
        self._cache_set_address(ck, result)
        return result

    def _cache_set_address(self, ck: str, result: GovResult[NormalizedAddressResult]) -> None:
        payload = {
            "value": result.value.__dict__ if result.value else None,
            "confidence": result.confidence,
            "source": result.source.value,
            "error": result.error,
        }
        self._cache.set(ck, _serialize(payload), TTL_ADDRESS)


# ---------------------------------------------------------------------------
# Singleton factory (settings-wired)
# ---------------------------------------------------------------------------

_client: GovDataClient | None = None


def get_gov_client(enabled: bool = True) -> GovDataClient:
    """Get or create the singleton GovDataClient, wired to settings and Redis."""
    global _client
    if _client is None:
        try:
            from src.config.settings import get_settings

            s = get_settings()
            enabled = enabled and str(getattr(s, "ENABLE_DATAGOV_IL", "1")).lower() in ("1", "true", "yes")

            # Prefer Redis for shared, persistent caching across workers.
            # Fall back to InMemoryCacheBackend when Redis is unreachable.
            cache: CacheBackend = InMemoryCacheBackend()
            redis_url = getattr(s, "REDIS_URL", "redis://localhost:6379")
            if redis_url:
                try:
                    redis_backend = RedisCacheBackend(redis_url=redis_url)
                    # Smoke-test the connection so we don't silently use a broken backend.
                    redis_backend.get("gov:ping")
                    cache = redis_backend
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Gov client: Redis unavailable (%s) — falling back to in-memory cache", exc)

            _client = GovDataClient(
                connect_timeout=getattr(s, "GOV_HTTP_CONNECT_TIMEOUT_SEC", 5.0),
                read_timeout=getattr(s, "GOV_HTTP_READ_TIMEOUT_SEC", 10.0),
                enabled=enabled,
                cache=cache,
                circuit_fail_threshold=int(getattr(s, "GOV_CIRCUIT_FAIL_THRESHOLD", 5)),
                circuit_cooldown_sec=float(getattr(s, "GOV_CIRCUIT_COOLDOWN_SEC", 60.0)),
            )
        except Exception:
            _client = GovDataClient(enabled=enabled)
    return _client
