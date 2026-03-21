# Task plan (todo)

Use this file for plan-first, checkable items.

## Phase 2 — Government/Open-Data Integration (Complete)

### Implemented

- [x] **Feature A — Address normalization in onboarding**
  - POST /api/v1/enrichment/normalize-address
  - "Suggest address" button in resident onboarding
  - User can accept suggested or keep original
  - Enrichment metadata passed to building creation when confidence ≥ 0.5

- [x] **Feature B — Municipality enrichment persistence**
  - Migration 016: buildings.municipality_code, municipality_name, address_normalized, enrichment_confidence, enrichment_source, enriched_at
  - create_building accepts optional enrichment fields
  - Onboarding stores enrichment when provided

- [x] **Feature C — Contractor verification in admin**
  - GET /api/v1/admin/contractors/{id}/verification-metadata
  - VerificationMetadataSection in contractor detail modal
  - Distinguishes external/official verification from internal review

- [x] **Feature D — Hebrew/English language toggle**
  - LanguageToggle component (resident header + onboarding)
  - POST /api/locale sets NEXT_LOCALE cookie
  - Reuses next-intl; RTL/LTR via layout dir

- [x] **Feature E — RTL/LTR**
  - Already handled in layout (dir = locale === "he" ? "rtl" : "ltr")

### Tests

- tests/unit/test_route_enrichment.py (3 tests)
- Onboarding tests pass (23 tests)

### Verification

```bash
alembic upgrade head
pytest tests/unit/test_route_enrichment.py -v
pytest tests/ -k onboarding -v
```

## Current focus

Phase 2 complete. Phase 3: wire real gov APIs, extend verification flow.
