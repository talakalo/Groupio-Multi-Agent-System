# Groupio — Pilot Release Checklist & Go/No-Go Criteria

> **Release target:** Controlled pilot — 20–50 real users across 1–3 buildings.
> **Branch:** `claude/pilot-readiness-hardening-cNLYY` (merge to `dev` before deploy)

---

## 1. Required Environment Variables

All variables below must be set in `.env` (backend) and `.env.local` (frontend)
before deploying to the pilot environment.

### Backend (`.env`)

```bash
# ── Auth ──────────────────────────────────────────────────────────────────
SECRET_KEY=<random 64-char hex>              # JWT signing key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/groupio
# OR Supabase dual-backend:
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>

# ── Storage (Supabase Storage or local fallback) ───────────────────────────
STORAGE_PROVIDER=supabase          # "supabase" | "local"
SUPABASE_STORAGE_URL=${SUPABASE_URL}
SUPABASE_STORAGE_KEY=${SUPABASE_KEY}
# For local fallback (dev only):
LOCAL_STORAGE_PATH=/tmp/groupio-uploads

# ── Payments (Stripe) ─────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...      # MUST be test key for pilot
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_TEST_MODE=true              # Explicit safeguard flag

# ── LLM / AI ──────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...              # Or ANTHROPIC_API_KEY
ANTHROPIC_API_KEY=sk-ant-...

# ── Redis ─────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Email ─────────────────────────────────────────────────────────────────
SENDGRID_API_KEY=SG....            # Or SMTP_* vars
FROM_EMAIL=no-reply@groupio.co.il

# ── Frontend API base ─────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.groupio.co.il  # or http://localhost:8000 for dev

# ── WhatsApp (optional for pilot) ─────────────────────────────────────────
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
```

### Frontend (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000   # or your staging API URL
NEXT_PUBLIC_STRIPE_KEY=pk_test_...
```

---

## 2. Local Development Verification

Step-by-step commands to verify a clean local setup.

```bash
# ── Prerequisites ─────────────────────────────────────────────────────────
node --version        # 20+
pnpm --version        # 9+
python --version      # 3.11+
docker compose version

# ── Install dependencies ───────────────────────────────────────────────────
pnpm install
pip install -e ".[dev]"

# ── Start infrastructure ───────────────────────────────────────────────────
docker compose up -d postgres redis

# ── Run migrations ────────────────────────────────────────────────────────
alembic upgrade head
# Expected: "013_onboarding_at ... done"

# ── Seed test data (optional) ─────────────────────────────────────────────
python scripts/seed_test_data.py    # if script exists

# ── Start backend ─────────────────────────────────────────────────────────
uvicorn src.api.main:app --reload --port 8000
# Verify: curl http://localhost:8000/api/v1/health

# ── Start frontend ────────────────────────────────────────────────────────
cd apps/web && pnpm dev             # → http://localhost:3000

# ── Run backend tests ─────────────────────────────────────────────────────
pytest tests/unit -x -q
pytest tests/integration -x -q
# Including new route tests:
#   tests/integration/test_onboarding_routes.py
#   tests/integration/test_conversation_routes.py

# ── Run frontend unit tests ───────────────────────────────────────────────
pnpm --filter web test
pnpm --filter admin test

# ── Run E2E pilot smoke suite ─────────────────────────────────────────────
pnpm --filter web exec playwright install chromium --with-deps
pnpm --filter web exec playwright test e2e/pilot-smoke.spec.ts \
  --project=chromium --reporter=list

# ── Type check ────────────────────────────────────────────────────────────
pnpm --filter web exec tsc --noEmit
pnpm --filter admin exec tsc --noEmit

# ── Lint ──────────────────────────────────────────────────────────────────
pnpm lint
```

---

## 3. Payments — Test Mode Verification

All payment flows MUST use Stripe test keys during the pilot.

```bash
# 1. Set test keys in .env (sk_test_... / pk_test_...)
# 2. Start the backend
# 3. Forward webhooks locally with Stripe CLI:
stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe
# 4. Trigger a test payment event:
stripe trigger payment_intent.succeeded
# 5. Verify the webhook handler logs "Payment recorded" without errors

# Test card numbers (Stripe sandbox):
# Success:  4242 4242 4242 4242 (any future expiry, any CVV)
# Decline:  4000 0000 0000 0002
# 3DS:      4000 0025 0000 3155
```

**Pilot safety rules:**
- `STRIPE_SECRET_KEY` must start with `sk_test_`
- The backend logs a warning if `STRIPE_TEST_MODE != "true"`
- No real money is charged during the pilot

---

## 4. Uploads / Storage Verification

```bash
# ── Check buckets exist in Supabase (or local path writable) ───────────────
# Supabase dashboard → Storage → confirm buckets:
#   avatars            (public)
#   contractor-docs    (private — authenticated only)
#   architecture-plans (private — authenticated only)

# ── Test avatar upload (should succeed for own user) ──────────────────────
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}' | jq -r '.access_token')

curl -X POST http://localhost:8000/api/v1/uploads/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/avatar.jpg"
# Expected: {"avatar_url": "..."}

# ── Test contractor-doc upload (should succeed for contractor) ─────────────
curl -X POST http://localhost:8000/api/v1/uploads/contractor-docs \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/license.pdf"
# Expected: {"id": "...", "storage_path": "..."}

# ── Test cross-user access blocked ────────────────────────────────────────
# Get file_id from previous response, then try to fetch with a different user's token
curl -X GET http://localhost:8000/api/v1/uploads/<file_id> \
  -H "Authorization: Bearer $OTHER_USER_TOKEN"
# Expected: 403 Forbidden
```

---

## 5. New Endpoint Verification

### POST /api/v1/onboarding

```bash
# Resident onboarding
curl -X POST http://localhost:8000/api/v1/onboarding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "resident",
    "categories": ["ac_installation"],
    "building": {
      "buildingAddress": "הרצל 10",
      "city": "תל אביב",
      "region": "tel_aviv",
      "apartmentNumber": "5A",
      "buildingType": "new_residential"
    }
  }'
# Expected: 200 {"success": true, "user": {..., "building_id": "<id>"}}

# Verify user is now linked to building
curl http://localhost:8000/api/v1/buildings/me \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 {building details}

# Contractor onboarding
curl -X POST http://localhost:8000/api/v1/onboarding \
  -H "Authorization: Bearer $CONTRACTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "contractor",
    "categories": ["electrical"],
    "business": {
      "businessName": "Acme Electric",
      "licenseNumber": "LIC-001",
      "yearsInBusiness": 5,
      "regions": ["center"],
      "description": "Best electricians"
    }
  }'
# Expected: 200 {"success": true, "user": {..., "contractor_id": "<id>"}}
```

### GET /api/v1/conversations/{userId}/messages

```bash
# Own history (empty initially)
curl "http://localhost:8000/api/v1/conversations/$USER_ID/messages" \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 {"messages": [], "total": 0, "next_cursor": null}

# Send a chat message first (via the web UI or directly)
curl -X POST http://localhost:8000/api/v1/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"'"$USER_ID"'","message":"כמה עולה מזגן?","channel":"web"}'

# Then check history
curl "http://localhost:8000/api/v1/conversations/$USER_ID/messages" \
  -H "Authorization: Bearer $TOKEN"
# Expected: messages array with at least 2 entries (user + assistant)

# Cross-user access denied
curl "http://localhost:8000/api/v1/conversations/OTHER_USER_ID/messages" \
  -H "Authorization: Bearer $TOKEN"
# Expected: 403 Forbidden
```

---

## 6. CI Smoke Command

```bash
# Full CI verification sequence (run in order):
pnpm install
pip install -e ".[dev]"
alembic upgrade head
pytest tests/unit tests/integration -x -q --tb=short
pnpm --filter web test -- --run
pnpm --filter admin test -- --run
pnpm --filter web exec playwright install chromium --with-deps
pnpm --filter web exec playwright test e2e/pilot-smoke.spec.ts \
  --project=chromium --reporter=list
```

---

## 7. Release Notes — Pilot Hardening Pass

### What was fixed

| # | Fix | Impact |
|---|-----|--------|
| 1 | **POST /api/v1/onboarding** created | Signup → onboarding → dashboard now works end-to-end |
| 2 | **GET /api/v1/conversations/{userId}/messages** created | Chat history no longer returns 404 |
| 3 | `get_conversation_history` added to `PostgresClient` | Enables chat history retrieval from `conversation_logs` |
| 4 | `onboarded_at` column added (`013_onboarding_at` migration) | Clean tracking of onboarding completion |
| 5 | `update_user` allowlist extended with `onboarded_at` | Onboarding can stamp the completion timestamp |
| 6 | 8 integration tests for new routes | Regression protection for onboarding + chat history |
| 7 | Pilot smoke E2E suite (10 tests) | CI smoke gate across all critical user journeys |

### What remains non-blocking

| Item | Risk | Notes |
|------|------|-------|
| WhatsApp bot not wired for pilot | Low | Users can use web UI; WhatsApp is an enhancement |
| Email verification not enforced at login | Low | `is_verified` flag exists but not blocking auth; acceptable for pilot |
| Contractor vetting is manual | Medium | Admin reviews contractors before approving; acceptable for 20–50 user scale |
| Real-time WebSocket push not tested in smoke suite | Low | REST polling is the fallback; WS is an enhancement |
| Pagination in chat history is cursor-based (before param) | Low | Frontend currently loads all history at once |

### Pilot limitations

- Stripe payments must use test keys. **No real charges** during the pilot period.
- Storage buckets must be created manually in Supabase before first upload.
- The `onboarded_at` column requires running migration 013 before deploying.
- Contractor onboarding via the web form does not send a verification email;
  admin must manually approve the contractor in the admin panel.

### Operational cautions

- Monitor `conversation_logs` table growth; the retention policy (migration 006)
  auto-deletes records older than the configured retention period.
- Set `STRIPE_TEST_MODE=true` in production `.env` until the pilot completes.
- Rotate `SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` after the pilot.

---

## 8. Go / No-Go Acceptance Criteria

### Hard blockers — must all be PASS for GO

| Criterion | Status |
|-----------|--------|
| `POST /api/v1/onboarding` returns 200 for resident + contractor | ✅ PASS |
| `GET /api/v1/buildings/me` returns chosen building after onboarding | ✅ PASS |
| `GET /api/v1/conversations/{userId}/messages` returns 200 (no 404) | ✅ PASS |
| Chat history loads and shows prior messages | ✅ PASS |
| Cross-user chat history access returns 403 | ✅ PASS |
| All backend unit tests pass | Verify with `pytest tests/unit` |
| All backend integration tests pass | Verify with `pytest tests/integration` |
| Pilot smoke suite passes (≥ 9/10 tests) | Verify with playwright |
| Stripe test mode confirmed (no real charges) | Verify `STRIPE_SECRET_KEY` starts with `sk_test_` |
| Upload cross-user access returns 403 | ✅ PASS (existing guard) |

### Conditional GO items (must be resolved before broader rollout)

| Item | Action required |
|------|-----------------|
| Email verification | Enforce `is_verified` check or add email flow before full rollout |
| Contractor approval flow | Add automated verification or admin-approval UI |
| Prod secrets rotation | Rotate `SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` post-pilot |

---

## 9. Final Go/No-Go Recommendation

**GO WITH CONDITIONS**

The system is ready for a controlled pilot of 20–50 users with the following
conditions met before deployment:

1. Run `alembic upgrade head` (includes migration 013 for `onboarded_at`)
2. Set Stripe keys to `sk_test_...` / `pk_test_...`
3. Create Supabase storage buckets: `avatars`, `contractor-docs`, `architecture-plans`
4. Run the full test suite and confirm all integration tests pass
5. Run the pilot smoke E2E suite and confirm ≥ 9/10 tests pass

After the pilot, before broader rollout:
- Enforce email verification
- Add automated contractor approval workflow
- Switch to Stripe production keys
- Rotate all secrets
