# Groupio Multi-Agent System — Phased Implementation Plan

**Generated:** 2026-02-28
**Source:** External Release Readiness Audit
**Branch:** `claude/release-readiness-audit-3a79b`

---

## Executive Context

Based on direct codebase exploration, here is the actual state of each blocker before any work starts.

### Already Exists (audit corrections)

- **Terms of Service** (`/apps/web/app/terms/page.tsx`) and **Privacy Policy** (`/apps/web/app/privacy/page.tsx`) exist but carry a draft disclaimer: `⚠️ מסמך זה הינו טיוטה המיועדת לבדיקה פנימית בלבד`. They need attorney review and removal of the draft warning before going live.
- **React error boundary** exists in `/apps/web/app/providers.tsx` (`AppErrorBoundary` class). It is app-level only; route-level boundaries for individual pages are missing.
- **Admin user suspend/activate** exists: `PUT /admin/users/{user_id}` with `{ is_active: false }` via `AdminUserUpdate` in `/src/api/routes/admin.py`, and the admin UI at `/apps/admin/app/users/page.tsx` has a "Suspend / Activate" button. No dedicated semantic endpoint with audit logging exists.
- **Offer cancel endpoint** exists: `DELETE /offers/{offer_id}` in `/src/api/routes/offers.py` and `POST /admin/offers/{offer_id}/cancel` in admin routes.

### Confirmed Missing or Broken

- `OutreachAgent.run()` in `/src/agents/outreach.py` has no human gate — it generates and dispatches without an approval queue.
- `join_offer` in `/src/databases/postgres.py` (lines 882–909): Supabase path is read-modify-write without a transaction; asyncpg path uses two sequential writes with no `FOR UPDATE` lock.
- Auth routes (`/src/api/routes/auth.py`) have no IP-based rate limiting, no failed-attempt counter, no lockout logic.
- No PostHog or equivalent analytics SDK anywhere in `/apps/web/`.
- No Sentry SDK initialization anywhere (env var placeholder in `.env.example` but no instrumentation code).
- No database-level RLS in any migration file under `/alembic/versions/`.
- File download via `/uploads/` routes does not use signed URLs; `/src/services/storage.py` does not generate them.
- AI decision audit trail: `AgentState` is ephemeral; no persistence of agent decisions to a database table.
- Token refresh concurrency: `/apps/web/app/providers.tsx` sets `on401Retry` but has no mutex/queue for simultaneous 401 responses.
- Prometheus alertmanager target defined in `/monitoring/prometheus.yml` (lines 29–31) but no `alertmanager.yml` routing config exists.
- RTL layout: `dir="rtl"` is set in the root layout, but no Playwright tests verify Hebrew text rendering or bidirectional layout.

---

## Phase 0 — Internal Demo (now, zero changes required)

Cleared for use by 5–10 team members immediately. No code changes needed.

**Operational checklist:**
- Set `ENVIRONMENT=development` in all `.env` files
- Set `PAYMENT_PROVIDER=mock`
- Confirm `SENTRY_DSN` is empty (expected for demo)
- Use `seed.py` or manual DB inserts to load demo buildings and offers

---

## Phase 1 — Closed Beta (Sprint 1–2, target: 50–100 known users)

All 10 ship blockers must be resolved. Sprint 1 handles security and legal. Sprint 2 handles UX and data integrity.

---

### Sprint 1 (Week 1–2): Security, Legal, Autonomy Gate

---

#### Task 1.1 — Legal Review and Publication of ToS/Privacy Policy

**Owner:** Legal (primary), Frontend (secondary)
**Effort:** 3–5 days (legal review time dominates)

**Files to modify:**
- `apps/web/app/terms/page.tsx`
- `apps/web/app/privacy/page.tsx`

**Exact change needed:**

Both files contain a draft disclaimer block that must be removed after attorney sign-off:
```
⚠️ מסמך זה הינו טיוטה המיועדת לבדיקה פנימית בלבד ואינה מייצגת ייעוץ משפטי.
```

The contractor liability disclaimer (Blocker #2) must be added as a new `<section>` in `terms/page.tsx` between sections 5 and 6:

```tsx
<section>
  <h2>5א. הגבלת אחריות קבלן</h2>
  <p>
    Groupio פועלת כמתווך בלבד בין דיירים לקבלנים עצמאיים.
    Groupio אינה מעסיקה קבלנים ואינה נושאת באחריות ישירה לביצוע,
    איכות, בטיחות, או נזקים הנובעים מעבודות הקבלן.
    כל הסכם עבודה הינו בין הדייר לקבלן בלבד.
  </p>
</section>
```

**Acceptance criteria:**
- Attorney signs off on both documents in writing
- Draft disclaimer paragraph is absent from both rendered pages
- Contractor liability disclaimer section appears between sections 5 and 6 of ToS
- Both pages are linked from the signup flow's ToS checkbox

**Dependency:** Blocks Task 1.6 (signup ToS checkbox)

---

#### Task 1.2 — Outreach Agent Human Confirmation Queue

**Owner:** Backend
**Effort:** 2 days

**Files to modify/create:**
- `src/agents/outreach.py`
- `src/api/routes/admin.py`
- `src/databases/postgres.py` (new method)
- `alembic/versions/007_outreach_queue.py` (new migration)

**Exact change needed:**

New migration `007_outreach_queue.py`:
```sql
CREATE TABLE outreach_queue (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) REFERENCES users(id),
    campaign_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    variant VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending_approval',
    approved_by VARCHAR(36) REFERENCES users(id),
    approved_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_outreach_queue_status ON outreach_queue(status);
```

In `src/agents/outreach.py`, replace the direct-dispatch pattern in `run()` (lines 173–192). Instead of dispatching, write to the queue:

```python
pending_id = str(uuid4())
await self._db.create_outreach_pending({
    "id": pending_id,
    "user_id": state["user_id"],
    "campaign_type": campaign_type,
    "message": personalized,
    "variant": variant,
    "status": "pending_approval",
    "created_at": datetime.now(UTC),
})

state["actions_taken"] = [{
    "agent": "outreach",
    "action": "campaign_queued_for_approval",
    "details": {"pending_id": pending_id, "campaign_type": campaign_type},
    "response": {"type": "outreach_pending", "message": "Queued for admin approval"},
    "requires_followup": True,
    "summary_for_next_agent": f"Outreach campaign ({campaign_type}) queued, pending admin approval.",
}]
```

In `src/api/routes/admin.py`, add three new routes:

```python
@router.get("/outreach/queue")
async def list_outreach_queue(
    status: str = "pending_approval",
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """List pending outreach messages awaiting admin approval."""
    ...

@router.post("/outreach/{pending_id}/approve")
async def approve_outreach(
    pending_id: str,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Approve and dispatch an outreach message."""
    ...

@router.post("/outreach/{pending_id}/reject")
async def reject_outreach(
    pending_id: str,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Reject a pending outreach message."""
    ...
```

**Acceptance criteria:**
- `OutreachAgent.run()` never calls `send_whatsapp` or `send_email` directly
- A record appears in `outreach_queue` with `status=pending_approval` after agent runs
- `GET /admin/outreach/queue` returns pending messages
- `POST /admin/outreach/{id}/approve` changes status and dispatches the message
- Existing outreach agent unit test updated with new assertions

---

#### Task 1.3 — IP-Based Rate Limiting on Auth Endpoints

**Owner:** Backend
**Effort:** 0.5 day

**Files to modify:**
- `src/api/routes/auth.py`
- `src/databases/redis_client.py`

**Exact change needed:**

Add `check_ip_rate_limit(ip: str, limit: int, window: int) -> bool` to `redis_client.py`, keyed on `auth_ip:{ip}`.

In `src/api/routes/auth.py`, add a dependency:

```python
async def check_auth_rate_limit(request: Request) -> None:
    """Enforce IP-based rate limit on auth endpoints (20 req/min)."""
    redis = get_redis_client()
    client_ip = request.client.host if request.client else "unknown"
    allowed = await redis.check_ip_rate_limit(client_ip, limit=20, window=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Try again in a minute.",
            headers={"Retry-After": "60"},
        )
```

Apply to `/login`, `/login/json`, `/signup`, and `/password/reset` routes.

Add brute-force lockout in `login` and `login_json` handlers: after a failed password check, increment `login_fail:{user.id}` in Redis. After 5 failures within 15 minutes, set `is_active=False` and return HTTP 423. Clear the counter on successful login.

**Acceptance criteria:**
- 21st request from same IP to `/api/v1/auth/login` within 60 seconds → HTTP 429
- 5 consecutive failed logins for a user → account `is_active=False`, subsequent logins → HTTP 423
- `Retry-After: 60` header present on 429 responses
- Unit tests in `tests/unit/test_auth_rate_limit.py`

---

#### Task 1.4 — Atomic Offer Join (Race Condition Fix)

**Owner:** Backend
**Effort:** 1 day

**Files to modify:**
- `src/databases/postgres.py`

**Exact change needed:**

**Supabase path** (lines 887–896): Three separate network calls with no transaction. Replace with a Supabase RPC call to an atomic Postgres function. Add via a migration:

```sql
CREATE OR REPLACE FUNCTION join_offer_atomic(
    p_id VARCHAR, p_offer_id VARCHAR, p_user_id VARCHAR, p_unit_count INT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO offer_participants (id, offer_id, user_id, unit_count)
    VALUES (p_id, p_offer_id, p_user_id, p_unit_count);

    UPDATE offers
    SET current_participants = current_participants + p_unit_count
    WHERE id = p_offer_id AND status IN ('pending', 'matching');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not joinable or does not exist';
    END IF;
END;
$$ LANGUAGE plpgsql;
```

Replace the Supabase branch with:
```python
await client.rpc("join_offer_atomic", {
    "p_id": pid, "p_offer_id": offer_id,
    "p_user_id": user_id, "p_unit_count": unit_count
}).execute()
```

**asyncpg path** (lines 897–909): Replace two sequential calls with a single transaction:

```python
async with pool.acquire() as conn:
    async with conn.transaction():
        await conn.execute(
            "INSERT INTO offer_participants (id, offer_id, user_id, unit_count) VALUES ($1, $2, $3, $4)",
            pid, offer_id, user_id, unit_count,
        )
        result = await conn.execute(
            "UPDATE offers SET current_participants = current_participants + $1 "
            "WHERE id = $2 AND status IN ('pending', 'matching') "
            "AND current_participants < max_participants",
            unit_count, offer_id,
        )
        if result == "UPDATE 0":
            raise ValueError("Offer not joinable, full, or does not exist")
```

Apply the same transaction pattern to `leave_offer` (lines 911–944).

**Acceptance criteria:**
- 50 concurrent `POST /offers/{id}/join` requests for `max_participants=10` → exactly 10 succeed
- Zero duplicate rows in `offer_participants` after concurrent test
- Integration test in `tests/integration/test_api_routes.py`

---

#### Task 1.5 — Sentry Initialization (Backend + Frontend)

**Owner:** Backend, Frontend
**Effort:** 0.5 day each

**Files to modify:**
- `src/utils/monitoring.py`
- `apps/web/next.config.mjs`
- `apps/web/sentry.client.config.ts` (new)
- `apps/web/sentry.server.config.ts` (new)
- `.github/workflows/deploy.yml`

**Exact change needed:**

Backend — inside `init_monitoring()` in `src/utils/monitoring.py`:
```python
import sentry_sdk
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
    )
```

Frontend — install `@sentry/nextjs`, add `withSentryConfig` wrapper in `next.config.mjs`. Create config files:
```typescript
// apps/web/sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

Update `AppErrorBoundary.componentDidCatch` in `providers.tsx` to call `Sentry.captureException(error)`.

Add `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` to GitHub Actions secrets and reference them in `.github/workflows/deploy.yml`.

**Acceptance criteria:**
- `SENTRY_DSN=""` → silently skipped, no errors
- `SENTRY_DSN=<real>` in production → uncaught exceptions appear in Sentry within 30 seconds
- Source maps uploaded during build
- Deploy CI step fails if `SENTRY_DSN` is empty and `ENVIRONMENT=production`

---

#### Task 1.9 — Dedicated User Suspend Endpoint with Audit Log

**Owner:** Backend, Frontend
**Effort:** 0.5 day

**Files to modify:**
- `src/api/routes/admin.py`

**Exact change needed:**

Add semantic endpoints with audit logging:

```python
@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: Request,
    body: dict = Body(default={"reason": ""}),
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    db = get_postgres_client()
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    await db.update_user(user_id, {"is_active": False})
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "suspend_user",
        "resource_type": "user",
        "resource_id": user_id,
        "details": {"reason": body.get("reason", ""), "suspended_user_email": user.email},
        "ip_address": request.client.host if request.client else None,
    })
    redis = get_redis_client()
    await redis.delete(f"refresh_token:{user_id}")
    return {"status": "suspended", "user_id": user_id}

@router.post("/users/{user_id}/activate")
async def activate_user(...) -> dict[str, Any]:
    ...
```

**Acceptance criteria:**
- `POST /admin/users/{id}/suspend` sets `is_active=False` and invalidates refresh token
- Self-suspension attempt → 400
- Audit log entry with `action="suspend_user"` appears in `/admin/audit-logs`
- Suspended user receives 403 on next API call

---

### Sprint 2 (Week 3–4): UX, Empty States, RTL Verification

---

#### Task 1.6 — Empty State Components and ToS Checkbox in Signup

**Owner:** Frontend
**Effort:** 1.5 days

**Files to modify/create:**
- `apps/web/components/shared/EmptyState.tsx` (new)
- `apps/web/app/(resident)/dashboard/page.tsx`
- `apps/web/app/(resident)/offers/page.tsx`
- `apps/web/app/(resident)/contractors/page.tsx`
- `apps/web/app/(auth)/signup/page.tsx`

**Exact change needed:**

Create `apps/web/components/shared/EmptyState.tsx`:
```tsx
interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; href: string };
}
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) { ... }
```

In `dashboard/page.tsx`, add a "New resident? Join a building first" empty state when `statsQuery.data?.buildingName === '-'`, with a CTA linking to `/building/join`.

In `apps/web/app/(auth)/signup/page.tsx`, add before the submit button:
```tsx
<div className="flex items-start gap-2">
  <input type="checkbox" id="tos" required />
  <label htmlFor="tos">
    קראתי ומסכים/ה ל
    <Link href="/terms">תנאי השימוש</Link>
    ול
    <Link href="/privacy">מדיניות הפרטיות</Link>
  </label>
</div>
```

**Acceptance criteria:**
- New user with no building sees "Join a building" CTA, not a blank grid
- Empty offers list shows Hebrew text and "Browse available offers" CTA
- Signup form cannot be submitted without ToS checkbox
- ToS and Privacy links open in the same tab

**Dependency:** Requires Task 1.1 (legal sign-off) before Task 1.6 can go live

---

#### Task 1.7 — Route-Level Error Boundaries

**Owner:** Frontend
**Effort:** 0.5 day

**Files to create:**
- `apps/web/app/(resident)/offers/error.tsx`
- `apps/web/app/(resident)/dashboard/error.tsx`
- `apps/web/app/(resident)/payments/error.tsx`
- `apps/admin/app/error.tsx` (update existing)

**Exact change needed:**

The root-level `apps/web/app/error.tsx` is a proper Next.js error boundary. Create route-segment `error.tsx` files so crashes in `/offers` don't kill the entire app. Copy the root pattern and customize the heading. In `apps/admin/app/error.tsx`, add `Sentry.captureException` in `useEffect` (after Task 1.5).

**Acceptance criteria:**
- Throwing in `/offers` renders the offers-specific error page, not root error
- "Reset" button calls `reset()` and clears error state
- Error boundaries exist for: dashboard, offers, payments, contractors, admin

---

#### Task 1.8 — RTL/Hebrew Layout Verification

**Owner:** Frontend, QA
**Effort:** 1 day

**Files to create/modify:**
- `apps/web/e2e/rtl.spec.ts` (new)
- `apps/web/playwright.config.ts`
- `apps/web/styles/globals.css`

**Exact change needed:**

Create `apps/web/e2e/rtl.spec.ts`:
```typescript
test('Hebrew homepage direction', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
});

test('Dashboard layout flows RTL', async ({ page }) => {
  // Login as test user
  // Verify card grid is right-to-left
  // Check navigation sidebar is on the right
  // Check text alignment is right-aligned in Hebrew sections
});

test('Offer page bidirectional content', async ({ page }) => {
  // Verify Hebrew description is RTL
  // Verify prices (numbers) are LTR within RTL context
});
```

In `playwright.config.ts`, add a Hebrew locale project:
```typescript
{
  name: 'chromium-he',
  use: { ...devices['Desktop Chrome'], locale: 'he-IL' },
},
```

Verify `[dir="rtl"] .rtl-flip { transform: scaleX(-1); }` is defined in `globals.css` (this class is already used on ChevronLeft icons at dashboard lines 127, 325).

**Acceptance criteria:**
- All Playwright RTL tests pass in CI (`chromium-he` project)
- `html[dir="rtl"]` verified on Hebrew locale pages
- Sidebar navigation appears on the right in Hebrew locale
- ChevronLeft icons flip in RTL mode
- Heebo font verified loaded for Hebrew text

---

## Phase 2 — Real Pilot (Sprint 3–4, target: 200–500 users)

---

### Sprint 3 (Week 5–6): Data Integrity and Security Hardening

---

#### Task 2.1 — Row-Level Security (PostgreSQL RLS)

**Owner:** Backend, DevOps
**Effort:** 2 days

**Files to create:**
- `alembic/versions/008_rls_policies.py`

**Exact change needed:**

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_read ON users
  FOR SELECT USING (
    auth.uid() = id::uuid
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()::text AND u.role IN ('admin', 'super_admin'))
  );

CREATE POLICY offer_participants_building ON offer_participants
  FOR SELECT USING (
    user_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()::text AND u.role IN ('admin', 'super_admin'))
  );

CREATE POLICY payments_owner ON payments
  FOR SELECT USING (
    user_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()::text AND u.role IN ('admin', 'super_admin'))
  );

-- Service role bypass for backend asyncpg connection
CREATE POLICY service_role_all ON users FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON offer_participants FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON payments FOR ALL TO service_role USING (true);
```

**Important:** The asyncpg pool in `src/databases/postgres.py` must use service role credentials so the backend bypasses RLS, while direct Supabase client connections are subject to it.

**Acceptance criteria:**
- Postgres query with user role can only SELECT its own rows from `payments`
- Service role connection can SELECT all rows
- Migration runs cleanly without downtime
- Integration test verifies cross-user data isolation

---

#### Task 2.2 — Signed URLs for File Storage

**Owner:** Backend
**Effort:** 1 day

**Files to modify:**
- `src/services/storage.py`
- `src/api/routes/uploads.py`

**Exact change needed:**

Add to `storage.py`:
```python
async def create_signed_url(self, bucket: str, path: str, expires_in: int = 3600) -> str:
    """Generate a time-limited signed URL for private file access."""
    if self._use_supabase:
        client = await self._get_client()
        result = await client.storage.from_(bucket).create_signed_url(path, expires_in)
        return result["signedURL"]
    else:
        import hmac, hashlib, time
        settings = get_settings()
        expiry = int(time.time()) + expires_in
        sig = hmac.new(settings.JWT_SECRET_KEY.encode(), f"{path}:{expiry}".encode(), hashlib.sha256).hexdigest()
        return f"/local-files/{path}?expires={expiry}&sig={sig}"
```

In `src/api/routes/uploads.py`, replace any direct file serve with:
```python
@router.get("/{file_id}")
async def get_file_url(
    file_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    record = await db.get_file_record(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    if record["user_id"] != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    storage = get_storage_service()
    signed_url = await storage.create_signed_url(record["bucket"], record["path"], expires_in=900)
    return {"url": signed_url, "expires_in": 900}
```

**Acceptance criteria:**
- `GET /uploads/{file_id}` without valid JWT → 401
- Signed URL expires after 15 minutes (900 seconds)
- URL from response returns 403 after expiry
- Direct storage URL without signature → 403

---

#### Task 2.3 — Token Refresh Concurrency Queue

**Owner:** Frontend
**Effort:** 0.5 day

**Files to modify:**
- `apps/web/lib/api/client.ts`

**Exact change needed:**

Add a single-flight mutex to prevent multiple concurrent refresh calls:

```typescript
private _refreshPromise: Promise<string | null> | null = null;

private async refreshToken(): Promise<string | null> {
  if (this._refreshPromise) {
    return this._refreshPromise; // Reuse in-flight refresh
  }
  this._refreshPromise = this._on401Retry?.() ?? Promise.resolve(null);
  try {
    return await this._refreshPromise;
  } finally {
    this._refreshPromise = null;
  }
}
```

**Acceptance criteria:**
- 5 simultaneous requests that all 401 → exactly ONE call to `POST /auth/refresh`
- All 5 requests are retried with the new token
- Vitest test verifies single refresh call

---

#### Task 2.4 — PostHog Funnel Analytics

**Owner:** Frontend
**Effort:** 1 day

**Files to modify:**
- `apps/web/app/providers.tsx`
- `apps/web/app/(auth)/signup/page.tsx`
- `apps/web/app/(resident)/offers/[offerId]/page.tsx`
- `apps/web/app/(resident)/dashboard/page.tsx`
- `apps/web/.env.example`

**Exact change needed:**

Add `posthog-js` dependency. Initialize in `providers.tsx`:
```tsx
import posthog from 'posthog-js';
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: false,
  });
}
```

Track five funnel events:
1. `signup_started` — when signup form is first focused
2. `signup_completed` — on successful signup response
3. `offer_viewed` — on offer detail page mount
4. `offer_join_clicked` — when "Join" button is clicked
5. `offer_joined` — on successful join API response

No PII in event properties (only `offer_id`, `category`).

**Acceptance criteria:**
- PostHog dashboard shows full funnel
- No PII in event properties
- PostHog disabled when `NEXT_PUBLIC_POSTHOG_KEY` is empty
- `GDPR: true` set in PostHog init

---

#### Task 2.5 — Under-Subscription Resolution Path

**Owner:** Backend, Frontend
**Effort:** 1.5 days

**Files to modify:**
- `src/api/routes/offers.py`
- `src/api/routes/admin.py`
- `apps/admin/app/offers/page.tsx`

**Exact change needed:**

Add resolution endpoint in `src/api/routes/offers.py`:
```python
@router.post("/{offer_id}/resolve-undersubscription")
async def resolve_undersubscription(
    offer_id: str,
    action: str = Query(..., regex="^(extend_deadline|cancel_with_refund|lower_minimum)$"),
    new_deadline: datetime | None = None,
    new_minimum: int | None = None,
    current_user: UserInDB = Depends(get_current_user),
) -> OfferResponse:
    """Handle an offer that failed to reach minimum participants."""
    ...
```

Three actions: `extend_deadline`, `cancel_with_refund` (triggers payment reversal), `lower_minimum`.

In admin offers page, add a badge for offers where `deadline < now AND current_participants < min_participants`, with a "Resolve" modal.

Add a background task in `src/workers/` to notify participants 48h before deadline for at-risk offers.

**Acceptance criteria:**
- Expired undersubscribed offers flagged in admin UI
- All three resolution actions work end-to-end
- `cancel_with_refund` triggers payment reversal for paid participants
- Daily background task sends at-risk notifications

---

#### Task 2.6 — AI Decision Audit Trail Persistence

**Owner:** Backend
**Effort:** 1 day

**Files to create/modify:**
- `alembic/versions/009_agent_audit_log.py` (new)
- `src/agents/base.py`
- `src/orchestration/graph.py`

**Exact change needed:**

Migration `009_agent_audit_log.py`:
```sql
CREATE TABLE agent_audit_log (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36),
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    agent_name VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    model_used VARCHAR(50),
    tokens_used INTEGER,
    latency_ms INTEGER,
    confidence_score FLOAT,
    requires_human_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_agent_audit_user ON agent_audit_log(user_id);
CREATE INDEX ix_agent_audit_agent ON agent_audit_log(agent_name, created_at);
```

In `src/agents/base.py`, add `_persist_audit()` called as fire-and-forget via `asyncio.create_task()` at end of `_call_llm`. Matching/Pricing/Vetting set `requires_human_review=True`.

Add `GET /admin/agents/audit` endpoint (paginated) in `src/api/routes/agents.py`.

**Acceptance criteria:**
- Every agent invocation creates a row in `agent_audit_log`
- `GET /admin/agents/audit` returns paginated results
- Matching/Pricing/Vetting actions have `requires_human_review=True`
- Log persists across app restarts
- Sensitive content truncated to 500 chars

---

### Sprint 4 (Week 7–8): Performance, UX Polish, Test Coverage

---

#### Task 2.7 — Loading States for AI Operations

**Owner:** Frontend
**Effort:** 1 day

**Files to modify:**
- `apps/web/app/(resident)/chat/page.tsx`
- Chat components in `apps/web/components/features/chat/`

**Exact change needed:**

Add an animated thinking indicator:
```tsx
function AIThinkingIndicator({ agentName }: { agentName: string }) {
  const messages = ["מחפש קבלנים...", "בודק מחירים...", "מנתח היסטוריה..."];
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 2000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <span key={i} className="w-2 h-2 bg-primary-400 rounded-full animate-bounce"
            style={{animationDelay: `${i*0.15}s`}} />
        ))}
      </div>
      <span className="text-sm text-gray-500">{messages[msgIdx]}</span>
    </div>
  );
}
```

Add AI decision disclosure banner above the chat input:
```tsx
<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4">
  תוצאות מחיפוש זה מופקות על ידי בינה מלאכותית ועשויות לדרוש בדיקה אנושית.
</div>
```

After 30 seconds without response, show: "This is taking longer than expected..."

**Acceptance criteria:**
- Animated indicator appears within 100ms of sending a message
- Rotating status messages update every 2 seconds
- AI disclosure banner always visible above chat input
- 30-second timeout message shown

---

#### Task 2.8 — Pagination Consistency

**Owner:** Backend
**Effort:** 0.5 day

**Files to modify:**
- `src/api/routes/contractors.py`
- `src/api/routes/buildings.py`
- `src/api/routes/escalations.py`

**Exact change needed:**

Standardize all list endpoints to match the `OfferListResponse` shape:
```python
return {
    "items": items,
    "total": total,
    "page": page,
    "page_size": page_size,
    "has_more": (page * page_size) < total,
}
```

**Acceptance criteria:**
- All `GET /*/` list endpoints return `{items, total, page, page_size, has_more}`
- OpenAPI schema shows consistent response shape
- Frontend `useInfiniteQuery` works consistently across all list views

---

#### Task 2.9 — Test Coverage to 80%

**Owner:** Backend, Frontend
**Effort:** 3 days

**Files to create:**
- `tests/unit/test_join_offer_atomic.py`
- `tests/unit/test_auth_rate_limit.py`
- `tests/unit/test_outreach_queue.py`
- `tests/unit/test_offer_cancel_refund.py`
- `tests/integration/test_agent_audit_log.py`

**Files to modify:**
- `.github/workflows/ci.yml`

**Exact change needed:**

In `.github/workflows/ci.yml`, update the pytest step to enforce 80% coverage:
```yaml
- name: Run tests with coverage enforcement
  run: |
    pytest tests/ --cov=src --cov-fail-under=80 --cov-report=term-missing
```

New test files must cover: concurrent join race condition, IP rate limiting and account lockout, outreach approval flow, under-subscription resolution paths, AI decision persistence.

**Acceptance criteria:**
- `pytest --cov=src` shows >= 80% overall coverage
- CI fails if coverage drops below 80%
- Payment flow coverage >= 90%
- All Phase 1 and Phase 2 features have corresponding tests

---

#### Task 2.10 — Prometheus Alert Routing to Slack

**Owner:** DevOps
**Effort:** 0.5 day

**Files to create/modify:**
- `monitoring/alertmanager.yml` (new)
- `monitoring/prometheus.yml`

**Exact change needed:**

Create `monitoring/alertmanager.yml`:
```yaml
global:
  resolve_timeout: 5m
  slack_api_url: '${SLACK_WEBHOOK_URL}'

route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'slack-critical'
  routes:
    - match:
        severity: critical
      receiver: 'slack-critical'
    - match:
        severity: warning
      receiver: 'slack-warning'

receivers:
  - name: 'slack-critical'
    slack_configs:
      - channel: '#alerts-critical'
        title: '[CRITICAL] {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true
  - name: 'slack-warning'
    slack_configs:
      - channel: '#alerts-warning'
        title: '[WARNING] {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
        send_resolved: true
```

Add `SLACK_WEBHOOK_URL` to deploy workflow secrets.

**Acceptance criteria:**
- Critical alert (`PaymentWebhookFailed`) sends message to `#alerts-critical` within 2 minutes
- Warning alerts route to `#alerts-warning`
- Resolved alerts send a resolution notification
- Tested by manually triggering `HighErrorRate` in staging

---

## Phase 3 — Public Launch (Sprint 5–6, target: scale + compliance)

---

### Sprint 5 (Week 9–10): Scale and Transparency

---

#### Task 3.1 — AI Agent Autonomy Mode Configuration

**Owner:** Backend
**Effort:** 1 day

**Files to modify:**
- `src/config/settings.py`
- `src/agents/matching.py`
- `src/agents/pricing.py`
- `src/agents/vetting.py`
- `src/orchestration/graph.py`

**Exact change needed:**

Add to `src/config/settings.py`:
```python
# Agent autonomy levels: "auto" | "recommend" | "gated"
MATCHING_AGENT_MODE: str = "recommend"
PRICING_AGENT_MODE: str = "recommend"
VETTING_AGENT_MODE: str = "recommend"
OUTREACH_AGENT_MODE: str = "gated"  # Always gated (Task 1.2)
```

In recommend-mode agents, when mode is `"recommend"`, add `"requires_human_confirmation": True` to `actions_taken` instead of auto-applying results. Orchestrator in `graph.py` routes to admin queue when this flag is set.

**Acceptance criteria:**
- `MATCHING_AGENT_MODE=recommend` → results appear in admin queue, not auto-applied
- `MATCHING_AGENT_MODE=auto` → restores current behavior
- Config change requires only env var update, no deploy
- Admin UI shows current autonomy level per agent

---

#### Task 3.2 — Multi-Table Transaction Wrapping

**Owner:** Backend
**Effort:** 1 day

**Files to modify:**
- `src/databases/postgres.py`
- `src/api/routes/payments.py`

**Exact change needed:**

Payment creation that writes to both `payments` and `invoices` must use the existing `transaction()` context manager:

```python
async with db.transaction() as conn:
    payment_id = await db.create_payment(payment_data, conn=conn)
    invoice_id = await db.create_invoice(invoice_data, conn=conn)
    await db.update_offer(offer_id, {"status": "in_progress"}, conn=conn)
```

Update `create_payment`, `create_invoice`, and `update_offer` to accept optional `conn` parameter for transaction reuse.

**Acceptance criteria:**
- Payment + invoice creation is atomic: failure mid-operation rolls back payment row
- No orphaned payment records without corresponding invoices
- Integration test verifies atomicity via injected failure

---

#### Task 3.3 — Contractor Trust Signals in Frontend

**Owner:** Frontend, Design
**Effort:** 1.5 days

**Files to create/modify:**
- `apps/web/components/features/ContractorTrustBadge.tsx` (new)
- `apps/web/app/(resident)/contractors/page.tsx`

**Exact change needed:**

Create `ContractorTrustBadge.tsx`:
```tsx
interface TrustBadgeProps {
  verificationStatus: 'verified' | 'pending' | 'rejected';
  trustScore: number; // 0-100
  completedJobs: number;
  licenseNumber?: string;
}
export function ContractorTrustBadge({ verificationStatus, trustScore, completedJobs }: TrustBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      {verificationStatus === 'verified' && (
        <span className="badge bg-green-100 text-green-800 flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          מאומת
        </span>
      )}
      {trustScore >= 80 && <span className="badge bg-blue-100 text-blue-800">אמין</span>}
      <span className="text-sm text-gray-500">{completedJobs} עבודות שהושלמו</span>
    </div>
  );
}
```

**Acceptance criteria:**
- Verified contractor cards show green "מאומת" badge
- Trust score >= 80 shows "אמין" badge
- License number visible on contractor detail page
- Unverified contractors show pending state clearly

---

#### Task 3.4 — Pricing Explanation UX (AI Transparency)

**Owner:** Frontend, Backend
**Effort:** 1 day

**Files to modify/create:**
- `alembic/versions/010_pricing_rationale.py` (new)
- `src/agents/pricing.py`
- `src/models/offer.py`
- `apps/web/app/(resident)/offers/[offerId]/page.tsx`

**Exact change needed:**

Migration adds `pricing_rationale TEXT` column to `offers` table.

In `src/agents/pricing.py`, after computing price, generate a Hebrew explanation:
```python
rationale = await self._call_llm([{
    "role": "user",
    "content": f"Explain in one Hebrew sentence why this price (₪{price}) is fair for {category} service for {participants} participants in {city}."
}])
```

In offer detail page, add collapsible section:
```tsx
<details className="mt-4 text-sm text-gray-500">
  <summary className="cursor-pointer font-medium text-primary-600">
    כיצד חושב המחיר?
  </summary>
  <p className="mt-2">{offer.pricingRationale || "המחיר חושב על ידי AI על בסיס מספר משתתפים, קטגוריה, ומחירי שוק."}</p>
</details>
```

**Acceptance criteria:**
- Offer detail shows "כיצד חושב המחיר?" expandable section
- Rationale generated in Hebrew by pricing agent
- Legacy offers (no rationale) show default explanation text
- Rationale persisted to DB, not re-computed per view

---

### Sprint 6 (Week 11–12): Scale Hardening and Full Compliance

---

#### Task 3.5 — Database Connection Pool Tuning

**Owner:** DevOps, Backend
**Effort:** 0.5 day

**Files to modify:**
- `src/databases/postgres.py`
- `src/api/routes/health.py`

**Exact change needed:**

In `postgres.py`, increase asyncpg pool size for pilot scale:
```python
self._asyncpg_pool = await asyncpg.create_pool(
    db_url,
    min_size=5,
    max_size=25,
    max_inactive_connection_lifetime=300,
    command_timeout=60,
)
```

Add pool stats to health endpoint:
```python
@router.get("/health/db")
async def db_health():
    pool = await db._get_client()
    return {
        "pool_size": pool.get_size(),
        "free_connections": pool.get_idle_size(),
        "used_connections": pool.get_size() - pool.get_idle_size(),
    }
```

**Acceptance criteria:**
- `GET /health/db` returns pool statistics
- `DatabasePoolExhausted` alert fires when free connections < 2
- Load test with 200 concurrent requests passes without pool exhaustion

---

#### Task 3.6 — LLM Explainability Storage

**Owner:** Backend
**Effort:** 0.5 day

**Files to modify/create:**
- `alembic/versions/011_llm_explainability.py` (new)
- `src/agents/base.py`

**Exact change needed:**

Extend `agent_audit_log` table (from Task 2.6):
```sql
ALTER TABLE agent_audit_log ADD COLUMN reasoning_chain JSONB;
ALTER TABLE agent_audit_log ADD COLUMN cited_sources JSONB;
ALTER TABLE agent_audit_log ADD COLUMN alternatives_considered JSONB;
```

In `base.py`, after each `_call_llm` call, extract any `<thinking>` tags from Claude's extended thinking response and store in `reasoning_chain`. Store top 3 alternatives considered by matching agent in `alternatives_considered`.

**Acceptance criteria:**
- Matching agent decisions store top 3 contractor candidates considered (not just selected)
- Pricing decisions store the price range considered and final choice rationale
- `GET /admin/agents/audit/{id}` returns `reasoning_chain` for inspection

---

## Dependency Graph

```
Task 1.1 (Legal ToS) ──────────────────────────────────> Task 1.6 (Signup ToS checkbox)
Task 1.2 (Outreach queue) ──── pattern reused by ──────> Task 3.1 (Autonomy config)
Task 1.3 (Auth rate limit)
Task 1.4 (Atomic join)
Task 1.5 (Sentry) ─────────────────────────────────────> Task 1.7 (Route error boundaries)
Task 1.7 (Error boundaries)
Task 1.8 (RTL verification)
Task 1.9 (Suspend endpoint)

Task 2.1 (RLS)
Task 2.2 (Signed URLs)
Task 2.3 (Token refresh queue)
Task 2.4 (PostHog)
Task 2.5 (Under-subscription)
Task 2.6 (Audit trail) ─────────────────────────────────> Task 3.6 (LLM explainability)
Task 2.7 (AI loading states)
Task 2.8 (Pagination)
Task 2.9 (80% coverage) ─────── depends on all Phase 1 + Phase 2 tasks
Task 2.10 (Alert routing)

Task 3.1 (Autonomy config) ──── depends on Task 1.2 (outreach_queue pattern)
Task 3.2 (Transactions)
Task 3.3 (Trust signals)
Task 3.4 (Pricing UX)
Task 3.5 (Pool tuning)
Task 3.6 (LLM explainability) ── depends on Task 2.6 (audit log table)
```

**Hard blocks:**
- Task 1.6 cannot go live until Task 1.1 is legally cleared
- Task 1.7 should start after Task 1.5 (Sentry wired first)
- Task 2.9 must run after all Phase 1 and Phase 2 tasks are complete
- Task 3.1 requires the `outreach_queue` table from Task 1.2

---

## Sprint Planning Summary

| Sprint | Weeks | Focus | Tasks | Lead |
|--------|-------|-------|-------|------|
| Sprint 1 | 1–2 | Security + Legal + Autonomy Gate | 1.1, 1.2, 1.3, 1.4, 1.5, 1.9 | Backend + Legal |
| Sprint 2 | 3–4 | UX + RTL + ToS Integration | 1.6, 1.7, 1.8 | Frontend |
| Sprint 3 | 5–6 | Data Integrity + Analytics | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 | Backend |
| Sprint 4 | 7–8 | Polish + Test Coverage | 2.7, 2.8, 2.9, 2.10 | Full team |
| Sprint 5 | 9–10 | Scale + Transparency | 3.1, 3.2, 3.3, 3.4 | Full team |
| Sprint 6 | 11–12 | Compliance Hardening | 3.5, 3.6 | Backend + DevOps |

---

## Test Strategy

### Phase 1 Tests

**Unit tests (`tests/unit/`):**
- `test_auth_rate_limit.py` — IP rate limit hit (21st request → 429), lockout after 5 failures, counter cleared on success
- `test_outreach_queue.py` — Agent `run()` creates queue entry, no external send, approve dispatches, reject closes
- `test_join_offer_atomic.py` — Mock 50 concurrent joins, verify exactly `max_participants` succeed

**Integration tests (`tests/integration/`):**
- Extend `test_api_routes.py` with concurrent join test using real DB, verify no duplicate participants
- `test_admin_outreach.py` — end-to-end outreach queue flow

**E2E tests (`apps/web/e2e/`):**
- `rtl.spec.ts` — All RTL layout assertions
- `signup.spec.ts` — ToS checkbox blocks submission, links open correctly

### Phase 2 Tests

**Unit tests:**
- `test_rls_policies.py` — DB-level isolation with different role connections
- `test_signed_urls.py` — Signed URL expiry, unauthorized access denied
- `test_token_refresh_concurrency.ts` (Vitest) — Single refresh call despite concurrent 401s
- `test_offer_undersubscription.py` — All three resolution paths

**Integration tests:**
- `test_agent_audit_log.py` — Every agent invocation persists to `agent_audit_log`
- `test_payment_transaction.py` — Injected failure mid-payment rolls back all tables

### Phase 3 Tests

- **Load test:** 500 concurrent users via Locust targeting `/api/v1/offers` — P95 < 500ms
- **Security scan:** OWASP ZAP against staging environment
- **Compliance:** Manual walkthrough of GDPR erasure flow (`DELETE /auth/me`)

---

## Rollout Strategy

### Feature Flags

Extend the existing env-var feature flag pattern in `src/config/settings.py`:
```python
ENABLE_POSTHOG: bool = False             # Toggle analytics
ENABLE_SIGNED_URLS: bool = False         # Toggle before full RLS is live
ENABLE_OUTREACH_QUEUE: bool = True       # Phase 1 default: always on
OUTREACH_AUTO_APPROVE_CAMPAIGNS: list[str] = []  # Whitelist safe campaigns
```

### Staged Rollout

**Phase 1 (closed beta):** Entire system is invite-only. The admin user list at `/admin/users` controls access. No runtime feature flags needed.

**Phase 2 (real pilot):** Use PostHog feature flags (after Task 2.4) for:
- Empty state components: 100% rollout immediately (safe UI change)
- Signed URLs: toggle via `ENABLE_SIGNED_URLS`; enable after verifying no broken links
- RLS: enable per-table incrementally, verify no regressions before proceeding to next table

**Phase 3 (public launch):**
- Outreach agent: start with queue always required; after 2 weeks low rejection rate, add safe campaigns to `OUTREACH_AUTO_APPROVE_CAMPAIGNS`
- Agent autonomy: start all agents in `"recommend"` mode, graduate to `"auto"` per agent after 30 days of audited accuracy

### Kill Switches

- Extend `/admin/agents/{agent_name}/reload` to accept `{ "mode": "disabled" }` (Task 3.1)
- Set `RATE_LIMIT_PER_USER=0` in Redis to immediately block all user traffic to auth endpoints in an emergency (existing rate limiter in `/src/api/middleware/`)

---

## Critical Files Summary

| File | Why Critical | Tasks |
|------|-------------|-------|
| `src/agents/outreach.py` | Outreach auto-send → queue conversion; template for all agent autonomy changes | 1.2, 3.1 |
| `src/databases/postgres.py` | Race condition fix, transaction wrapping, RLS compatibility | 1.4, 2.1, 3.2 |
| `src/api/routes/auth.py` | IP rate limiting, brute-force lockout — highest-risk public endpoint | 1.3 |
| `apps/web/app/providers.tsx` | Token refresh mutex, Sentry init, PostHog init — central frontend infrastructure | 1.5, 2.3, 2.4 |
| `apps/web/app/terms/page.tsx` | Legal sign-off required here before any real users | 1.1 |
| `alembic/versions/` | All schema changes — coordinate migration order carefully | 1.2, 2.1, 2.6, 3.4, 3.6 |
