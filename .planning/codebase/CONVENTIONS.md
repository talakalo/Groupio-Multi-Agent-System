---
last_mapped: 2026-05-06
---

# Code Conventions

## Python (Backend)

### Style
- **Linter:** Ruff (`python -m ruff check src/`)
- **Type checker:** mypy (`python -m mypy src/`)
- **Formatting:** Ruff formatter (Black-compatible)
- No `SELECT *` — always use named column lists defined at top of `src/databases/postgres.py`

### Naming
- Files: `snake_case.py`
- Classes: `PascalCase`
- Functions/methods: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Private helpers: `_leading_underscore`

### Async Patterns
- All DB calls and external API calls must be `await`ed
- Never `time.sleep()` — use `asyncio.sleep()`
- All service methods are `async def`
- Use `asynccontextmanager` for connection management

### FastAPI Route Pattern
```python
@router.get("/resource/{id}")
async def get_resource(
    id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> ResourceResponse:
    try:
        result = await resource_service.get(id, current_user)
        return result
    except SomeError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")
```

### Service Pattern (business logic)
```python
# src/services/payment.py
async def process_payment(offer_id: str, user_id: str) -> PaymentResult:
    # Validate → transform → persist → return
    # Never import from src/api/routes/
    # Never call postgres.py helpers with SELECT *
    pass
```

### DB Query Pattern (asyncpg)
```python
# In src/databases/postgres.py — always use named column lists
_USER_COLS = "id, email, full_name, phone, role, ..."

async def get_user(user_id: str) -> dict:
    return await pool.fetchrow(
        f"SELECT {_USER_COLS} FROM users WHERE id = $1",
        user_id
    )

# INSERT — use RETURNING id to avoid extra SELECT
await pool.execute(
    "INSERT INTO offers (...) VALUES ($1, $2) RETURNING id",
    val1, val2
)
```

### Pydantic Models
- All request/response bodies use Pydantic v2 models in `src/models/`
- Use `Field(...)` with constraints: `min_length`, `ge`, `le`
- Never validate manually in route handlers

### Error Handling
- `HTTPException` for client errors (4xx)
- Log + return 500 for unexpected errors
- Never expose stack traces to API responses
- Input sanitization before DB writes: `src/utils/validators.py`

### JWT / Auth Pattern
```python
# Role guard decorator pattern in src/api/middleware/auth.py
@require_role(["admin", "super_admin"])
async def admin_endpoint(...):
    pass
```

## TypeScript / React (Frontend)

### Style
- ESLint: `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`
- Prettier for formatting
- No `any` types — use types from `@groupio/types` or define locally
- All component props must be typed

### State Management Rules
```typescript
// ✓ React Query for server state
const { data: offers } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })
await queryClient.invalidateQueries({ queryKey: ['offers'] }) // after mutations

// ✓ Zustand for client-only state
const { user } = useAuthStore()

// ✗ Never put API responses in Zustand
// ✗ Never call fetch/axios directly — use @groupio/api-client
```

### Component Pattern
```tsx
// All components must work in LTR (English) and RTL (Hebrew)
// Use next-intl for all user-facing strings
import { useTranslations } from 'next-intl'

export function OfferCard({ offer }: { offer: Offer }) {
  const t = useTranslations('offers')
  return <div dir="auto">{t('title')}</div>
}
```

### Forms
```typescript
// React Hook Form + Zod
const schema = z.object({ email: z.string().email() })
const { register, handleSubmit } = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema)
})
// Show field-level errors, not just toasts
```

### API Client
```typescript
// Always use packages/api-client — never raw fetch/axios
import { apiClient } from '@groupio/api-client'
const offers = await apiClient.offers.list()
```

### i18n
- All user-facing strings use `next-intl`
- Translation files in `apps/web/messages/`
- Hebrew (he) is primary — English (en) is secondary
- RTL support required for all UI components

### Layout Test Pattern
```typescript
// Mock useAuthHasHydrated in layout tests to avoid hydration flakiness
vi.mock('../lib/hooks/useAuthHasHydrated', () => ({ default: () => true }))
```

## Database Conventions

### Column Lists
Defined at top of `src/databases/postgres.py` as `_RESOURCE_COLS` constants:
- `_USER_COLS` — excludes `hashed_password` for security
- `_OFFER_COLS`
- `_CONTRACTOR_COLS`
- `_PAYMENT_COLS`

Add new column lists there when adding new query patterns.

### Migrations (Alembic)
Before every new migration checklist:
1. Does the table need RLS? (almost always yes)
2. Are FKs declared with `ON DELETE` behavior?
3. Are indexes needed for common queries?
4. Is there a corresponding Pydantic model?

### JSONB Columns (must validate before write)
- `pricing_tiers` on offers
- `trust_score_breakdown` on contractors
- `notification_settings` on users
- `provider_data` on contractors (Stripe subscription data)

## Security Conventions

- Never skip Stripe webhook signature verification (`stripe.Webhook.construct_event()`)
- Rate limiting configured globally — never bypass
- All protected endpoints verify JWT via auth middleware
- Never rely on RLS alone for business-level access control
- Input sanitization: `sanitize_input()` and `validate_message_request()` in `src/utils/validators.py`
- RLS policies defined in Alembic migrations — never ad-hoc in SQL editors
