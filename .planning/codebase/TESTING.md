---
last_mapped: 2026-05-06
---

# Testing

## Overview

| Layer | Framework | Location | Requirement |
|-------|-----------|----------|-------------|
| Frontend unit | Vitest + React Testing Library + jsdom | `apps/web/__tests__/` | Required for components |
| Frontend E2E | Playwright | `apps/web/e2e/` | Required for user flows |
| Backend unit | pytest + pytest-asyncio | `tests/unit/` | 50% coverage minimum |
| Backend integration | pytest (needs Docker services) | `tests/integration/` | Needs `docker compose up` |

## Frontend Unit Tests (Vitest)

### Config
`apps/web/vitest.config.ts`:
- Environment: jsdom
- Globals enabled
- Setup file: `apps/web/__tests__/setup.ts`
- Excludes: `e2e/**`, `node_modules/**`

### Setup (`apps/web/__tests__/setup.ts`)
```typescript
import "@testing-library/jest-dom/vitest"
// scrollIntoView shim for jsdom
Element.prototype.scrollIntoView = () => {}
```

### Test Files (existing coverage)
| Test | What it covers |
|------|---------------|
| `authStore.test.ts` | Zustand auth store actions |
| `offerStore.test.ts` | Zustand offer store |
| `apiClient.test.ts` | API client behavior |
| `LoginPage.test.tsx` | Login form rendering + submission |
| `SignupPage.test.tsx` | Signup form + validation |
| `OfferCard.test.tsx` | Offer card display |
| `PaymentsPage.test.tsx` | Payments page |
| `ContractorLayout.test.tsx` | Contractor portal layout |
| `ResidentLayout.test.tsx` | Resident portal layout |
| `BuildingsManagerLayout.test.tsx` | Buildings manager layout |
| `roleRouting.test.ts` | Role-based routing |
| `buildingsManagerI18n.test.ts` | i18n for buildings manager |
| `contractorProfileI18n.test.ts` | i18n for contractor profile |
| `residentNavI18n.test.ts` | i18n for resident navigation |

### Mocking Patterns
```typescript
// Mock auth hydration in layout tests
vi.mock('../lib/hooks/useAuthHasHydrated', () => ({ default: () => true }))

// Mock fetch globally
global.fetch = vi.fn()

// Mock localStorage
Object.defineProperty(global, 'localStorage', { value: localStorageMock })
```

### Run
```bash
pnpm test              # Vitest unit tests
pnpm typecheck         # TypeScript type check
pnpm lint              # ESLint
```

## Frontend E2E Tests (Playwright)

### Config (`apps/web/playwright.config.ts`)
- `fullyParallel: true`
- Retries on CI: 2
- Workers on CI: 1
- Custom reporter + JUnit output
- `baseURL` from `e2e/config/env.config`

### Projects (browser targets)
| Project | Locale |
|---------|--------|
| `chromium` | en-US (default) |
| `chromium-he` | he-IL (Hebrew RTL) |
| `Mobile Safari` | iPhone 14 |

**Hebrew locale project is required** — all user flows must pass in Hebrew RTL.

### E2E Spec Files
| File | Covers |
|------|--------|
| `resident-flow.spec.ts` | Resident: signup → browse offers → join → pay |
| `contractor-flow.spec.ts` | Contractor: register → create offer → manage |
| `contractor-membership-checkout.spec.ts` | Stripe membership checkout |
| `critical-flow.spec.ts` | Core golden path flows |
| `rbac-routing.spec.ts` | Role-based access control + redirects |
| `rtl.spec.ts` | RTL layout validation (Hebrew) |
| `notification-panel.spec.ts` | Notification system |
| `architecture-flow.spec.ts` | Building architecture browsing |
| `phase3-enrichment-i18n.spec.ts` | i18n + enrichment |
| `pilot-smoke.spec.ts` | Smoke tests for pilot readiness |
| `coverage-gaps.spec.ts` | Filling coverage gaps |

### Test Data Pattern
```typescript
const TEST_RESIDENT = {
  email: "yael.cohen@example.com",
  password: "SecurePass123!",
  name: "יעל כהן",  // Hebrew names used
  phone: "0541234567",
}
```

### Run
```bash
pnpm test:e2e         # All Playwright E2E (web)
```

### Role Coverage Requirement
Every new user-facing flow needs a Playwright spec covering **both** resident AND contractor roles. RBAC routing tests must cover all 5 roles: resident, contractor, buildings_manager, admin, super_admin.

## Backend Unit Tests (pytest)

### Config (`pyproject.toml`)
```ini
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]
addopts = "--cov-fail-under=50 --timeout=120"
```

**Coverage minimum: 50%** (enforced via `--cov-fail-under=50`)
**Per-test timeout: 120s** (prevents CI SIGTERM on hanging tests)

### Fixture Strategy (`tests/unit/conftest.py`)
- Patches `jwt`/`bcrypt` at `sys.modules` level so route tests run without system crypto libraries
- Installs minimal stubs when real packages fail to import (CI safety net)

### Test Files (unit)
| File | Covers |
|------|--------|
| `test_auth_middleware.py` | JWT auth middleware |
| `test_auth_rate_limit.py` | Rate limiting |
| `test_auth_redis_fallback.py` | Redis auth fallback |
| `test_auth_cookie_samesite.py` | Cookie security |
| `test_agent_actions.py` | Agent action models |
| `test_agent_worker.py` | Agent worker |
| `test_analytics_agent.py` | Analytics agent |
| `test_architecture_agent.py` | Architecture agent |
| `test_messaging_layer.py` | RabbitMQ messaging |
| `test_outbox_dispatcher_*.py` | Outbox pattern |
| `test_worker_crm_sync.py` | EspoCRM sync |
| `test_worker_notifications.py` | Notification worker |
| `test_worker_payments.py` | Payment worker |
| `test_stripe_contractor_webhooks.py` | Stripe contractor webhooks |
| `test_espocrm_client.py` | EspoCRM HTTP client |

### Async Test Pattern
```python
# pytest-asyncio with asyncio_mode = "auto"
async def test_payment_flow():
    result = await payment_service.process(...)
    assert result.status == "succeeded"
```

### Mock Pattern (unit)
```python
from unittest.mock import AsyncMock, MagicMock, patch

@patch("src.databases.postgres.get_pool")
async def test_service(mock_pool):
    mock_pool.return_value.fetchrow = AsyncMock(return_value={"id": "123"})
    ...
```

### Run
```bash
pytest tests/unit/           # Unit tests only
pytest tests/integration/    # Integration (needs Docker)
pytest tests/                # All tests
python -m ruff check src/    # Python linting
python -m mypy src/          # Type checking
```

### Integration Tests
- Require Docker services running: `docker compose -f docker/docker-compose.yml up -d`
- Test against real Postgres, Redis, Qdrant, Neo4j instances

## Coverage Strategy

- Backend: 50% minimum enforced in CI (`--cov-fail-under=50`)
- Previously-omitted files now have dedicated tests (see `pyproject.toml` coverage config)
- RLS must be validated in integration tests (not just unit tests)
- Every new protected endpoint needs tests for all relevant roles

## Admin App Tests
- `apps/admin/__tests__/` — Vitest unit tests
- `apps/admin/e2e/` — Playwright E2E

## Mobile Tests
- `apps/mobile/__tests__/` — unit tests
- `apps/mobile/.maestro/` — Maestro mobile E2E flows
