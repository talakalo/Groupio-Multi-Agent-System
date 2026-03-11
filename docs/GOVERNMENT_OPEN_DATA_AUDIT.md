# Government / Open-Data Integration Audit

**Date:** 2025-03-10  
**Repository:** Groupio-Multi-Agent-System

---

## 1. REAL REPOSITORY ARCHITECTURE

### Canonical Runtime Path

| Component | Technology | Entry Point |
|-----------|------------|-------------|
| **Backend** | FastAPI + Uvicorn | `src/api/main.py` |
| **Start command** | `uvicorn src.api.main:app --host 0.0.0.0 --port 8000` | `docker/Dockerfile` L53 |
| **Web app** | Next.js 15 | `apps/web` |
| **Admin app** | Next.js 14 | `apps/admin` |
| **Mobile app** | Expo 51 | `apps/mobile` |
| **Worker** | Python | `python -m src.workers.agent_worker` |

### Runtime-Critical Directories

| Path | Role |
|------|------|
| `src/api/` | FastAPI routes, middleware |
| `src/agents/` | LangGraph agents (vetting, matching, pricing, etc.) |
| `src/orchestration/` | LangGraph graph, tools, state |
| `src/databases/` | PostgreSQL, Qdrant, Neo4j, Redis |
| `src/services/` | Email, payment, storage, WhatsApp |
| `src/models/` | Pydantic models |
| `src/rag/` | RAG pipeline, embeddings |
| `alembic/versions/` | Database migrations |
| `apps/web/`, `apps/admin/` | Frontends |

### Non-Critical / Docs / Templates

| Path | Role |
|------|------|
| `docs/` | Documentation |
| `tests/` | Unit and integration tests |
| `scripts/` | Seed scripts, utilities |
| `monitoring/` | Prometheus config |
| `packages/` | Shared types, API client |

### Actual Extension Points

| Extension Point | Location | Purpose |
|-----------------|----------|---------|
| **Service layer** | `src/services/` | Business logic, external APIs |
| **Tool registry** | `src/orchestration/tools.py` | Agent-callable tools |
| **Routes** | `src/api/routes/` | HTTP API |
| **Migrations** | `alembic/versions/` | Schema changes |
| **Vetting agent** | `src/agents/vetting.py` | Contractor verification |
| **Onboarding** | `src/api/routes/onboarding.py` | Building/contractor creation |
| **PostgresClient** | `src/databases/postgres.py` | DB operations |

---

## 2. EXISTING IMPLEMENTATION FOUND

### Address / Building Logic

| Capability | Status | Location |
|------------|--------|----------|
| Building address storage | **Implemented** | `buildings.address`, `buildings.city`, `buildings.region` |
| Building lookup | **Implemented** | `_find_building_by_address()` – exact match, case-insensitive |
| Address normalization | **Missing** | No canonical formatting, no street synonym |
| Geocoding | **Missing** | No external geocoding |
| Municipality mapping | **Missing** | No municipality table or lookup |

**Files:** `src/models/building.py`, `src/api/routes/onboarding.py` L243–252, `alembic/versions/001_initial_schema.py` L45–66

### Contractor Verification

| Capability | Status | Location |
|------------|--------|----------|
| Verification status | **Implemented** | `contractors.verification_status` (pending/verified/suspended/rejected) |
| Trust score | **Implemented** | `contractors.trust_score`, `trust_score_breakdown` |
| License number | **Implemented** | `contractors.license_number`, `license_verified` |
| Vetting agent | **Implemented** | `src/agents/vetting.py` – LLM doc analysis, graph reputation |
| External license API | **Missing** | Vetting config lists `check_license_api` but it is **not implemented** |
| Government registry | **Missing** | No external contractor/license verification |

**Files:** `src/models/contractor.py`, `src/agents/vetting.py`, `src/api/routes/contractors.py` L327–350

### Tool Registry

| Tool | Status |
|------|--------|
| `vector_search` | Implemented |
| `graph_query` | Implemented |
| `sql_query` | Implemented |
| `get_order_status` | Implemented |
| `get_offer_details` | Implemented |
| `get_market_data` | Implemented |
| `calculate_match_score` | Implemented |
| `analyze_sentiment` | Implemented |
| `escalate_to_human` | Implemented |
| `create_support_ticket` | Implemented |
| **Address normalization** | **Missing** |
| **Contractor verification** | **Missing** |
| **Municipality lookup** | **Missing** |

**File:** `src/orchestration/tools.py`

### Ingestion / Sync

| Capability | Status |
|------------|--------|
| Alembic migrations | Implemented |
| Seed scripts | `scripts/seed_user_accounts.py` |
| Cron/background jobs | Worker for agent tasks |
| Reference data sync | **Missing** – no municipality/street data ingestion |

---

## 3. GAPS IDENTIFIED

| Capability | Gap | Recommended Location |
|------------|-----|------------------------|
| **Address normalization** | No canonical formatting, no street synonym resolution | `src/services/enrichment.py` |
| **Municipality enrichment** | No city→municipality mapping | `src/services/enrichment.py` |
| **Contractor verification (external)** | No government/license registry lookup | `src/services/enrichment.py` + ToolRegistry |
| **Building enrichment** | No geocoding or municipality on building create | Optional: extend onboarding |
| **Tool integration** | No tools for enrichment in ToolRegistry | `src/orchestration/tools.py` |
| **Verification metadata** | No persistent storage of verification source/confidence | Migration: `contractor_verification_metadata` |

### Duplication / Overlap to Avoid

- Do **not** create a parallel backend; extend `src/services/`
- Do **not** duplicate building/contractor models; extend existing
- Do **not** replace vetting agent; extend it to optionally call verification tool
- Do **not** add new route families; expose via existing patterns (service → tool → agent)

---

## 4. IMPLEMENTATION PLAN

### Phase 1: Service Layer (Minimal)

1. **Create `src/services/enrichment.py`**
   - `normalize_address(address: str, city: str) -> dict` – stub returning input + confidence=0 until real API configured
   - `get_municipality_info(city: str) -> dict | None` – stub returning None
   - `verify_contractor_license(license_number: str, business_name: str | None) -> dict` – stub returning `verified=False`, `confidence=0`
   - All functions accept optional `source` override for testing
   - Env vars: `GOV_ADDRESS_API_URL`, `GOV_CONTRACTOR_API_URL` (optional, for future)

2. **Add tools to `src/orchestration/tools.py`**
   - `normalize_address` – calls enrichment service
   - `verify_contractor_license` – calls enrichment service
   - `get_municipality_info` – calls enrichment service

3. **Migration** – `015_contractor_verification_metadata.py`
   - Table `contractor_verification_metadata`: contractor_id, source, verified, confidence, verified_at, raw_response (JSONB)
   - Allows persistence of verification results for audit trail

4. **Vetting agent** – Optional: when documents include license_number, call `verify_contractor_license` tool if registered. Non-blocking; existing flow unchanged.

5. **Onboarding** – No change in Phase 1. Address normalization can be wired later when real API is configured.

### Phase 2 (Future, Not Implemented)

- Wire real government APIs when URLs/keys are configured
- Add municipality reference table + sync script
- Add street alias table for synonym resolution
- Extend building creation to optionally normalize address before lookup

---

## 5. CODE CHANGES (Phase 1)

| File | Change |
|------|--------|
| `src/services/enrichment.py` | **New** – EnrichmentService with normalize_address, get_municipality_info, verify_contractor_license (stub implementations) |
| `src/orchestration/tools.py` | **Extended** – Added tools: normalize_address, verify_contractor_license, get_municipality_info |
| `src/config/settings.py` | **Extended** – Added GOV_ADDRESS_API_URL, GOV_CONTRACTOR_API_URL, GOV_MUNICIPALITY_API_URL |
| `alembic/versions/015_contractor_verification_metadata.py` | **New** – Table for verification audit trail |
| `tests/unit/test_enrichment_service.py` | **New** – 7 tests for enrichment service |
| `tests/unit/test_orchestration_tools.py` | **Extended** – 3 tests for new tools, updated test_list_tools |

---

## 6. DATABASE / MIGRATIONS

**Migration 015:** `contractor_verification_metadata`

```sql
CREATE TABLE contractor_verification_metadata (
  id UUID PRIMARY KEY,
  contractor_id VARCHAR(36) NOT NULL REFERENCES contractors(id),
  source VARCHAR(100) NOT NULL,
  verified BOOLEAN NOT NULL,
  confidence FLOAT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_contractor_verification_metadata_contractor_id ON contractor_verification_metadata(contractor_id);
```

---

## 7. AGENT / TOOL / SERVICE INTEGRATION

| Consumer | Integration |
|----------|-------------|
| **ToolRegistry** | New tools: `normalize_address`, `verify_contractor_license`, `get_municipality_info` |
| **Vetting agent** | Can call `verify_contractor_license` when license_number present (optional) |
| **Admin** | Can display verification metadata from new table |
| **Onboarding** | Unchanged in Phase 1 |

---

## 8. TESTS

- `tests/unit/test_enrichment_service.py` – stub behavior, return shapes
- `tests/unit/test_orchestration_tools.py` – extend for new tools if needed

---

## 9. VERIFICATION STEPS

```bash
# Lint
uv run ruff check src/services/enrichment.py src/orchestration/tools.py

# Typecheck
uv run pyright src/services/enrichment.py src/orchestration/tools.py

# Tests
uv run pytest tests/unit/test_enrichment_service.py -v

# Migrations
uv run alembic upgrade head
uv run alembic downgrade -1  # verify downgrade
uv run alembic upgrade head

# App startup
uv run python -c "from src.services.enrichment import get_enrichment_service; print(get_enrichment_service().normalize_address('test', 'tel aviv'))"
```

---

## 10. FINAL SUMMARY

### What Already Existed

- Building address storage (address, city, region)
- Contractor verification status and trust score
- Vetting agent with LLM-based document analysis
- ToolRegistry with 10 tools
- Exact-match building lookup in onboarding

### What Was Added (Phase 1)

- `src/services/enrichment.py` – enrichment service with stub implementations
- Three new tools in ToolRegistry
- Migration for `contractor_verification_metadata`
- Optional env vars for future API URLs
- Unit tests for enrichment service

### What Was Reused

- Existing service layer pattern
- Existing ToolRegistry pattern
- Existing migration conventions
- Existing contractor/building models

### What Remains Optional for Future Phases

- Real government API integration (Israeli gov.il, etc.)
- Municipality reference table and sync
- Street synonym/alias resolution
- Address normalization in onboarding flow
- Geocoding for buildings

### Limitations / Assumptions

- Stub implementations return safe defaults; no external API calls without configuration
- Israeli context assumed (municipality, contractor license) but no locale-specific logic yet
- Verification metadata table is additive; no changes to existing contractor schema
