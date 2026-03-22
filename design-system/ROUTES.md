# Groupio Route-by-Route Redesign Plan

> Companion to: `design-system/MASTER.md`
> See also: `design-system/pages/*.md` for detailed screen specs

---

## Priority Legend

| Priority | Meaning | Timeline |
|----------|---------|----------|
| **P0** | Critical — highest impact on trust/conversion | Phase 1 (weeks 1–3) |
| **P1** | High — core experience quality | Phase 2 (weeks 4–6) |
| **P2** | Medium — polish and completeness | Phase 3 (weeks 7–9) |
| **P3** | Low — nice-to-have refinements | Backlog |

---

## Auth Routes

### `/login` — Login Page — P1

**Current**: Email/phone toggle, Zod validation, resend verification on 403

**Problems**:
- No visual branding beyond layout split
- Phone/email toggle is functional but visually plain
- Error messages are generic
- No "remember me" or social login

**Redesign**:
- Left panel: branded illustration + tagline + trust stats
- Right panel: clean form with Groupio logo
- Animated toggle between email/phone
- Clear error messages with recovery guidance
- "?שכחתם סיסמה" link prominent
- "אין לכם חשבון? הירשמו" link
- Social login buttons below (if implemented)
- RTL: form inputs right-aligned, labels above inputs

**Key components**: `AuthLayout` (existing), `LoginForm`, `AuthToggle`
**States**: default, loading, error (invalid), error (unverified → resend link), success (redirect)

---

### `/signup` — Signup Page — P1

**Current**: Role selection, multi-step form, building code optional

**Problems**:
- Role selection (resident/contractor) could be more visual
- Building code field is confusing for new users
- No explanation of what each role means

**Redesign**:
- Step 1: Role selection with large cards (icon + title + description)
  - "אני דייר/ת — אני רוצה לחסוך עם השכנים שלי"
  - "אני קבלן/ית — אני רוצה להציע שירותים לבניינים"
- Step 2: Basic info (name, email, phone, password)
- Step 3: Role-specific info (building code for residents, business info for contractors)
- Progress indicator at top
- "כבר יש לכם חשבון? התחברו" link

**Key components**: `RoleSelectionCards`, `SignupWizard`, `StepIndicator`
**States**: role selection, form input, submitting, success (→ verify email), error

---

### `/verify-email` — Email Verification — P2

**Current**: Token from query, pending/success/error states

**Problems**:
- Pending state just shows spinner
- No guidance on what to do if verification fails

**Redesign**:
- Pending: animated envelope icon + "מאמתים את האימייל שלכם..."
- Success: checkmark + "האימייל אומת בהצלחה!" + auto-redirect in 3s + manual link
- Error: clear message + "שלחו שוב" CTA + support link
- Expired: "הקישור פג תוקף" + resend option

**Key components**: `VerificationStatus`
**States**: pending, success (auto-redirect), error, expired

---

### `/forgot-password` — Forgot Password — P2

**Current**: Email form, generic success to reduce enumeration

**Redesign**: Minor polish only — add branded layout, clear instructions, success illustration

---

### `/reset-password` — Reset Password — P2

**Current**: Token from query, password + confirm

**Redesign**: Minor polish — password strength indicator, match validation inline, success → login redirect

---

### `/resend-verification` — Resend Verification — P3

**Current**: Email form

**Redesign**: Merge into verify-email error state, remove as separate route

---

### `/onboarding` — Post-Signup Onboarding — P1

**Current**: Steps: role → info → preferences, step indicator circles

**Problems**:
- Step indicator is basic circles + connectors
- Address normalization call may confuse users
- Category selection has no visual distinction
- Region selection is text-based

**Redesign**:
- Progress bar at top (not circles)
- Step 1 (Resident): address with autocomplete, building type selection (visual cards)
- Step 1 (Contractor): business details with guided fields
- Step 2: Category preferences with icon chips
- Step 3: Region selection with map or visual area selector
- "דלגו" option on non-critical steps
- Completion: "!הכל מוכן" screen with "המשיכו לדשבורד" CTA

**Key components**: `OnboardingWizard`, `StepProgressBar`, `CategoryChipSelector`, `AddressAutocomplete`

---

## Resident Routes

### `/dashboard` — Resident Dashboard — P0
→ See `design-system/pages/resident-dashboard.md`

### `/offers` — Offers List — P0
→ See `design-system/pages/offers.md`

### `/offers/[offerId]` — Offer Detail — P0
→ See `design-system/pages/offer-detail.md`

### `/checkout` — Checkout — P0
→ See `design-system/pages/checkout.md`

---

### `/contractors` — Contractor Directory — P2

**Current**: ContractorCard components with matching/quote flow

**Problems**:
- Purpose is unclear — browsing or matching?
- No search/filter
- Request quote flow disconnected from offers

**Redesign**:
- Search + category filter
- Contractor cards: photo/logo, name, verified badge, categories, rating, completed jobs
- "צפו בפרופיל" CTA (not "request quote" — quotes come through offers)
- Sort: rating, reviews, completed jobs
- Verified-first default sort

**Key components**: `ContractorCard` (enhanced), `ContractorSearch`, `FilterBar`

---

### `/building` — Building Profile — P2

**Current**: Address, units, residents, active offers, savings, invite code, residents list, building settings

**Problems**:
- Invite code is small and easy to miss
- Residents list has no avatars or engagement indicators
- Building settings are read-only with no explanation
- No building activity feed

**Redesign**:
- Building header: address, city, unit count, resident count, savings total
- Invite section: prominent invite code with one-tap copy + share buttons (WhatsApp, SMS)
- Active offers: compact list with join status
- Neighbors: count + avatars (anonymized if needed)
- Activity: recent joins, new offers
- Settings: contact building manager, building preferences

**Key components**: `BuildingHeader`, `InviteCodeCard`, `NeighborAvatars`, `BuildingActivityFeed`

---

### `/building/join` — Join Building — P2

**Current**: Join by code

**Redesign**: Clean single-input form — enter building code, verify, join. Show building name/address after code entry for confirmation.

---

### `/orders` — Orders List — P1

**Current**: Order list page

**Problems**: Not well differentiated from payments page. Orders need lifecycle context.

**Redesign**:
- Clear order cards: offer title, contractor, status, date, amount
- Status badges: ממתין, בתהליך, הושלם, בוטל
- Filter by status
- Each order → detail page with timeline

**Key components**: `OrderCard`, `OrderStatusBadge`, `OrderFilter`

---

### `/orders/[id]` — Order Detail — P1

**Current**: Order detail page

**Redesign**:
- Order timeline: ordered → paid → scheduled → in progress → completed → reviewed
- Offer summary
- Contractor info
- Payment info
- Actions: cancel (if eligible), contact contractor, leave review

**Key components**: `OrderTimeline`, `OrderSummary`, `OrderActions`

---

### `/payments` — Payment History — P2

**Current**: Stats, escrow explainer, filters, payment list

**Problems**:
- Escrow explainer is informational but not contextual
- Payment → checkout link has URL param bug

**Redesign**:
- Stats: total paid, pending, refunded
- Payment list: clean rows with status, amount, date, offer title
- FIX: change link to use `offerId` parameter
- Escrow badge on escrowed payments with tooltip explanation

**Key components**: `PaymentRow`, `PaymentStats`, `EscrowBadge`

---

### `/profile` — Resident Profile — P2

**Current**: Tabs: Personal, Notifications, Security

**Problems**:
- Notification toggles may not be wired to API
- No avatar display/upload in main view
- Change password is a separate route

**Redesign**:
- Profile header: avatar, name, building, member since
- Tabs: פרטים אישיים | התראות | אבטחה
- Personal: editable fields, building association
- Notifications: grouped toggles (offers, orders, building, system)
- Security: change password inline, 2FA (future), active sessions
- Verify all toggles are wired to API before displaying

**Key components**: `ProfileHeader`, `ProfileForm`, `NotificationToggles`, `SecuritySettings`

---

### `/chat` — AI Chat — P2

**Current**: AIChat component with message list, streaming, suggestions

**Redesign**:
- Full-page chat with sidebar suggestions
- Message bubbles with clear user/bot distinction
- Suggestion chips at bottom
- "Ask about offers", "Help with building", "Payment question" quick topics
- Clear "this is AI" indicator

**Key components**: `AIChat` (existing, enhance), `SuggestionChips`, `ChatMessage`

---

### `/change-password` — Change Password — P3

**Redesign**: Merge into `/profile` security tab. Remove as separate route.

---

### `/architecture` — Architecture Page — P3

**Current**: Architecture/reference page

**Redesign**: Evaluate if this should be in the resident app at all. If it's for developers, move to docs. If it's for users, rename and clarify purpose.

---

## Contractor Routes

### `/contractor/dashboard` — Contractor Dashboard — P1
→ See `design-system/pages/contractor-dashboard.md`

### `/contractor/offers/create` — Create Offer — P1
→ See `design-system/pages/create-offer.md`

---

### `/contractor/offers/active` — Active Offers — P1

**Current**: Filters (status, category, sort), offer cards with analytics

**Problems**:
- Hardcoded Hebrew in `OfferAnalyticsPanel`
- No clear earnings-per-offer view
- No ability to edit/close offers

**Redesign**:
- Tab bar: כל ההצעות | פעילות | ממתינות | הושלמו | טיוטות
- Offer rows: title, status, participants/capacity, revenue, creation date
- Actions per offer: edit, pause, close, view analytics
- Bulk actions: close multiple
- Sort by: date, participants, revenue

**Key components**: `ContractorOfferRow`, `OfferStatusTabs`, `OfferAnalytics`

---

### `/contractor/projects` — Projects List — P1

**Current**: Stats, filters, project cards

**Redesign**:
- Stats: total projects, in progress, completed, total revenue
- Filter: status, year, category
- Project cards: name, building, status, date, participants, revenue
- Calendar view option (future)

**Key components**: `ProjectCard`, `ProjectFilter`, `ProjectStats`

---

### `/contractor/projects/[id]` — Project Detail — P2

**Current**: Title, status, price, participants, description, dates, pricing tiers

**Problems**:
- `requestReview` button is non-functional
- No communication with participants
- No milestone tracking

**Redesign**:
- Project header: title, building, status badge, dates
- Progress: milestone timeline (started → in progress → near completion → completed)
- Participants list (compact)
- Pricing tier reference
- Actions: update status, request review (when functional), contact admin

**Key components**: `ProjectHeader`, `MilestoneTimeline`, `ParticipantsList`

---

### `/contractor/profile` — Contractor Profile — P1

**Current**: Tabs: Info, Documents, Settings

**Problems**:
- `window.location.reload()` after document upload
- Settings toggles not wired to API
- Deactivate button non-functional
- No file validation feedback on uploads

**Redesign**:
- Profile header: business name, logo, trust score, verified status
- Tabs: פרטי עסק | מסמכים | הגדרות
- Business: editable fields, categories, regions, description
- Documents: upload with preview, validation, status (pending/approved/rejected)
- Settings: notification toggles (verify wired), availability toggle, deactivate (with confirmation modal when functional)
- Remove `window.location.reload()` — use optimistic updates

**Key components**: `ContractorProfileHeader`, `DocumentUploadCard`, `ContractorSettingsForm`

---

## Buildings Manager Routes

### `/buildings-manager/dashboard` — BM Dashboard — P2

**Current**: Stats (buildings, residents, active offers, open escalations), building list, escalations

**Redesign**:
- Stats row: buildings, residents, offers, escalations
- My buildings: card per building with quick stats
- Open escalations: priority-sorted list with resolve actions
- Quick: add building, invite residents

**Key components**: `BuildingCard`, `EscalationRow`, `BMStats`

---

### `/buildings-manager/buildings` — Buildings List — P2

**Current**: Buildings list

**Redesign**:
- Search + filter
- Building cards: address, resident count, active offers, savings
- Actions: view details, manage residents, invite

---

### `/buildings-manager/escalations` — Escalations — P2

**Current**: Filters (status, priority), escalation list with resolve

**Redesign**:
- Priority indicators (colored left border)
- Status badges
- Quick resolve actions inline
- Detail expansion or modal

---

## Admin Routes

### `/dashboard` (admin) — Admin Dashboard — P1
→ See `design-system/pages/admin-dashboard.md`

---

### `/users` (admin) — User Management — P2

**Current**: User table with filters, suspend/activate, change role, create admin

**Redesign**:
- Search + role filter + status filter
- User table → card list on mobile
- Actions: view, suspend, activate, change role
- User detail modal: profile info, activity, orders, payments
- Create admin: modal form

---

### `/contractors` (admin) — Contractor Verification — P1

**Current**: Table, bulk actions, detail modal with trust breakdown

**Problems**:
- Trust score is simulated (`getTrustScore`)
- API inconsistency: `request-docs` vs `request-documents`
- Bulk actions need confirmation

**Redesign**:
- Vetting queue: prioritize unverified contractors
- Verification checklist per contractor: license ✓, insurance ✗, certification ✓
- Document viewer: inline preview of uploaded documents
- Actions: approve, request more docs, suspend
- Bulk: approve all verified, suspend all expired
- Fix API endpoint inconsistency

**Key components**: `VettingQueue`, `VerificationChecklist`, `DocumentViewer`

---

### `/payments` (admin) — Payment Management — P1

**Current**: Escrow/payouts tabs, summary cards, escrow flow diagram, tables

**Problems**:
- Override uses `window.prompt()` — needs proper modal
- Platform fee (5%) hardcoded

**Redesign**:
- Tab structure: נאמנות (escrow) | תשלומים לקבלנים | סיכום
- Summary cards: total held, total released, total pending, platform revenue
- Escrow table: offer, amount, status, contractor, actions (release, hold, review)
- Payouts table: contractor, amount, status, date, actions
- Replace `window.prompt()` with proper modal for overrides
- Move platform fee to settings config

**Key components**: `EscrowTable`, `PayoutsTable`, `PaymentActionModal`, `EscrowFlowDiagram`

---

### `/offers` (admin) — Offer Management — P2

**Current**: Table with filters, approve/cancel/flag, CSV export

**Redesign**:
- Queue view: pending approval at top
- Table: title, contractor, status, participants, created, actions
- Actions: approve, flag for review, cancel
- Offer preview modal
- Export CSV retained

---

### `/escalations` (admin) — Escalation Management — P1

**Current**: Stats, filters, EscalationsTable

**Redesign**:
- Priority sorting: urgent → high → normal → low
- Color-coded priority sidebar
- Assignment view: who owns what
- Resolution flow: inline response + status change
- SLA indicators: time since creation, expected response time

**Key components**: `EscalationsTable` (existing, enhance), `PriorityIndicator`, `SLABadge`

---

### `/agents` (admin) — Agent Management — P2

**Current**: Agent cards, config toggles, performance chart, orchestration graph, pending decisions, activity log

**Redesign**:
- Agent health dashboard: status grid with performance metrics
- Configuration panel: threshold, temperature, toggle per agent
- Performance: response time trend, error rate trend (recharts)
- Orchestration: simplified flow diagram
- Activity: filterable event log

---

### `/analytics` (admin) — Analytics — P2

**Current**: Date range, metrics, category/regional breakdown, agent performance, insights

**Redesign**:
- Date range selector (predefined: 7d, 30d, 90d, custom)
- KPI cards: revenue, offers, users, conversion, NPS
- Charts: revenue trend, offers by category, users by region
- Insights: auto-generated key findings
- Export options

---

### `/settings` (admin) — Settings — P2

**Current**: Tabs: General, Notifications, Agents, Security

**Redesign**:
- Clean tab navigation
- General: platform name, support email, language, timezone
- Notifications: system notification rules
- Agents: AI configuration, confidence thresholds
- Security: rate limits, JWT config, CORS, 2FA enforcement
- Add: Payments tab (platform fee, escrow rules)

---

### `/settings/audit-logs` (admin) — Audit Logs — P3

**Redesign**: Table with search, filter by action type, user, date range. Expandable rows for details.

---

## Static Routes

### `/terms` — Terms of Service — P3

**Redesign**: Clean typography, table of contents, last-updated date, printable layout.

### `/privacy` — Privacy Policy — P3

**Redesign**: Same as terms — clean readable layout.
