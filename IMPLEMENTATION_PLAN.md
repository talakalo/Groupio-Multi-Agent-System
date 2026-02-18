# Implementation Plan: Architecture Upload, Admin Completion, Payments & Agent Management

## Overview

Three major feature areas to build, prioritized by impact and dependency order:

1. **Architecture/Floor Plan Upload & AI Analysis** (New Feature)
2. **Admin Dashboard Completion** (Missing pages + wire stubs)
3. **Payment & Financial System** (New Feature)

All managed primarily by agents with admin supervision.

---

## Phase 1: Infrastructure Foundation

### 1.1 File Upload Infrastructure (Backend)

**Files to create/modify:**

- `src/config/settings.py` - Add storage settings (UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_FORMATS)
- `src/api/routes/uploads.py` - New route: `POST /uploads` (multipart/form-data)
- `src/services/storage.py` - New: local file storage service (save, get, delete)
- `src/api/routes/__init__.py` - Register uploads router

**Storage approach:** Local filesystem (`/uploads/`) with metadata in PostgreSQL. Can migrate to S3/Supabase Storage later.

**Dependencies to add:** `python-multipart` (for FastAPI UploadFile), `Pillow` (image validation)

### 1.2 Claude Vision Integration (Backend)

**Files to modify:**

- `src/utils/llm_client.py` - Add `analyze_image()` method supporting Claude's vision API (image content blocks)

Claude's API already supports multimodal - we just need to pass `image` content blocks:
```python
async def analyze_image(self, image_base64: str, media_type: str, prompt: str) -> dict:
    response = await self._client.messages.create(
        model=self._model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_base64}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
```

### 1.3 Database Migrations

**New migration file:** `alembic/versions/002_uploads_payments.py`

**New tables:**
- `uploads` - id, user_id, file_path, file_type, file_size, original_name, analysis_result (JSONB), created_at
- `architecture_analyses` - id, upload_id, user_id, building_id, room_analysis (JSONB), suggested_categories, suggested_offers (JSONB), status, created_at
- `payments` - id, offer_id, user_id, amount, currency, status, payment_method, provider_ref, created_at, updated_at
- `invoices` - id, payment_id, offer_id, user_id, invoice_number, amount, tax_amount, total, status, issued_at, due_at, paid_at
- `platform_fees` - id, offer_id, fee_amount, fee_percentage, status, created_at
- `audit_logs` - id, admin_id, action, entity_type, entity_id, details (JSONB), ip_address, created_at

---

## Phase 2: Architecture Upload & AI Analysis Feature

### 2.1 Architecture Analysis Agent (New Agent)

**New file:** `src/agents/architecture.py`

**What it does:**
1. Receives uploaded floor plan image (JPEG/PNG/PDF)
2. Uses Claude Vision to analyze the image and extract:
   - Room types and counts (kitchen, bathroom, living room, bedroom, etc.)
   - Approximate room dimensions
   - Current state assessment (if renovation photos)
   - Infrastructure visible (plumbing, electrical, HVAC locations)
3. Maps rooms to relevant service categories:
   - Kitchen detected → `kitchen` category
   - Multiple rooms → `renovations` category
   - HVAC system visible → `ac_installation` / `ac_maintenance`
   - Bathroom → `plumbing`
   - Electrical panel → `electrical`
4. Queries existing offers in the user's building for matching categories
5. Finds matching contractors via the Matching Agent
6. Returns personalized suggestions in Hebrew

**Integration with existing agents:**
- Calls `MatchingAgent` for contractor recommendations
- Calls `PricingAgent` for cost estimates per room/category
- Results stored in `architecture_analyses` table

### 2.2 Router Agent Update

**File to modify:** `src/agents/router.py`

- Add new intent: `"architecture_analysis"` → routes to Architecture Agent
- Add intent: `"renovation_planning"` → routes to Architecture Agent

### 2.3 Backend Routes

**New file:** `src/api/routes/architecture.py`

**Endpoints:**
- `POST /architecture/analyze` - Upload floor plan + get AI analysis
- `GET /architecture/{analysis_id}` - Get analysis results
- `GET /architecture/user/{user_id}` - List user's analyses
- `POST /architecture/{analysis_id}/suggest-offers` - Get offer suggestions based on analysis

### 2.4 Frontend - Upload Component

**Files to create:**
- `apps/web/components/architecture/UploadFloorPlan.tsx` - Drag & drop upload with preview
- `apps/web/components/architecture/AnalysisResults.tsx` - Display room analysis + suggestions
- `apps/web/app/(resident)/architecture/page.tsx` - Architecture analysis page

**Flow:**
1. User uploads floor plan image
2. Shows loading state with progress
3. Displays room-by-room analysis
4. Shows matching offers in the building
5. Shows recommended contractors per category
6. "Join offer" / "Request quote" CTAs

### 2.5 PostgresClient Methods

**File to modify:** `src/databases/postgres.py`

Add methods: `create_upload`, `get_upload`, `create_architecture_analysis`, `get_architecture_analysis`, `list_user_analyses`

---

## Phase 3: Admin Dashboard Completion

### 3.1 User Management Page

**New file:** `apps/admin/app/users/page.tsx`

**Features:**
- User list with search, filter by role (resident/contractor/admin)
- User detail view (profile, building, offer history)
- Suspend/activate user
- Create new admin user
- View user's conversation history

**Backend routes needed:**
- `GET /admin/users` - List users with filters
- `GET /admin/users/{id}` - User detail
- `PUT /admin/users/{id}/suspend` - Suspend user
- `PUT /admin/users/{id}/activate` - Activate user
- `POST /admin/users/create-admin` - Create admin

### 3.2 Offer Management Page

**New file:** `apps/admin/app/offers/page.tsx`

**Features:**
- Offer list with filters (status, category, building, flagged)
- Offer detail view (participants, pricing tiers, matched contractor)
- Approve/reject flagged offers
- Cancel offers
- View offer payment status (Phase 4)

**Backend routes needed:**
- `GET /admin/offers` - List all offers with admin filters
- `GET /admin/offers/{id}` - Offer detail with participants
- `POST /admin/offers/{id}/approve` - Approve flagged offer
- `POST /admin/offers/{id}/cancel` - Cancel offer
- `GET /admin/offers/flagged` - List flagged offers

### 3.3 System Settings Page

**New file:** `apps/admin/app/settings/page.tsx`

**Features:**
- General settings (site name, support email, default language)
- Notification settings (email, WhatsApp, push toggles)
- Agent settings (escalation threshold, sentiment threshold, confidence threshold)
- Security settings (session timeout, max login attempts, 2FA toggle)

**Backend routes needed:**
- `GET /admin/settings` - Get all settings
- `PUT /admin/settings/{section}` - Update settings section

### 3.4 Audit Log Page

**New file:** `apps/admin/app/settings/audit-logs/page.tsx`

**Features:**
- Chronological log of all admin actions
- Filter by action type, admin user, date range
- Export to CSV

**Backend routes needed:**
- `GET /admin/audit-logs` - List audit logs with filters

### 3.5 Wire Up Stub Actions (Existing Pages)

**Contractors page** (`apps/admin/app/contractors/page.tsx`):
- Wire "Approve" button → `POST /contractors/{id}/verify`
- Wire "Suspend" button → `PUT /contractors/{id}/suspend` (new endpoint)
- Wire "Request Docs" button → `POST /contractors/{id}/request-documents` (new endpoint)

**Escalations page** (`apps/admin/app/escalations/page.tsx`):
- Wire "Reassign" → `POST /escalations/{id}/assign` (exists)
- Wire "Escalate" → `POST /escalations/{id}/reopen` with priority bump

### 3.6 Fix Admin Analytics Backend

**File to modify:** `src/api/routes/admin.py`

- Remove duplicate `/admin/analytics` endpoint
- Calculate real GMV from `completed_offers` table
- Calculate real active offers count
- Calculate real pending verifications count

### 3.7 Navigation Update

**File to modify:** `apps/admin/app/layout.tsx`

- Add "Users" nav item → `/admin/users`
- Add "Offers" nav item → `/admin/offers`
- Add "Settings" nav item → `/admin/settings`

---

## Phase 4: Payment & Financial System

### 4.1 Payment Agent (New Agent)

**New file:** `src/agents/payment.py`

**What it does:**
1. Manages payment lifecycle for completed offers
2. Calculates per-participant cost (offer price / participants)
3. Generates payment links/invoices
4. Tracks payment status per participant
5. Handles refund requests (routes to support if complex)
6. Calculates platform commission (configurable %)
7. Provides payment status updates via chat

**Integration:**
- Triggered when offer status → `matched` or `in_progress`
- Updates offer payment status
- Notifies participants via Support/Outreach agents

### 4.2 Payment Models

**New file:** `src/models/payment.py`

```python
class PaymentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"

class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
```

### 4.3 Payment Routes

**New file:** `src/api/routes/payments.py`

**Endpoints:**
- `POST /payments/initiate` - Initiate payment for offer participant
- `GET /payments/{id}` - Get payment status
- `GET /payments/offer/{offer_id}` - List payments for offer
- `GET /payments/user/{user_id}` - List user's payments
- `POST /payments/{id}/refund` - Request refund
- `GET /invoices/{id}` - Get invoice
- `GET /invoices/offer/{offer_id}` - List invoices for offer
- `POST /invoices/{id}/send` - Email invoice to user

### 4.4 Admin Payment Dashboard

**New file:** `apps/admin/app/payments/page.tsx`

**Features:**
- Payment overview (total GMV, pending, completed, refunded)
- Payment list with filters
- Invoice generation and management
- Refund approval workflow
- Platform fee tracking

### 4.5 Router Agent Update

Add intents: `"payment_query"`, `"invoice_request"`, `"refund_request"` → routes to Payment Agent

### 4.6 Frontend Payment UI

**Files to create:**
- `apps/web/app/(resident)/payments/page.tsx` - User's payment history
- `apps/web/components/payments/PaymentCard.tsx` - Payment status card
- `apps/web/components/payments/InvoiceView.tsx` - Invoice display

---

## Implementation Priority Order

| Step | What | Effort | Impact |
|------|------|--------|--------|
| 1 | File upload infrastructure + Claude Vision | Medium | Enables Phase 2 |
| 2 | Architecture Analysis Agent + routes | High | New user-facing feature |
| 3 | Frontend upload + analysis UI | Medium | Completes the feature |
| 4 | Admin: wire stub actions | Low | Quick wins |
| 5 | Admin: fix analytics backend | Low | Real data in dashboard |
| 6 | Admin: user management page | Medium | Core admin need |
| 7 | Admin: offer management page | Medium | Core admin need |
| 8 | Admin: settings + audit logs | Medium | Governance |
| 9 | Payment models + DB migration | Medium | Enables Phase 4 |
| 10 | Payment Agent + routes | High | Financial operations |
| 11 | Admin payment dashboard | Medium | Financial oversight |
| 12 | Frontend payment UI | Medium | User-facing payments |

---

## Files Changed/Created Summary

**New files (backend):**
- `src/agents/architecture.py`
- `src/agents/payment.py`
- `src/services/storage.py`
- `src/api/routes/uploads.py`
- `src/api/routes/architecture.py`
- `src/api/routes/payments.py`
- `src/models/payment.py`
- `alembic/versions/002_uploads_payments.py`

**New files (frontend):**
- `apps/web/components/architecture/UploadFloorPlan.tsx`
- `apps/web/components/architecture/AnalysisResults.tsx`
- `apps/web/app/(resident)/architecture/page.tsx`
- `apps/web/components/payments/PaymentCard.tsx`
- `apps/web/components/payments/InvoiceView.tsx`
- `apps/web/app/(resident)/payments/page.tsx`
- `apps/admin/app/users/page.tsx`
- `apps/admin/app/offers/page.tsx`
- `apps/admin/app/settings/page.tsx`
- `apps/admin/app/settings/audit-logs/page.tsx`
- `apps/admin/app/payments/page.tsx`

**Modified files:**
- `src/utils/llm_client.py` (add vision)
- `src/agents/router.py` (new intents)
- `src/databases/postgres.py` (new methods)
- `src/api/routes/admin.py` (fix analytics, add user/offer admin routes)
- `src/api/routes/__init__.py` (register new routers)
- `src/config/settings.py` (storage + payment settings)
- `apps/admin/app/layout.tsx` (navigation)
- `apps/admin/lib/hooks.ts` (new hooks)
- `apps/admin/app/contractors/page.tsx` (wire actions)
- `apps/admin/app/escalations/page.tsx` (wire actions)
- `packages/types/src/index.ts` (new types)
- `packages/api-client/src/client.ts` (new methods)
- `pyproject.toml` (new dependencies)
