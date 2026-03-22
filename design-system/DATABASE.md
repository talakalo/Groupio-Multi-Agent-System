# Groupio Database Schema — Design Reference

> Companion to: `design-system/MASTER.md`, `design-system/AGENTS.md`
> Backend reference: `src/models/`, `src/databases/postgres.py`, `alembic/versions/`

---

## 1. Database Overview

| Property | Value |
|----------|-------|
| Database | PostgreSQL (Supabase or local) |
| ORM | None — raw SQL via `asyncpg` + Supabase PostgREST |
| Models | Pydantic (serialization/validation only, not ORM) |
| Migrations | Alembic (21 versions) |
| Connection pool | asyncpg: min 5, max 25, 300s idle timeout, 60s command timeout |
| Storage | Supabase Storage or local filesystem (via `StorageService`) |

---

## 2. Entity Relationship Map

```
users ─────────────┬───── building_residents ────── buildings
  │                │              │
  │                │              │
  ├── contractors  │              ├── offers
  │    │           │              │    │
  │    ├── contractor_reviews     │    ├── offer_participants
  │    ├── contractor_verification│    ├── pricing_tiers (JSONB)
  │    │   _metadata              │    └── matched_contractor_id → contractors
  │    │                          │
  │    └── file_uploads           ├── invitations
  │                               │
  ├── payments ──── invoices ─────┘
  │    └── payment_splits
  │    └── payment_methods
  │
  ├── escalations ── escalation_messages
  │
  ├── chat_messages / conversation_logs
  │
  ├── audit_logs / agent_audit_log
  │
  ├── pending_agent_decisions
  │
  ├── outreach_queue
  │
  └── credit_awards
```

---

## 3. Core Tables — UI Data Mapping

### `users`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Internal reference |
| `email` | text, unique | Login, profile display |
| `full_name` | text | Dashboard greeting, profile, chat |
| `phone` | text | Profile, contractor contact |
| `role` | text | Role-based routing: `resident`, `contractor`, `admin`, `buildings_manager`, `super_admin` |
| `preferred_language` | text | UI language (he/en) |
| `is_active` | boolean | Account status |
| `is_verified` | boolean | Email verification — drives "unverified" banner |
| `avatar_url` | text | Profile photo |
| `building_id` | FK → buildings | Building association — drives dashboard building context |
| `contractor_id` | FK → contractors | Contractor profile link |
| `last_login` | timestamp | Admin user management |
| `onboarded_at` | timestamp | Drives onboarding completion check |
| `push_token` | text | Push notification delivery |
| `totp_secret` | text | 2FA (future) |
| `created_at` | timestamp | "Member since" display |

**UI surfaces**: Profile page, dashboard greeting, admin user management, navigation role routing, email verification banner.

**Design note**: `onboarded_at` being null = show onboarding completion prompt on dashboard.

---

### `buildings`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Internal reference |
| `name` | text | Building display name |
| `address` | text | Building profile, dashboard |
| `city` | text | Location context, region filtering |
| `region` | text | Offer matching, regional analytics |
| `total_units` | int | Building stats |
| `floors` | int | Building profile |
| `year_built` | int | Building profile |
| `resident_count` | int | Dashboard "X שכנים", invite motivation |
| `active_offers` | int | Dashboard "X הצעות פעילות" |
| `completed_offers` | int | Building profile stats |
| `total_savings` | numeric | Dashboard "₪X,XXX חיסכון", landing social proof |
| `whatsapp_group_id` | text | WhatsApp integration |
| `municipality_code` / `municipality_name` | text | Enrichment data |
| `address_normalized` | text | Standardized address |
| `enrichment_confidence` | float | Data quality indicator |

**UI surfaces**: Building profile page, resident dashboard (building context), building manager pages, offer matching, landing page stats.

**Design note**: `total_savings` is the primary value metric — display prominently on dashboards and landing page.

---

### `building_residents`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | — |
| `user_id` | FK → users | Resident identity |
| `building_id` | FK → buildings | Building membership |
| `unit_number` | text | Apartment identification |
| `floor` | int | Building context |
| `is_owner` | boolean | Ownership status |
| `joined_at` | timestamp | "Member since" in building |

**Unique constraint**: `(building_id, unit_number)` — one resident per apartment.

**UI surfaces**: Building page residents list, building manager resident management.

---

### `contractors`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Internal reference |
| `user_id` | FK → users | Linked user account |
| `business_name` | text | Contractor display name everywhere |
| `contact_name` | text | Contractor profile |
| `email` / `phone` | text | Contact info |
| `description` | text | Contractor profile bio |
| `categories` | text[] | Service categories (filtering, matching) |
| `regions` | text[] | Service regions (matching, filtering) |
| `years_experience` | int | Trust factor, profile display |
| `employee_count` | int | Business size indicator |
| `website` | text | Profile link |
| `verification_status` | text | `pending`, `verified`, `rejected`, `suspended` — drives badge + access |
| `trust_score` | float | 0–100, drives ranking + auto-approval |
| `trust_score_breakdown` | JSONB | Per-dimension scores (license, insurance, experience, reputation, completion, response) |
| `license_number` | text | Verification display |
| `license_verified` | boolean | ✓ in trust badge |
| `insurance_expiry` | date | Verification check |
| `insurance_verified` | boolean | ✓ in trust badge |
| `certifications` | text[] | Additional credentials |
| `average_rating` | float | Star rating display |
| `total_reviews` | int | Review count |
| `completed_projects` | int | Track record metric |
| `response_rate` | float | Responsiveness metric |
| `average_response_time_hours` | float | Responsiveness metric |

**UI surfaces**: Contractor profile, ContractorTrustBadge, offer detail (matched contractor), admin vetting queue, contractor directory.

**Design note**: `trust_score_breakdown` JSONB contains weights: license_valid (25), insurance_valid (20), years_in_business (15), online_reputation_score (15), completion_rate (15), response_rate (10). This maps directly to the TrustScoreBreakdown component.

---

### `offers`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Offer detail route param |
| `title` | text | Card title, detail title |
| `description` | text | Offer detail body |
| `category` | text (ServiceCategory enum) | Category badge, filtering |
| `base_price` | numeric | Original price (strikethrough) |
| `min_participants` | int | Minimum to activate |
| `max_participants` | int | Capacity — drives "X spots left" |
| `deadline` | timestamp | "Ends in X days" display |
| `building_id` | FK → buildings | Building-specific offer matching |
| `created_by` | FK → users | Contractor who created |
| `status` | text | `draft`, `pending`, `active`, `completed`, `cancelled`, `expired` |
| `current_participants` | int | Progress bar, "X הצטרפו" |
| `matched_contractor_id` | FK → contractors | Assigned contractor |
| `pricing_tiers` | JSONB | Array of `{min_participants, price_per_unit, label}` |
| `pricing_rationale` | text | Agent-generated pricing explanation |

**UI surfaces**: OfferCard, offer detail, offers list, dashboard, contractor offers, admin offers management.

**Design note**: `pricing_tiers` is JSONB — PricingTiers component reads this directly. `current_participants / max_participants` drives the progress bar. `base_price` vs current tier price drives savings % calculation.

**Calculated UI fields**:
- Savings % = `(base_price - current_tier_price) / base_price * 100`
- Spots remaining = `max_participants - current_participants`
- Urgency = spots remaining < 20% of max
- Current tier = highest tier where `current_participants >= min_participants`

---

### `offer_participants`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | — |
| `offer_id` | FK → offers | Which offer |
| `user_id` | FK → users | Which resident |
| `unit_count` | int | How many units (usually 1) |
| `joined_at` | timestamp | "הצטרפו לפני X" display |

**Unique constraint**: `(offer_id, user_id)` — one join per user per offer.

**UI surfaces**: Offer detail participants, "already joined" state, building page active offers.

**Design note**: This is the "order" entity. No separate orders table exists — orders are `offer_participants` + their corresponding `invoices` + `payments`.

---

### `invoices`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Invoice reference |
| `offer_id` | FK → offers | Which offer |
| `contractor_id` | FK → contractors | Payee |
| `invoice_number` | text | Display reference |
| `type` | text | Invoice type (collection, payout) |
| `status` | text | Draft, issued, paid, cancelled |
| `subtotal` | numeric | Price before tax |
| `tax_rate` | numeric | VAT rate (17%) |
| `tax_amount` | numeric | VAT amount |
| `total` | numeric | Final amount |
| `platform_fee` | numeric | Groupio's cut |
| `currency` | text | ILS |
| `due_date` | date | Payment deadline |
| `paid_at` | timestamp | When paid |
| `pdf_path` | text | Invoice PDF download |

**UI surfaces**: Checkout (price breakdown), payment history, order detail, admin payments.

---

### `payments`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Payment reference |
| `invoice_id` | FK → invoices | Linked invoice |
| `user_id` | FK → users | Who paid |
| `amount` | numeric | Payment amount |
| `currency` | text | ILS |
| `status` | text | `pending`, `succeeded`, `failed`, `refunded`, `escrowed` |
| `provider` | text | `stripe`, `mock` |
| `provider_transaction_id` | text | Stripe payment intent ID |
| `payment_method_id` | FK → payment_methods | Card used |

**UI surfaces**: Payment history, checkout result, order detail, admin payments page.

**Design note**: `status = escrowed` means money is held — show escrow badge. `status = succeeded` means released to contractor.

---

### `payment_splits`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | — |
| `payment_id` | FK → payments | Parent payment |
| `participant_user_id` | FK → users | Payer |
| `amount` | numeric | Individual share |
| `status` | text | Split status |

**UI surfaces**: Admin payment detail (split view per participant).

---

### `escalations`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Escalation reference |
| `user_id` | FK → users | Who escalated |
| `conversation_id` | text | Originating conversation |
| `source_agent` | text | Which agent escalated |
| `reason` | text | Escalation reason category |
| `priority` | text | `urgent`, `high`, `normal`, `low` |
| `summary` | text | Agent-generated summary |
| `status` | text | `open`, `assigned`, `in_progress`, `resolved`, `closed` |
| `assigned_to` | FK → users | Admin handling it |
| `context` | JSONB | Conversation context snapshot |
| `agent_reasoning` | text | Why the agent escalated |
| `resolution_notes` | text | How it was resolved |

**UI surfaces**: Admin escalations page, BM escalations, dashboard attention bar, agent audit.

**Design note**: `priority` drives color-coding: urgent=red, high=orange, normal=blue, low=gray. `agent_reasoning` should be visible in admin UI.

---

### `agent_audit_log`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | — |
| `session_id` | text | Conversation session |
| `user_id` | FK → users | Triggering user |
| `agent_name` | text | Which agent |
| `action` | text | What it did |
| `input_summary` | text | Input context |
| `output_summary` | text | Agent response |
| `model_used` | text | LLM model |
| `tokens_used` | int | Token consumption |
| `latency_ms` | int | Response time |
| `confidence_score` | float | Agent confidence |
| `requires_human_review` | boolean | Flagged for review |
| `reasoning_chain` | JSONB | Full reasoning steps |
| `cited_sources` | JSONB | RAG sources used |
| `alternatives_considered` | JSONB | Other options evaluated |

**UI surfaces**: Admin agent activity log, agent metrics, audit trail.

---

### `pending_agent_decisions`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | Decision reference |
| `agent_name` | text | Which agent |
| `conversation_id` | text | Context |
| `user_id` | FK → users | Affected user |
| `action_type` | text | What decision |
| `payload` | JSONB | Decision details |
| `escalation_reason` | text | Why it needs approval |
| `status` | text | `pending`, `approved`, `rejected` |
| `decided_by` | FK → users | Admin who decided |
| `decision_note` | text | Admin's note |
| `decided_at` | timestamp | When decided |

**UI surfaces**: Admin pending decisions queue, agent cards (pending count badge).

---

### `file_uploads`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | File reference |
| `user_id` | FK → users | Uploader |
| `bucket` | text | `contractor-docs`, `architecture`, `avatars` |
| `file_name` | text | Display name |
| `file_type` | text | MIME type |
| `file_size` | int | Size display |
| `storage_path` | text | Download URL |
| `thumbnail_path` | text | Preview |
| `analysis_status` | text | AI processing status |
| `analysis_result` | JSONB | AI analysis output |
| `building_id` | FK → buildings | Associated building |

**UI surfaces**: Contractor profile (document cards), avatar upload, architecture analysis, admin document viewer.

---

### `outreach_queue`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | — |
| `user_id` | FK → users | Recipient |
| `campaign_type` | text | welcome, momentum, reactivation, seasonal, viral |
| `message` | text | Message content |
| `variant` | text | A/B test variant |
| `status` | text | pending, approved, sent, rejected |
| `approved_by` | FK → users | Admin who approved |

**UI surfaces**: Admin outreach approval queue (when outreach mode = gated).

---

### `credit_awards`

| Column | Type | UI Usage |
|--------|------|----------|
| `id` | UUID PK | — |
| `resident_id` | FK → users | Recipient |
| `amount` | numeric | ₪ amount (typically ₪500) |
| `reason` | text | Why awarded |
| `status` | text | pending, approved, rejected |
| `approved_by` | FK → users | Admin who approved |

**UI surfaces**: Admin influencer approval, resident notification of credit.

---

### Other Tables

| Table | Purpose | UI Surface |
|-------|---------|------------|
| `contractor_reviews` | Ratings + comments | Contractor profile, offer detail |
| `chat_messages` | Conversation messages | AI Chat |
| `chat_messages_archive` | Archived messages | None (backend retention) |
| `conversation_logs` | Full conversation logs | Admin audit |
| `escalation_messages` | Escalation thread messages | Admin escalation detail |
| `payment_methods` | Saved cards | Profile, checkout |
| `audit_logs` | System audit trail | Admin audit logs page |
| `system_settings` | Platform configuration | Admin settings page |
| `agent_metrics` | Time-series agent metrics | Admin agent charts |
| `invitations` | Building invitations | Building invite flow |

---

## 4. Data → UI Component Mapping

| Data Entity | Primary UI Component | Where Used |
|-------------|---------------------|------------|
| `users` | ProfileHeader, DashboardGreeting | Profile, Dashboard |
| `buildings` | BuildingSummaryCard | Dashboard, Building page |
| `building_residents` | NeighborAvatars, ResidentList | Building page |
| `contractors` | ContractorTrustBadge, ContractorCard | Offers, Contractors, Profile |
| `offers` | OfferCard, PricingTiers | Offers list, Detail, Dashboard |
| `offer_participants` | Progress bar, "X joined" badge | OfferCard, Detail |
| `invoices` | PriceBreakdown | Checkout, Orders |
| `payments` | PaymentRow, EscrowBadge | Payments, Checkout, Orders |
| `escalations` | EscalationsTable, EscalationCard | Admin, BM dashboard |
| `agent_audit_log` | AgentActivityLog | Admin agents page |
| `pending_agent_decisions` | PendingDecisionCard | Admin agents page |
| `file_uploads` | DocumentUploadCard | Contractor profile, Admin vetting |
| `outreach_queue` | CampaignPreviewCard | Admin outreach queue |
| `credit_awards` | CreditAwardCard | Admin influencer queue |

---

## 5. Missing Data Models (UI Impact)

These are data concepts the UI needs but that **don't have dedicated tables**:

| Concept | Current State | UI Impact | Recommendation |
|---------|--------------|-----------|----------------|
| **Orders** | No orders table; modeled as offer_participants + invoices | "My Orders" page reads from participants + payments — fragile | Consider adding an `orders` table or create a database view joining participants + invoices + payments |
| **Notifications** | No table; push_token on users, sent via services | No notification history, no in-app notification center | Consider adding `notifications` table for in-app notification persistence |
| **Contractor documents** | Referenced in Supabase code but no migration; uses `file_uploads` | Admin document viewer reads from file_uploads with bucket filter | Acceptable — document the bucket convention |
| **User preferences** | `UserNotificationSettings` is Pydantic only, not persisted | Notification toggles in profile don't actually save | Add notification_settings JSONB column to users or create settings table |
| **Saved/favorited offers** | No mechanism | No wishlist/saved offers feature | Consider adding if offer discovery is a priority |
| **Building invite codes** | No explicit table | Building join by code exists in UI but code storage unclear | Verify invite code generation/storage mechanism |

---

## 6. API ↔ UI Route Mapping

| UI Route | Primary API Endpoints | Data Tables |
|----------|----------------------|-------------|
| `/dashboard` | `GET /auth/me`, `GET /buildings/me`, `GET /offers`, `GET /payments/my` | users, buildings, offers, payments |
| `/offers` | `GET /offers` | offers, contractors, offer_participants |
| `/offers/[id]` | `GET /offers/{id}`, `GET /offers/{id}/participants` | offers, offer_participants, contractors |
| `/checkout` | `POST /payments/initiate`, `POST /payments/webhook/stripe` | invoices, payments, payment_splits |
| `/orders` | `GET /payments/my` | payments, invoices, offers |
| `/building` | `GET /buildings/me`, `GET /buildings/{id}/residents`, `GET /buildings/{id}/offers` | buildings, building_residents, offers |
| `/contractors` | `GET /contractors`, `POST /contractors/search` | contractors |
| `/profile` | `GET /auth/me`, `PUT /auth/me` | users |
| `/payments` | `GET /payments/my` | payments, invoices |
| `/chat` | `POST /message`, `GET /conversations/{id}/messages` | chat_messages |
| `/contractor/dashboard` | `GET /auth/me`, `GET /contractors/me`, `GET /offers` | users, contractors, offers |
| `/contractor/offers/create` | `POST /offers` | offers |
| `/contractor/profile` | `GET /contractors/{id}`, `PUT /contractors/{id}`, `POST /uploads/contractor-docs` | contractors, file_uploads |
| Admin `/dashboard` | `GET /admin/status`, `GET /admin/metrics`, `GET /escalations/stats` | agent_metrics, escalations |
| Admin `/contractors` | `GET /contractors`, admin vetting endpoints | contractors, contractor_verification_metadata |
| Admin `/payments` | `GET /admin/payments/summary`, escrow + payout endpoints | payments, invoices, payment_splits |
| Admin `/agents` | `GET /agents`, `GET /admin/agents/pending-decisions`, `GET /admin/agents/audit` | agent_audit_log, pending_agent_decisions |
| Admin `/escalations` | `GET /escalations`, `POST /escalations/filter` | escalations, escalation_messages |
