# Groupio — Comprehensive Production Development Plan

**Generated:** 2026-02-27
**Source Audits:** `docs/PRODUCTION_READINESS_AUDIT.md` (backend, 51%) + `docs/FRONTEND_READINESS_AUDIT.md` (frontend, 37%)
**Combined Readiness Score: ~44% — NOT production ready**
**Branch:** `claude/production-readiness-audit-9pG1Z`

---

## Executive Summary

Both audits identify **functional blockers** — not just polish items. The system cannot serve real users until several critical issues are resolved: admin login is broken (404 endpoint), user signup is broken (wrong URL), offer joining is broken (hardcoded userId), payment webhooks have no fraud protection, and the core AI message endpoint has no authentication. The frontend admin panel has no server-side route protection at all.

**Total estimated work to reach production:**
- Phase 0 (Emergency): ~5–7 days (must complete before any live traffic)
- Phase 1 (High Priority): ~10–12 days
- Phase 2 (Medium Priority): ~12–15 days
- Phase 3 (Technical Debt): ~10–14 days

**Recommended team allocation:** 2 backend engineers + 2 frontend engineers running Phase 0 in parallel.

---

## Readiness Scorecard

| Layer | Current | Target | Gap |
|---|---|---|---|
| Backend API | 51% | 90% | 39pp |
| Frontend Web | 37% | 90% | 53pp |
| Frontend Admin | 20% | 90% | 70pp |
| Mobile | 15% | 80% | 65pp |
| Combined | ~44% | 90% | 46pp |

---

## Phase 0 — Emergency Blockers

> **Must complete before any live user traffic. Zero exceptions.**
> All issues below cause broken core flows or active security vulnerabilities.

---

### 0-BE-1 · Add Authentication to `/api/v1/message`

**File:** `src/api/main.py:171`
**Severity:** 🔴 CRITICAL — Any unauthenticated caller can impersonate any user ID
**Effort:** S (2–4 hours)

**Current code (broken):**
```python
@app.post("/api/v1/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
) -> MessageResponse:
    # user_id comes from request body — completely forgeable
```

**Fix:**
```python
from src.api.middleware.auth import get_current_user
from src.models.user import UserInDB

@app.post("/api/v1/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),  # ← ADD
) -> MessageResponse:
    # Override the body user_id with the authenticated user's id
    request.user_id = current_user.id
```

**Tests to update:** `tests/integration/test_message_endpoint.py` — add auth token to all requests.

---

### 0-BE-2 · Implement Payment Webhook Signature Verification

**File:** `src/api/routes/payments.py:300`
**Severity:** 🔴 CRITICAL — Active fraud vector; anyone with a transaction ID can forge a payment succeeded event
**Effort:** S (3–4 hours)

**Fix:**
```python
import hashlib, hmac, json
from src.config.settings import get_settings

settings = get_settings()

@router.post("/webhook")
async def payment_webhook(
    request: Request,
    x_payment_signature: str | None = Header(None),
) -> dict:
    raw_body = await request.body()

    if settings.PAYMENT_WEBHOOK_SECRET:
        expected = "sha256=" + hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, x_payment_signature or ""):
            raise HTTPException(status_code=403, detail="Invalid webhook signature")
    else:
        # Fail loudly if secret not configured in production
        if settings.ENVIRONMENT != "development":
            raise HTTPException(status_code=503, detail="Webhook not configured")

    body = json.loads(raw_body)
    # ... existing handler logic
```

**Settings to add:** `PAYMENT_WEBHOOK_SECRET: str = ""` in `src/config/settings.py`
**Also add to:** `.env.example`, CI secret configuration

---

### 0-BE-3 · Add `aiosmtplib` to Production Requirements

**File:** `requirements-prod.txt`
**Severity:** 🔴 CRITICAL — Email service crashes with ImportError in production
**Effort:** XS (5 minutes)

```
# HTTP & Networking
aiosmtplib>=3.0.0   # ← ADD THIS LINE
httpx>=0.26.0
```

---

### 0-BE-4 · Fix JWT Secret Key Auto-Generation

**File:** `src/config/settings.py:85`
**Severity:** 🔴 CRITICAL — Every restart invalidates all user sessions
**Effort:** S (1–2 hours)

**Current (broken):**
```python
JWT_SECRET_KEY: str = secrets.token_urlsafe(32)
```

**Fix:**
```python
JWT_SECRET_KEY: str = ""  # Must be set via environment

@model_validator(mode="after")
def _validate_production_secrets(self) -> "Settings":
    if self.ENVIRONMENT != "development":
        if not self.JWT_SECRET_KEY:
            raise ValueError(
                "JWT_SECRET_KEY must be explicitly set in non-development environments. "
                "Generate with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        if len(self.JWT_SECRET_KEY) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters")
        if self.PAYMENT_PROVIDER == "mock":
            raise ValueError("PAYMENT_PROVIDER cannot be 'mock' in production")
    return self
```

**Also update:** GitHub Actions secrets, deployment runbook

---

### 0-BE-5 · Integrate Real Payment Provider

**Files:** `src/services/payment.py`, `src/config/settings.py`, `requirements-prod.txt`
**Severity:** 🔴 CRITICAL — No real money can be processed
**Effort:** XL (5–8 days for full integration + testing)

**Architecture (using existing factory pattern):**
```python
# src/services/payment.py — add alongside MockPaymentProvider

class StripePaymentProvider(BasePaymentProvider):
    """Stripe implementation for Israeli market (or PayPlus for local)."""

    async def create_payment_intent(
        self, amount: Decimal, currency: str, metadata: dict
    ) -> PaymentIntent:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        intent = await stripe.PaymentIntent.create_async(
            amount=int(amount * 100),  # Stripe uses cents
            currency=currency.lower(),
            metadata=metadata,
        )
        return PaymentIntent(id=intent.id, client_secret=intent.client_secret, ...)

    async def capture_payment(self, payment_intent_id: str) -> Payment: ...
    async def refund_payment(self, payment_id: str, amount: Decimal) -> Refund: ...
```

**New settings:**
```python
STRIPE_SECRET_KEY: str = ""
STRIPE_PUBLISHABLE_KEY: str = ""
STRIPE_WEBHOOK_SECRET: str = ""
# OR for PayPlus (Israeli PSP):
PAYPLUS_API_KEY: str = ""
PAYPLUS_SECRET_KEY: str = ""
```

**Deployment note:** Run Stripe CLI locally for webhook testing before production.

---

### 0-FE-1 · Remove JWT from localStorage and Non-HttpOnly Cookie

**Files:**
- `apps/web/app/(auth)/login/page.tsx:61`
- `apps/web/app/(auth)/signup/page.tsx` (verify same pattern)
- `apps/admin/app/login/page.tsx:98`
- `apps/web/lib/auth/setAuthCookie.ts`
- `apps/web/app/(resident)/offers/page.tsx` (localStorage fallback)
- `apps/admin/lib/hooks.ts:24` (getAuthToken reads localStorage)

**Severity:** 🔴 CRITICAL — XSS → full account takeover
**Effort:** S (3–4 hours)

**In login/page.tsx — remove:**
```typescript
// DELETE THIS LINE:
localStorage.setItem("auth_token", response.token);
```
The token must live only in the Zustand `authStore` (memory). The `authStore.setAuth()` call that already exists is the correct storage mechanism.

**In `setAuthCookie.ts` — strip the raw JWT from the cookie:**
```typescript
// Only store role + auth status (never the raw token)
const value = encodeURIComponent(JSON.stringify({
  state: {
    // accessToken: accessToken,  ← REMOVE — never put JWT in non-HttpOnly cookie
    user: user ? { role: user.role, id: user.id } : null,
    isAuthenticated: true,
  },
}));
document.cookie = `${AUTH_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}; samesite=lax${securePart}`;
// Note: without HttpOnly, this cookie is still readable by JS — but it no longer contains the JWT
```

**In `apps/admin/lib/hooks.ts` — the admin app must NOT use localStorage:**
All admin hooks that call `localStorage.getItem("auth_token")` must be refactored once the admin auth store is implemented (see 0-FE-3).

---

### 0-FE-2 · Create `apps/admin/middleware.ts`

**File:** `apps/admin/middleware.ts` (create new)
**Severity:** 🔴 CRITICAL — Admin panel fully accessible without login
**Effort:** S (2–3 hours)

```typescript
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for refresh token (HTTP-only, set by backend at login)
  const refreshToken = request.cookies.get('refresh_token');

  if (!refreshToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Security headers for admin panel
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

---

### 0-FE-3 · Fix Admin 2FA — Remove Broken Endpoint or Implement It

**File:** `apps/admin/app/login/page.tsx`
**Severity:** 🔴 CRITICAL — Admin login always fails in production (404)
**Effort:** Option A (remove): XS (30 min) | Option B (implement): XL (3–5 days)

**Decision:** Unless TOTP is a hard launch requirement, remove the 2FA step entirely and ship a working single-step admin login. A broken 2FA is worse than no 2FA — it creates false security while breaking the login.

**Option A — Remove 2FA step (recommended for now):**
```typescript
// apps/admin/app/login/page.tsx
// Remove the "step" state and the 2FA form entirely
// Keep only the email/password step
// After successful POST /api/v1/auth/login/json:
// → Store token in admin Zustand authStore (NOT localStorage)
// → Redirect to /dashboard
```

**Option B — Implement real TOTP (do this in Phase 1 after launch):**
- Backend: Add `pyotp` to requirements, `POST /api/v1/auth/verify-2fa` endpoint that validates TOTP code using a per-user TOTP secret stored in the users table
- Frontend: Admin login page sends `{ email, password }` → receives `{ temp_token, requires_2fa: true }` → user enters 6-digit code → send `{ temp_token, totp_code }` → receive full session token

---

### 0-FE-4 · Fix `joinOffer` Hardcoded `'current-user'` userId

**File:** `apps/web/app/(resident)/offers/[offerId]/page.tsx`
**Severity:** 🔴 CRITICAL — Every join offer action is broken
**Effort:** XS (15 minutes)

**Current (broken):**
```typescript
const joinMutation = useMutation({
  mutationFn: async () => {
    return apiClient.joinOffer(offerId, 'current-user');  // ← BUG
  },
});
```

**Fix:**
```typescript
const { user } = useAuthStore();  // already imported

const joinMutation = useMutation({
  mutationFn: async () => {
    if (!user?.id) throw new Error('Not authenticated');
    return apiClient.joinOffer(offerId, user.id);  // ← use real user ID
  },
});

// Also disable the Join button when user is not loaded:
<button
  onClick={() => joinMutation.mutate()}
  disabled={!user?.id || joinMutation.isPending}
>
  {t('joinOffer')}
</button>
```

---

### 0-FE-5 · Fix User Signup Endpoint URL

**File:** `apps/web/lib/api/client.ts:229`
**Severity:** 🔴 CRITICAL — Every new user registration fails with 404
**Effort:** XS (5 minutes)

```typescript
// Current (broken):
async signup(data: SignupRequest): Promise<AuthResponse> {
  return this.request<AuthResponse>('/api/v1/auth/signup', { ... });
}

// Fix:
async signup(data: SignupRequest): Promise<AuthResponse> {
  return this.request<AuthResponse>('/api/v1/auth/register', { ... });
}
```

**Also verify:** The request body shape matches the backend `UserCreate` Pydantic model (fields: `email`, `password`, `full_name`, `phone`, `building_id`).

---

### 0-FE-6 · Fix `LayoutProps<"/">` TypeScript Build Error

**File:** `apps/web/app/(auth)/layout.tsx:4`
**Severity:** 🔴 CRITICAL — TypeScript build failure
**Effort:** XS (5 minutes)

```typescript
// Current (broken — type doesn't exist):
export default function AuthLayout(props: LayoutProps<"/">) {

// Fix:
export default function AuthLayout({ children }: { children: React.ReactNode }) {
```

---

## Phase 1 — High Priority

> **Complete within Week 1–2. System is brittle and insecure without these.**

---

### 1-BE-1 · Fix Rate Limiting Race Condition

**File:** `src/databases/redis_client.py:79-95`
**Effort:** S
**Risk:** MEDIUM — Under concurrent load, the rate limiter can be bypassed

```python
_RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window)
end
return count
"""

async def check_rate_limit(
    self, user_id: str, limit: int = 60, window: int = 60
) -> bool:
    key = f"rate:{user_id}"
    count = await self._redis.eval(_RATE_LIMIT_SCRIPT, 1, key, limit, window)
    return int(count) <= limit
```

---

### 1-BE-2 · Authenticate the `/metrics` and Contractor Webhook Endpoints

**Files:** `src/api/main.py:274`, `src/api/routes/webhooks.py:117`
**Effort:** S

```python
# For /metrics — add IP allowlist or API key check:
@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics(
    api_key: str = Depends(verify_api_key),
) -> Response:
    return generate_latest_metrics()

# For /webhooks/contractor-update — add API key:
@router.post("/contractor-update")
async def contractor_update_webhook(
    payload: dict[str, Any],
    _: str = Depends(verify_api_key),
) -> dict[str, str]:
    ...
```

---

### 1-BE-3 · Fix CORS: Remove Localhost Origins in Production

**File:** `src/api/main.py:103-112`
**Effort:** XS

```python
cors_origins = list(settings.CORS_ORIGINS)
if settings.ENVIRONMENT == "development":
    cors_origins.extend([
        "http://localhost:3000", "http://localhost:3001",
        "http://localhost:3002", "http://localhost:8081",
    ])
# Do NOT add localhost to production CORS
```

---

### 1-BE-4 · Add Missing Database Indexes

**File:** New Alembic migration `alembic/versions/005_missing_fk_indexes.py`
**Effort:** S

```python
def upgrade() -> None:
    op.create_index('ix_building_residents_building_id', 'building_residents', ['building_id'])
    op.create_index('ix_building_residents_user_id', 'building_residents', ['user_id'])
    op.create_index('ix_offer_participants_offer_id', 'offer_participants', ['offer_id'])
    op.create_index('ix_offer_participants_user_id', 'offer_participants', ['user_id'])
    op.create_index('ix_contractor_reviews_contractor_id', 'contractor_reviews', ['contractor_id'])
    op.create_index('ix_escalation_messages_escalation_id', 'escalation_messages', ['escalation_id'])

def downgrade() -> None:
    op.drop_index('ix_building_residents_building_id', 'building_residents')
    op.drop_index('ix_building_residents_user_id', 'building_residents')
    op.drop_index('ix_offer_participants_offer_id', 'offer_participants')
    op.drop_index('ix_offer_participants_user_id', 'offer_participants')
    op.drop_index('ix_contractor_reviews_contractor_id', 'contractor_reviews')
    op.drop_index('ix_escalation_messages_escalation_id', 'escalation_messages')
```

---

### 1-BE-5 · Add LLM Timeout and Fallback

**File:** `src/utils/llm_client.py`
**Effort:** M

```python
import asyncio

MAX_LLM_TIMEOUT_SECONDS = 30

async def _call_with_fallback(self, primary_fn, fallback_fn=None):
    try:
        return await asyncio.wait_for(primary_fn(), timeout=MAX_LLM_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.warning("Primary LLM timed out, trying fallback model")
        if fallback_fn:
            return await asyncio.wait_for(fallback_fn(), timeout=MAX_LLM_TIMEOUT_SECONDS)
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")
    except Exception as e:
        if self._is_rate_limit_error(e) and fallback_fn:
            return await fallback_fn()
        raise
```

---

### 1-BE-6 · Implement GDPR Right-to-Erasure Endpoint

**File:** `src/api/routes/auth.py`
**Effort:** M

```python
@router.delete("/me", status_code=204)
async def delete_account(
    current_user: UserInDB = Depends(get_current_user),
    db: PostgresClient = Depends(get_db),
) -> None:
    """
    Anonymizes or deletes all personal data for the authenticated user.
    Satisfies GDPR Art. 17 (right to erasure) and Israeli PDPL.
    """
    user_id = current_user.id

    # Anonymize rather than hard-delete for referential integrity
    await db.execute("""
        UPDATE users SET
            email = 'deleted_' || id || '@deleted.invalid',
            full_name = 'Deleted User',
            phone = NULL,
            password_hash = '',
            is_active = false,
            deleted_at = NOW()
        WHERE id = $1
    """, user_id)

    # Delete chat history (no legitimate reason to keep after erasure)
    await db.execute("DELETE FROM chat_messages WHERE user_id = $1", user_id)

    # Remove from building
    await db.execute("DELETE FROM building_residents WHERE user_id = $1", user_id)

    # Remove from offer participants
    await db.execute("UPDATE offer_participants SET user_id = NULL WHERE user_id = $1", user_id)

    # Revoke all refresh tokens
    await db.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
```

---

### 1-BE-7 · Add Redis Authentication

**File:** `docker/docker-compose.yml`, `src/config/settings.py`
**Effort:** S

```yaml
# docker/docker-compose.yml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD:?REDIS_PASSWORD must be set}
    --appendonly yes
    --maxmemory 512mb
    --maxmemory-policy allkeys-lru
```

```python
# settings.py — update REDIS_URL to include password
REDIS_URL: str = "redis://:${REDIS_PASSWORD}@localhost:6379/0"
```

---

### 1-BE-8 · Add Database Backup Automation

**File:** `.github/workflows/backup.yml` (new)
**Effort:** M

```yaml
name: Database Backup
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Backup PostgreSQL to S3
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          AWS_ACCESS_KEY_ID: ${{ secrets.BACKUP_AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.BACKUP_AWS_SECRET_ACCESS_KEY }}
          S3_BUCKET: ${{ secrets.BACKUP_S3_BUCKET }}
        run: |
          TIMESTAMP=$(date +%Y%m%d_%H%M%S)
          pg_dump "$DATABASE_URL" | gzip | \
            aws s3 cp - "s3://$S3_BUCKET/postgres/groupio_$TIMESTAMP.sql.gz"
          echo "Backup completed: groupio_$TIMESTAMP.sql.gz"

      - name: Rotate old backups (keep 30 days)
        run: |
          aws s3 ls "s3://$S3_BUCKET/postgres/" | \
            awk '{print $4}' | \
            head -n -30 | \
            xargs -I{} aws s3 rm "s3://$S3_BUCKET/postgres/{}"
```

---

### 1-FE-1 · Remove All Hardcoded Fake Metrics

**Files:** `apps/admin/app/dashboard/page.tsx`, `apps/admin/lib/hooks.ts`, `apps/web/app/(resident)/dashboard/page.tsx`
**Effort:** M (3–5 days for both frontend + backend metrics API)
**Risk:** HIGH — Operators cannot make decisions on fabricated data

**Step 1 — Backend: Create a real system metrics endpoint**
```python
# src/api/routes/admin.py — add:
@router.get("/system/metrics")
async def get_system_metrics(
    current_user: UserInDB = Depends(require_admin),
) -> SystemMetricsResponse:
    return SystemMetricsResponse(
        api_latency_p95_ms=await get_prometheus_metric("http_request_duration_p95"),
        error_rate_percent=await get_prometheus_metric("http_error_rate"),
        uptime_seconds=int(time.time() - app_start_time),
        active_connections=get_active_connections(),
        # ... real data from Prometheus
    )
```

**Step 2 — Frontend admin dashboard: Remove hardcoded values**
```typescript
// apps/admin/app/dashboard/page.tsx — replace:
// "API Latency: 124ms"  → use useSystemMetrics() hook value
// "Error Rate: 0.24%"   → use useSystemMetrics() hook value
// uptimePercent = 99.97 → calculate from real uptime_seconds

// apps/admin/lib/hooks.ts — replace generateHistory() with:
async function fetchAgentHistory(agentName: string) {
  // Call a real endpoint: GET /api/v1/admin/agents/{name}/history?hours=24
  // If endpoint doesn't exist yet, return [] with an "No history available" empty state
  return [];
}
// Remove: avgLatencyMs: 320, callsToday: Math.round(agent.calls * 0.12),
//         tokensUsed: agent.calls * 850 — all fabricated
```

**Step 3 — Resident dashboard: Remove hardcoded trends**
```typescript
// apps/web/app/(resident)/dashboard/page.tsx — remove:
// trend={12}, trend={8}, trend={23}
// Leave trend={undefined} or fetch from backend analytics API
// Show no trend arrow until real data is available
```

---

### 1-FE-2 · Add Missing Protected Routes to Web Middleware

**File:** `apps/web/middleware.ts`
**Effort:** XS (5 minutes)

```typescript
const protectedRoutes = [
  '/dashboard',
  '/offers',
  '/contractors',
  '/building',
  '/profile',
  '/chat',
  '/architecture',  // ← ADD: file upload + AI analysis
  '/payments',      // ← ADD: payment pages
];
```

---

### 1-FE-3 · Fix Role-Based Routing: Don't Trust Client-Writable Cookie

**File:** `apps/web/middleware.ts`
**Effort:** M (1 day)
**Risk:** HIGH — Users can forge `role: "admin"` to bypass contractor/admin route guards

**Option A — Decode role from JWT directly in Edge middleware (recommended):**
```typescript
// middleware.ts
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

async function getRoleFromToken(request: NextRequest): Promise<string | null> {
  // The refresh_token is HttpOnly — can be read by middleware
  const refreshToken = request.cookies.get('refresh_token')?.value;
  if (!refreshToken) return null;

  try {
    // The refresh token contains the user role in its payload
    const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}
```

**Option B — Backend sets a separate signed `groupio-role` HttpOnly cookie at login:**
```python
# Backend auth route — after successful login, set:
response.set_cookie(
    key="groupio-role",
    value=user.role,
    httponly=True,
    secure=True,
    samesite="lax",
    max_age=86400 * 7,
)
# Edge middleware reads this HttpOnly cookie for role checks — no forgery possible
```

---

### 1-FE-4 · Fix Offers Page Token Access Anti-Pattern

**File:** `apps/web/app/(resident)/offers/page.tsx`
**Effort:** S (30 minutes)

```typescript
// Replace the entire window.__auth_store hack + localStorage fallback:
// REMOVE:
const accessToken = typeof window !== 'undefined'
  ? (window as unknown as {...}).__auth_store?.getState()?.accessToken
    ?? localStorage.getItem('auth_token')
  : null;

// REPLACE WITH:
import { useAuthStore } from '@/lib/stores/authStore';
// In component:
const accessToken = useAuthStore((s) => s.accessToken);
```

---

### 1-FE-5 · Consolidate API Clients and Fix `ApiError` Signature Mismatch

**Files:** `apps/web/lib/api/client.ts`, `packages/api-client/src/client.ts`
**Effort:** M (1 day)
**Risk:** HIGH — Reversed constructor args cause error handling bugs

**Step 1 — Align `ApiError` constructors (immediate fix):**
```typescript
// packages/api-client/src/client.ts — change to match web client:
export class ApiError extends Error {
  constructor(
    public readonly status: number,   // ← move status FIRST
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
// Update all call sites in packages/api-client/src/client.ts accordingly
```

**Step 2 — Add auth header to `useReloadAgent` (apps/admin/lib/hooks.ts:302):**
```typescript
mutationFn: async (agentName: string) => {
  const token = getAuthToken();  // once proper admin auth store exists
  const response = await fetch(
    `${API_URL}/admin/agents/${encodeURIComponent(agentName)}/reload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
    }
  );
  ...
}
```

**Step 3 (Phase 2 goal) — Migrate web app to use `packages/api-client`:**
- Add `tokenProvider` callback to `GroupioApiClient` constructor
- Wire Zustand store token into the callback
- Deprecate `apps/web/lib/api/client.ts`

---

### 1-FE-6 · Implement Mobile Authentication

**Files:** `apps/mobile/app/(auth)/login.tsx` (new), `apps/mobile/app/_layout.tsx`, `apps/mobile/lib/authStore.ts` (new)
**Effort:** L (3–5 days)
**Risk:** HIGH — Mobile app has no auth; all API calls are unauthenticated

**New files to create:**

```typescript
// apps/mobile/lib/authStore.ts
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  accessToken: string | null;
  user: { id: string; role: string; name: string } | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthState['user']) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  login: async (token, user) => {
    await SecureStore.setItemAsync('auth_token', token);
    set({ accessToken: token, user, isAuthenticated: true });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    set({ accessToken: null, user: null, isAuthenticated: false });
  },

  loadToken: async () => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      // Optionally validate token expiry before setting
      set({ accessToken: token, isAuthenticated: true });
    }
  },
}));
```

```typescript
// apps/mobile/app/_layout.tsx — add auth guard:
export default function RootLayout() {
  const { isAuthenticated, loadToken } = useAuthStore();

  useEffect(() => {
    loadToken();  // Load persisted token on startup
  }, []);

  // Route based on auth state
  return (
    <Stack>
      {isAuthenticated ? (
        <Stack.Screen name="(tabs)" />
      ) : (
        <Stack.Screen name="(auth)/login" />
      )}
    </Stack>
  );
}
```

```typescript
// apps/mobile/app/(auth)/login.tsx — new login screen
// POST /api/v1/auth/login/json
// On success: authStore.login(token, user)
// Uses expo-secure-store for token persistence (NOT AsyncStorage)
```

**Install required:** `expo-secure-store` (`expo install expo-secure-store`)

---

### 1-FE-7 · Fix `Offer.contractor` Shared Type

**File:** `packages/types/src/index.ts`
**Effort:** XS (15 minutes)

```typescript
// Current (will cause runtime crash when backend returns null):
export interface Offer {
  contractor: Contractor;  // ← required
  // ...
}

// Fix:
export interface Offer {
  contractor?: Contractor | null;  // ← optional
  // ...
}
```

**Also update all consumers** that access `offer.contractor.businessName` — add null guards:
```typescript
// Before: offer.contractor.businessName
// After:  offer.contractor?.businessName ?? t('noContractorAssigned')
```

---

## Phase 2 — Medium Priority

> **Complete within Week 2–4. System is functional but not production-grade without these.**

---

### 2-BE-1 · Multi-Worker Uvicorn

**File:** `docker/Dockerfile`
**Effort:** XS

```dockerfile
# Development (keep reload for dev compose)
# Production CMD:
CMD ["uvicorn", "src.api.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker"]
```

**Prerequisite:** Verify the `GroupioOrchestrator` singleton is fork-safe. Each worker gets its own copy — ensure no shared mutable in-process state is expected to be consistent across workers.

---

### 2-BE-2 · Add Smoke Test After Deploy

**File:** `.github/workflows/deploy.yml`
**Effort:** S

```yaml
- name: Verify deployment health
  run: |
    echo "Waiting for service to start..."
    sleep 15
    for i in {1..5}; do
      if curl -sf https://api.groupio.co.il/api/v1/health/live; then
        echo "✅ Service is healthy"
        exit 0
      fi
      echo "Attempt $i failed, retrying in 5s..."
      sleep 5
    done
    echo "❌ Health check failed after 5 attempts"
    exit 1
```

---

### 2-BE-3 · Make E2E Tests Blocking

**File:** `.github/workflows/ci.yml:345`
**Effort:** S (after fixing flaky tests)

```yaml
# Remove this line:
# continue-on-error: true

# Also: run E2E on all PRs, not just main/dev:
on:
  pull_request:
    branches: [main, dev]
  push:
    branches: [main, dev]
```

---

### 2-BE-4 · Add Prometheus Alerting Rules

**File:** `monitoring/alerts.yml` (new)
**Effort:** M

```yaml
groups:
  - name: groupio-critical
    rules:
      - alert: PaymentWebhookFailed
        expr: rate(http_requests_total{path="/api/v1/payments/webhook",status=~"4xx|5xx"}[5m]) > 0
        for: 1m
        annotations:
          summary: "Payment webhook failures — check signature config"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5xx"}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 2m
        annotations:
          summary: "Error rate above 5%"

      - alert: LLMLatencyHigh
        expr: histogram_quantile(0.95, rate(agent_duration_seconds_bucket[5m])) > 30
        for: 5m
        annotations:
          summary: "AI agent P95 latency exceeds 30s"

      - alert: EscalationSurge
        expr: rate(escalations_total[10m]) > 5
        for: 5m
        annotations:
          summary: "High escalation rate — possible agent issue"

      - alert: DatabasePoolExhausted
        expr: db_pool_available_connections < 2
        for: 1m
        annotations:
          summary: "Database connection pool nearly exhausted"
```

---

### 2-BE-5 · Add Database Retention Policy for Chat Messages

**File:** New Alembic migration `alembic/versions/006_chat_retention.py`
**Effort:** M

```python
# Option A: PostgreSQL partitioning (better for large tables)
def upgrade() -> None:
    # Convert chat_messages to a partitioned table by month
    # This is a significant schema change — plan a maintenance window
    op.execute("""
        CREATE TABLE chat_messages_archive AS
        SELECT * FROM chat_messages WHERE created_at < NOW() - INTERVAL '90 days';
        DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '90 days';
    """)

# Option B: Scheduled cleanup job (simpler)
# Add a scheduled task that runs monthly:
# DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '90 days'
# AND conversation_id IN (
#     SELECT id FROM conversations WHERE status = 'closed'
# )
```

---

### 2-FE-1 · Implement Terms of Service and Privacy Policy Pages

**Files:** `apps/web/app/terms/page.tsx` (new), `apps/web/app/privacy/page.tsx` (new)
**Effort:** M (1 day for minimal implementation, longer for legal review)
**Risk:** MEDIUM — Required by GDPR and Israeli Privacy Protection Law before launch

```typescript
// apps/web/app/terms/page.tsx — minimal static page
export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1>Terms of Service — Groupio</h1>
      <p>Last updated: {new Date().toLocaleDateString('he-IL')}</p>
      {/* Actual legal content required — consult legal counsel */}
    </main>
  );
}
```

**Legal requirements checklist:**
- [ ] User data collection and purpose
- [ ] Payment escrow terms
- [ ] Contractor liability
- [ ] Group offer cancellation policy
- [ ] Dispute resolution
- [ ] Israeli Consumer Protection Law compliance
- [ ] GDPR/PDPL compliance statement

---

### 2-FE-2 · Add Content-Security-Policy and HSTS Headers

**Files:** `apps/web/next.config.mjs`, `apps/admin/next.config.mjs`
**Effort:** M (1 day including testing that CSP doesn't break existing functionality)

```javascript
// apps/web/next.config.mjs
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",  // tighten after audit
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://api.groupio.co.il wss://api.groupio.co.il",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
];

const nextConfig = {
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
    ];
  },
  // ... existing config
};
```

---

### 2-FE-3 · Per-Query `staleTime` Override for Pricing-Sensitive Data

**Files:** `apps/web/lib/hooks/` (offer detail hooks), `apps/web/app/(resident)/offers/[offerId]/page.tsx`
**Effort:** S (1 hour)

```typescript
// For offer detail — use short staleTime to reflect real-time participant count
const { data: offer } = useQuery({
  queryKey: ['offer', offerId],
  queryFn: () => apiClient.getOffer(offerId),
  staleTime: 10_000,           // ← 10 seconds (overrides global 60s)
  refetchOnWindowFocus: true,  // ← override global false for this critical view
  refetchInterval: 30_000,     // ← poll every 30s while the page is open
});
```

---

### 2-FE-4 · Fix i18n Gaps

**Files:** `apps/web/app/(auth)/layout.tsx`, `apps/web/components/features/chat/AIChat.tsx`, `apps/mobile/app/_layout.tsx`
**Effort:** M (1 day)

```typescript
// apps/web/app/(auth)/layout.tsx — wrap Hebrew strings in t():
const t = useTranslations('auth.branding');
// Replace: "חסכו עד 40% על שירותי בית"
// With:    {t('savingsHeadline')}

// apps/web/components/features/chat/AIChat.tsx — fix locale-aware welcome:
const t = useTranslations('chat');
// Replace: hardcoded Hebrew welcome string
// With:    {t('welcomeMessage')}

// apps/mobile/app/_layout.tsx — gate RTL on locale:
import { getLocales } from 'expo-localization';
const locale = getLocales()[0]?.languageCode ?? 'he';
if (locale === 'he' && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}
```

**Also add:** `messages/en.json` for mobile app

---

### 2-FE-5 · Implement Share Button Functionality

**File:** `apps/web/app/(resident)/offers/[offerId]/page.tsx`
**Effort:** S (2 hours)

```typescript
const handleShare = async () => {
  const shareData = {
    title: offer?.title,
    text: t('shareText', { title: offer?.title }),
    url: window.location.href,
  };

  if (navigator.share && navigator.canShare(shareData)) {
    await navigator.share(shareData);
  } else {
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(window.location.href);
    // Show toast: "Link copied!"
  }
};

<button
  type="button"
  onClick={handleShare}
  className="..."
  aria-label={t('shareWithNeighbors')}
>
  <Share2 className="h-5 w-5" />
</button>
```

---

### 2-FE-6 · Add Error States for Failed Queries

**Files:** `apps/web/app/(resident)/dashboard/page.tsx`, `apps/web/app/(resident)/offers/page.tsx`, `apps/admin/app/dashboard/page.tsx`
**Effort:** M (2–3 hours)

```typescript
// Pattern to apply across all pages:
const { data, isLoading, isError, error } = useQuery({ ... });

if (isError) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-700">
        {t('errorLoadingData')}
      </p>
      <button onClick={() => refetch()} className="mt-2 text-sm text-red-600 underline">
        {t('retry')}
      </button>
    </div>
  );
}

// Admin activity log — distinguish empty vs error:
const { data: log = [], isError: logError } = useActivityLog();
// Show "No activity yet" only when !logError && log.length === 0
// Show "Failed to load activity" when isError
```

---

### 2-FE-7 · Add Rollback Script

**File:** `scripts/rollback.sh` (new)
**Effort:** M

```bash
#!/usr/bin/env bash
# Usage: ./scripts/rollback.sh <docker-image-tag>
# Example: ./scripts/rollback.sh sha-abc1234

set -euo pipefail

IMAGE_TAG="${1:?Usage: $0 <docker-image-tag>}"
VPS_HOST="${VPS_HOST:?Set VPS_HOST env var}"
VPS_USER="${VPS_USER:-deploy}"

echo "Rolling back to image tag: $IMAGE_TAG"

ssh "$VPS_USER@$VPS_HOST" << EOF
  cd /opt/groupio

  # Update the image tag
  echo "IMAGE_TAG=$IMAGE_TAG" > .env.rollback

  # Pull the specific image
  docker pull ghcr.io/groupio/api:$IMAGE_TAG

  # Stop and replace
  docker compose stop backend
  IMAGE_TAG=$IMAGE_TAG docker compose up -d backend

  # Verify health
  sleep 10
  curl -f http://localhost:8000/api/v1/health/live || {
    echo "Health check failed after rollback"
    exit 1
  }

  echo "Rollback successful"
EOF
```

---

## Phase 3 — Technical Debt & Polish

> **Complete within Week 4–6. System is stable but not fully hardened.**

---

### 3-BE-1 · Raise Coverage Threshold and Add Mypy to CI

**Files:** `pyproject.toml`, `.github/workflows/ci.yml`
**Effort:** L (writing the tests)

```toml
# pyproject.toml — raise incrementally, don't jump to 70% at once:
[tool.pytest.ini_options]
addopts = "--cov-fail-under=60"  # Start at 60%, raise to 70% next sprint
```

```yaml
# .github/workflows/ci.yml — add mypy job:
mypy:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<pinned-sha>
    - run: pip install mypy types-redis
    - run: mypy src/ --ignore-missing-imports --strict-optional
```

---

### 3-BE-2 · Consolidate Duplicate Model Files

**Files:** `src/models/contractor.py` vs `src/models/contractors.py`, `src/models/offer.py` vs `src/models/offers.py`, `src/models/residents.py`
**Effort:** M

1. Determine which file is the canonical one (check all imports)
2. Move any unique definitions into the canonical file
3. Delete the duplicate
4. Update all import references via `grep -r "from src.models.contractor import"` etc.

---

### 3-BE-3 · Remove Duplicate Settings Fields

**File:** `src/config/settings.py:65-69`
**Effort:** XS

```python
# Remove these duplicate lines (they are defined twice):
# SENTIMENT_ESCALATION_THRESHOLD: float = -0.5  ← remove second occurrence
# MAX_SUPPORT_ATTEMPTS_BEFORE_ESCALATION: int = 3  ← remove second occurrence
```

---

### 3-BE-4 · Fix CORS Localhost in Production and Pin Deploy Actions

**File:** `.github/workflows/deploy.yml`
**Effort:** S

```yaml
# Replace unpinned actions:
# - uses: actions/checkout@v4
# With pinned SHA:
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
```

---

### 3-BE-5 · Implement WhatsApp Business API Integration

**File:** `src/api/routes/webhooks.py:174-176`
**Effort:** L

```python
async def _send_whatsapp_reply(to: str, message: str) -> None:
    """Send a WhatsApp message via Meta Business API."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://graph.facebook.com/v17.0/{settings.WHATSAPP_PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}"},
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "text",
                "text": {"body": message},
            },
        )
        response.raise_for_status()
```

---

### 3-BE-6 · Wire Structlog for JSON Logging

**Files:** `src/utils/monitoring.py`, `src/api/main.py`
**Effort:** M

```python
# src/utils/monitoring.py
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer() if not settings.DEBUG else structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger()
```

---

### 3-FE-1 · Restructure Admin Root Layout Away from `"use client"`

**File:** `apps/admin/app/layout.tsx`
**Effort:** S

```typescript
// Remove "use client" from the root layout
// Move client-only logic (useEffect, client state) to a wrapper component
// apps/admin/app/layout.tsx — Server Component:
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <AdminProviders>  {/* ← "use client" lives here */}
          {children}
        </AdminProviders>
      </body>
    </html>
  );
}
```

---

### 3-FE-2 · Bundle Optimization

**File:** `apps/web/next.config.mjs`
**Effort:** S (2 hours)

```javascript
experimental: {
  optimizePackageImports: [
    "lucide-react",
    "recharts",        // ← ADD
    "@radix-ui/react-dialog",  // ← ADD (if used)
    "date-fns",        // ← ADD (if used)
  ],
},
```

Also define font subsets:
```typescript
// apps/web/app/layout.tsx
const inter = Inter({ subsets: ['latin'], display: 'swap' });
const heebo = Heebo({ subsets: ['hebrew', 'latin'], display: 'swap' });
```

---

### 3-FE-3 · Accessibility Improvements

**Files:** Multiple component files
**Effort:** M (1 day)

```typescript
// 1. Share button — add aria-label:
<button
  type="button"
  onClick={handleShare}
  aria-label={t('shareWithNeighbors')}  // ← was title= only
  title={t('shareWithNeighbors')}
>

// 2. Form fields — link error messages via aria-describedby:
<input
  {...register('email')}
  aria-describedby={errors.email ? 'email-error' : undefined}
  aria-invalid={!!errors.email}
/>
{errors.email && (
  <p id="email-error" role="alert" className="text-sm text-red-600">
    {errors.email.message}
  </p>
)}

// 3. Remove the hard dir="rtl" override from auth layout:
// apps/web/app/(auth)/layout.tsx
// Remove: <div dir="rtl" ...>
// Rely on: root <html dir="rtl"> set in layout.tsx
```

---

### 3-FE-4 · Implement AI Chat Persistence

**Files:** `apps/web/components/features/chat/AIChat.tsx`, Backend conversations endpoint
**Effort:** L (2 days)

```typescript
// AIChat.tsx — load history from backend on mount:
const { data: history } = useQuery({
  queryKey: ['chat-history', userId],
  queryFn: () => apiClient.getChatHistory(userId),
  enabled: !!userId,
});

// On send — append to local state AND persist to backend
const sendMessage = async (content: string) => {
  const message = { role: 'user', content, timestamp: new Date() };
  setMessages(prev => [...prev, message]);

  const response = await apiClient.sendMessage({ user_id: userId, message: content });
  setMessages(prev => [...prev, { role: 'assistant', content: response.response }]);

  // Persist both messages — backend stores them in chat_messages table
};
```

---

### 3-FE-5 · Add SEO Meta Tags to Root Layout

**File:** `apps/web/app/layout.tsx`
**Effort:** S (30 minutes)

```typescript
// apps/web/app/layout.tsx
export const metadata: Metadata = {
  title: {
    default: 'Groupio — רכישה קבוצתית לדיירים',
    template: '%s | Groupio',
  },
  description: 'פלטפורמה לרכישה קבוצתית של שירותי בית לדיירי בניינים בישראל',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    url: 'https://groupio.co.il',
    siteName: 'Groupio',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};
```

---

## Developer Experience Improvements

> These are cross-cutting improvements that should be set up early even if not blocking launch.

---

### DX-1 · Generate TypeScript Types from FastAPI OpenAPI Schema

**Tool:** `openapi-typescript`
**Effort:** M

```yaml
# .github/workflows/ci.yml — add type generation step:
- name: Generate API types from OpenAPI schema
  run: |
    # Start backend briefly to get the schema
    python -m uvicorn src.api.main:app --port 8000 &
    sleep 5
    npx openapi-typescript http://localhost:8000/openapi.json \
      -o packages/types/src/generated.ts
    kill %1
```

This eliminates the entire class of endpoint URL mismatches (P0.5) and `verify-2fa` missing endpoint bugs by making the TypeScript types authoritative from the backend schema.

---

### DX-2 · Add Playwright E2E Coverage for Critical Journeys

**File:** `apps/web/e2e/` (new spec files)
**Effort:** M

```typescript
// apps/web/e2e/resident-flow.spec.ts
test('User can register, login, and join an offer', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'Password123!');
  await page.click('[type="submit"]');
  await expect(page).toHaveURL('/dashboard');

  await page.goto('/offers');
  await page.click('[data-testid="offer-card"]:first-child');
  await page.click('[data-testid="join-offer-button"]');
  await expect(page.locator('[data-testid="join-success"]')).toBeVisible();
});
```

These tests would have caught both the signup endpoint mismatch (0-FE-5) and the `'current-user'` hardcode (0-FE-4) immediately.

---

### DX-3 · Storybook for `packages/ui` Design System

**Effort:** M

```typescript
// packages/ui/.storybook/main.ts
// Configure Storybook to pick up all *.stories.tsx files
// Add a story for each RTL-sensitive component to catch layout regressions
// Connect to Chromatic for visual regression testing in CI
```

---

## Tracking Dashboard

### Phase 0 Completion Checklist (must all be ✅ before any live traffic)

| ID | Item | File | Owner | Status |
|---|---|---|---|---|
| 0-BE-1 | Auth on /api/v1/message | src/api/main.py:171 | Backend | ⬜ |
| 0-BE-2 | Payment webhook signature | src/api/routes/payments.py:300 | Backend | ⬜ |
| 0-BE-3 | aiosmtplib in prod deps | requirements-prod.txt | Backend | ⬜ |
| 0-BE-4 | JWT secret validation | src/config/settings.py:85 | Backend | ⬜ |
| 0-BE-5 | Real payment provider | src/services/payment.py | Backend | ⬜ |
| 0-FE-1 | Remove JWT from localStorage | login/page.tsx:61 | Frontend | ⬜ |
| 0-FE-2 | Admin middleware.ts | apps/admin/middleware.ts | Frontend | ⬜ |
| 0-FE-3 | Fix admin 2FA / remove | apps/admin/app/login/page.tsx | Frontend | ⬜ |
| 0-FE-4 | Fix joinOffer userId | offers/[offerId]/page.tsx | Frontend | ⬜ |
| 0-FE-5 | Fix signup endpoint URL | apps/web/lib/api/client.ts:229 | Frontend | ⬜ |
| 0-FE-6 | Fix LayoutProps<"/"> type | apps/web/app/(auth)/layout.tsx:4 | Frontend | ⬜ |

### Phase 1 Completion Checklist

| ID | Item | Owner | Status |
|---|---|---|---|
| 1-BE-1 | Rate limit Lua script | Backend | ⬜ |
| 1-BE-2 | Auth /metrics + /contractor-webhook | Backend | ⬜ |
| 1-BE-3 | CORS fix (no localhost in prod) | Backend | ⬜ |
| 1-BE-4 | 6 missing DB indexes | Backend | ⬜ |
| 1-BE-5 | LLM timeout + fallback | Backend | ⬜ |
| 1-BE-6 | GDPR right-to-erasure | Backend | ⬜ |
| 1-BE-7 | Redis authentication | DevOps | ⬜ |
| 1-BE-8 | DB backup automation | DevOps | ⬜ |
| 1-FE-1 | Remove fake metrics (all locations) | Frontend | ⬜ |
| 1-FE-2 | Add /architecture + /payments to protected routes | Frontend | ⬜ |
| 1-FE-3 | Fix role cookie trust in middleware | Frontend | ⬜ |
| 1-FE-4 | Fix window.__auth_store in offers | Frontend | ⬜ |
| 1-FE-5 | Align ApiError constructors | Frontend | ⬜ |
| 1-FE-6 | Mobile auth (login screen + SecureStore) | Mobile | ⬜ |
| 1-FE-7 | Offer.contractor optional type | Frontend | ⬜ |

---

## Risk-Ordered Implementation Sequence

If resources are constrained, implement in this exact order:

```
Day 1:  0-FE-5 (5min), 0-FE-6 (5min), 0-FE-4 (15min)  ← quick wins, unblock testing
Day 1:  0-BE-3 (5min), 0-BE-4 (2hr)                     ← unblock backend
Day 2:  0-FE-1 (4hr), 0-FE-2 (3hr)                      ← auth security
Day 2:  0-BE-1 (4hr)                                     ← API auth
Day 3:  0-FE-3 (2hr), 0-BE-2 (4hr)                      ← admin + payments security
Day 4:  1-FE-2 (5min), 1-FE-4 (30min), 1-FE-7 (15min)  ← quick frontend fixes
Day 4:  1-BE-1 (2hr), 1-BE-2 (2hr), 1-BE-3 (30min)     ← backend hardening
Day 5:  1-FE-1 (full day — requires backend endpoint)    ← fake metrics removal
Day 5:  1-BE-4 (2hr), 1-BE-7 (2hr)                      ← DB + Redis
Days 6-7: 1-FE-3, 1-FE-5, 1-BE-5                        ← security + reliability
Days 8-10: 1-FE-6 (mobile auth)                          ← mobile
Days 11-12: 0-BE-5 (payment provider — start early, long tail)
```

**Total Phase 0+1: ~12 working days (2.5 weeks for 1 developer, ~1 week for 4)**

---

## Architecture Recommendations (Post-Launch)

These items are not blocking launch but represent the target architecture:

1. **BFF (Backend for Frontend) proxy** — Move all API calls through Next.js API routes (`/api/proxy/*`). Access tokens stay server-side, never in the browser. Eliminates the entire localStorage/cookie token problem class.

2. **tRPC or `openapi-typescript` + `@tanstack/query`** — Auto-generate typed API calls from the FastAPI OpenAPI schema. Eliminates endpoint URL drift (caught both P0-FE-5 and the admin 2FA 404 in this audit).

3. **Celery + Redis job queue** — Replace the polling `offer_lifecycle.py` worker with a proper queue. Enables retries, dead-letter queues, and distributed processing.

4. **Separate admin API subdomain** — Move all `/api/v1/admin/*` routes to `admin-api.groupio.co.il` with IP allowlisting to the admin frontend's Vercel edge nodes.

5. **Consolidate vector storage** — Supabase already provides `pgvector`. Qdrant is redundant unless the vector dataset exceeds Supabase's capability. Eliminating Qdrant reduces infrastructure cost and operational complexity.

6. **OpenTelemetry traces** — Add distributed tracing across the LangGraph agent chain to identify which agent is causing latency spikes. Export to Jaeger or Grafana Tempo.

---

*This plan was derived exclusively from static analysis of the actual codebase. Every file path, line number, and code snippet is grounded in real findings from the two audit documents.*
*Generated: 2026-02-27*
