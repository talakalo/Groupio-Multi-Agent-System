# Groupio Component Library Map

> Companion to: `design-system/MASTER.md`
> Implementation target: `apps/web/components/` and `apps/admin/components/`

---

## Architecture Decision

Currently `packages/ui` has a full component library (Button, Input, Modal, etc.) built with CVA but **not connected to any app**. Web and admin apps use Tailwind + globals.css classes instead.

**Recommendation**: Wire `packages/ui` into web and admin apps OR migrate the CVA-based components into each app's component directory. Given the apps have diverged significantly, the pragmatic choice is:

1. Create a shared `components/ui/` directory in each app with consistent implementations
2. Use the token values from `packages/ui/src/tokens.ts` as the authoritative source
3. Keep `packages/ui` as the Storybook reference but don't force import dependency

---

## Component Inventory

### Shared Foundation Components

#### `Button`
- **Purpose**: All interactive actions
- **Variants**: primary, secondary, accent, ghost, danger, outline
- **Sizes**: sm (32px), md (40px), lg (48px)
- **States**: default, hover, active, disabled, loading
- **Usage**: Every page
- **Accessibility**: `aria-disabled` when disabled, `aria-busy` when loading, visible focus ring
- **File**: `components/ui/Button.tsx`

#### `Input`
- **Purpose**: Text input fields
- **Variants**: default, error, success
- **Sizes**: sm, md, lg
- **Props**: label, error message, hint text, left/right icon, RTL-aware
- **States**: default, hover, focus, error, disabled
- **Usage**: All forms
- **Accessibility**: Associated label, `aria-describedby` for errors, `aria-invalid` for error state
- **File**: `components/ui/Input.tsx`

#### `Select`
- **Purpose**: Dropdown selection
- **Variants**: default, error
- **Props**: options, placeholder, multi-select option
- **States**: default, hover, focus, error, disabled, open
- **Usage**: Forms, filters
- **File**: `components/ui/Select.tsx`

#### `Textarea`
- **Purpose**: Multi-line text input
- **Variants**: default, error
- **Props**: label, error, hint, max chars, auto-resize
- **States**: default, hover, focus, error, disabled
- **Usage**: Offer description, profile bio, escalation response
- **File**: `components/ui/Textarea.tsx`

#### `Badge`
- **Purpose**: Status indicators, labels, counts
- **Variants**: default (gray), primary, success, warning, error, accent
- **Sizes**: sm, md
- **Props**: label, icon (optional), dismissible (optional)
- **Usage**: Everywhere — status labels, counts, categories
- **Accessibility**: `role="status"` for dynamic badges
- **File**: `components/ui/Badge.tsx`

#### `Modal`
- **Purpose**: Overlaid dialogs for confirmations, forms, details
- **Variants**: sm (400px), md (520px), lg (680px), full (mobile sheet)
- **Parts**: Header, Body, Footer
- **States**: open, closing (animation)
- **Usage**: Join offer confirmation, admin actions, document viewer
- **Accessibility**: Focus trap, `aria-modal`, `Escape` closes, return focus on close
- **File**: `components/ui/Modal.tsx`

#### `Toast`
- **Purpose**: Transient notifications
- **Variants**: success, error, warning, info
- **Props**: message, action (optional), duration (default 5s)
- **States**: entering, visible, exiting
- **Usage**: Form submissions, action confirmations, errors
- **Accessibility**: `role="status"`, `aria-live="polite"`
- **File**: `components/ui/Toast.tsx`

#### `Skeleton`
- **Purpose**: Loading placeholders
- **Variants**: text, card, avatar, stat, table-row
- **Props**: width, height, count (for lists), animate
- **Usage**: Every page that loads data
- **File**: `components/ui/Skeleton.tsx`

#### `EmptyState`
- **Purpose**: Zero-data states
- **Variants**: default, search (no results), error (failed to load)
- **Props**: icon, title, description, action (button)
- **Usage**: All list/grid pages
- **File**: `components/shared/EmptyState.tsx` (existing — enhance)

---

### Feature Components

#### `OfferCard`
- **Purpose**: Display offer summary in lists/grids
- **Variants**: resident (with join CTA), contractor (with analytics), compact (dashboard)
- **Props**: offer data, onJoin, onViewDetails, joined status, showParticipants
- **Sections**: category badge, title, contractor (verified), price, savings %, progress bar, CTA
- **States**: default, joined, full, expiring-soon, expired
- **Urgency badge**: "X מקומות אחרונים!" when capacity < 20%
- **Usage**: `/offers`, `/dashboard`, `/building`, `/contractor/offers/active`
- **File**: `components/features/offers/OfferCard.tsx` (existing — enhance)

#### `PricingTiers`
- **Purpose**: Visualize group pricing tiers with progress
- **Variants**: display (offer detail), builder (create offer)
- **Props**: tiers, basePrice, currentParticipants, unitLabel
- **Sections**: tier cards, progress indicator, current tier highlight, next tier unlock message
- **States**: loading, single-tier, multi-tier, all-unlocked
- **Usage**: `/offers/[id]`, `/contractor/offers/create`, `/checkout`
- **File**: `components/features/offers/PricingTiers.tsx` (existing — enhance)

#### `ContractorTrustBadge`
- **Purpose**: Show contractor verification status and trust signals
- **Variants**: compact (card), full (profile/detail)
- **Props**: verificationStatus, trustScore, completedJobs, licenseNumber, insuranceStatus
- **Sections**: verified badge, license, insurance, rating, completed jobs
- **States**: verified, pending, unverified, suspended
- **Usage**: `/offers/[id]`, `/contractors`, `/contractor/profile`, `/checkout`
- **File**: `components/features/ContractorTrustBadge.tsx` (existing — enhance)

#### `BuildingSummaryCard`
- **Purpose**: Display building info in resident context
- **Variants**: full (building page), compact (dashboard)
- **Props**: building data, invite code, resident count, offers count
- **Sections**: address, stats, invite action, active offers count
- **States**: loading, has-data, no-building (prompt to join)
- **Usage**: `/dashboard`, `/building`
- **File**: `components/features/building/BuildingSummaryCard.tsx` (new)

#### `ContractorCard`
- **Purpose**: Display contractor in directory listing
- **Variants**: grid, list
- **Props**: contractor data, specialties, rating, availability
- **Sections**: photo/logo, name, verified badge, categories, rating, CTA
- **States**: default, unavailable
- **Usage**: `/contractors`
- **File**: `components/features/matching/ContractorCard.tsx` (existing — enhance)

#### `OrderCard`
- **Purpose**: Display order summary in lists
- **Variants**: compact (dashboard), full (orders page)
- **Props**: order data, offer title, contractor, status, amount
- **Sections**: offer title, contractor, status badge, amount, date
- **States**: pending, processing, completed, cancelled, refunded
- **Usage**: `/orders`, `/dashboard`
- **File**: `components/features/orders/OrderCard.tsx` (new)

#### `OrderTimeline`
- **Purpose**: Show order lifecycle progression
- **Props**: steps with status (completed, current, upcoming)
- **Steps**: ordered → paid → scheduled → in-progress → completed → reviewed
- **States**: per-step active/completed/upcoming
- **Usage**: `/orders/[id]`
- **File**: `components/features/orders/OrderTimeline.tsx` (new)

#### `PaymentRow`
- **Purpose**: Single payment entry in payment history
- **Props**: payment data, status, amount, date, offer title
- **States**: pending, succeeded, failed, refunded, escrowed
- **Usage**: `/payments`
- **File**: `components/features/payments/PaymentRow.tsx` (new)

#### `EscrowBadge`
- **Purpose**: Indicate escrow protection on a payment/order
- **Variants**: inline (small badge), block (with explanation)
- **Props**: status, tooltip text
- **Usage**: `/checkout`, `/orders`, `/payments`
- **File**: `components/features/payments/EscrowBadge.tsx` (new)

#### `PriceBreakdown`
- **Purpose**: Itemized price table
- **Props**: original price, discount, subtotal, VAT, total
- **Usage**: `/checkout`, `/offers/[id]`
- **File**: `components/features/payments/PriceBreakdown.tsx` (new)

#### `StatCard`
- **Purpose**: Display a single metric
- **Variants**: default, accent (highlighted), clickable
- **Props**: title, value, change/trend, icon, suffix, sparklineData, onClick
- **States**: loading (skeleton), has-data, error
- **Usage**: All dashboards
- **Accessibility**: If clickable, ensure keyboard accessible
- **File**: `components/shared/StatCard.tsx` (existing — enhance)

#### `StepIndicator`
- **Purpose**: Show progress in multi-step flows
- **Variants**: horizontal (desktop), vertical (mobile)
- **Props**: steps, currentStep, completedSteps
- **Usage**: Onboarding, create offer wizard, checkout (future)
- **File**: `components/shared/StepIndicator.tsx` (new)

#### `Breadcrumb`
- **Purpose**: Show page hierarchy for navigation context
- **Props**: items: { label, href? }[]
- **Usage**: All detail/inner pages
- **File**: `components/shared/Breadcrumb.tsx` (new)

#### `CategoryChips`
- **Purpose**: Horizontal scrollable category filter
- **Props**: categories, selected, onChange, showCounts
- **States**: default, selected, disabled
- **Usage**: `/offers`, create offer, onboarding preferences
- **File**: `components/shared/CategoryChips.tsx` (new)

#### `AttentionBanner`
- **Purpose**: Prominent action-required notification
- **Variants**: warning, error, info
- **Props**: message, action CTA, dismissible
- **Usage**: Dashboards (contractor docs needed, profile incomplete, email unverified)
- **File**: `components/shared/AttentionBanner.tsx` (new)

#### `TrustBadgeCluster`
- **Purpose**: Group of trust signals displayed together
- **Props**: badges: { icon, label, verified }[]
- **Variants**: horizontal (offer cards), vertical (sidebars)
- **Usage**: Landing, offer detail, checkout, contractor profile
- **File**: `components/shared/TrustBadgeCluster.tsx` (new)

---

### Admin-Specific Components

#### `EscalationsTable`
- **Purpose**: Sortable, filterable escalation management table
- **Props**: escalations, pageSize, onResolve, onReassign, onEscalate
- **Columns**: priority, subject, agent, created, status, actions
- **States**: loading, has-data, empty, filtered-empty
- **Usage**: Admin `/escalations`, BM `/escalations`
- **File**: `apps/admin/components/features/escalations/EscalationsTable.tsx` (existing)

#### `MetricCard`
- **Purpose**: Admin KPI display
- **Props**: label, value, changePercent, sparklineData, variant, icon, onClick
- **States**: loading, has-data, error
- **Usage**: Admin dashboard, analytics
- **File**: `apps/admin/components/features/metrics/MetricCard.tsx` (existing)

#### `AgentCard`
- **Purpose**: AI agent status display
- **Props**: name, status, metrics, onReload, onConfigure
- **States**: healthy, degraded, unhealthy, offline
- **Usage**: Admin agents page, dashboard
- **File**: `apps/admin/components/features/agents/AgentCard.tsx` (existing)

#### `DataTable`
- **Purpose**: Generic sortable/filterable admin table
- **Props**: columns, data, pagination, sorting, actions, selectable
- **Usage**: Users, offers, payments, audit logs
- **File**: `apps/admin/components/shared/DataTable.tsx` (new — consolidate table patterns)

#### `AdminActionModal`
- **Purpose**: Confirmation/input modals for admin actions
- **Variants**: confirm (yes/no), input (collect reason), form (multi-field)
- **Props**: title, description, onConfirm, onCancel, fields
- **Usage**: Suspend user, approve contractor, release payment
- **File**: `apps/admin/components/shared/AdminActionModal.tsx` (new — replaces window.prompt)

---

### Agent-Specific Components

> See `design-system/AGENTS.md` for full agent UX specification.

#### `AgentStatusDot`
- **Purpose**: Visual health indicator for an agent
- **Variants**: healthy (green), degraded (yellow), unhealthy (red), offline (gray)
- **Props**: status
- **Usage**: Agent cards, admin dashboard
- **File**: `apps/admin/components/features/agents/AgentStatusDot.tsx` (new)

#### `AgentModeLabel`
- **Purpose**: Badge showing agent autonomy level
- **Variants**: auto (green), recommend (blue), gated (amber)
- **Props**: mode
- **Usage**: Agent cards, agent config panel
- **File**: `apps/admin/components/features/agents/AgentModeLabel.tsx` (new)

#### `PendingDecisionCard`
- **Purpose**: Display an agent decision awaiting admin approval
- **Variants**: vetting, outreach, credit, payment, matching (by action_type)
- **Props**: decision data, agent reasoning, actions (approve/reject/edit)
- **States**: pending, approved, rejected
- **Data source**: `pending_agent_decisions` table
- **Usage**: Admin agents page (pending decisions queue)
- **File**: `apps/admin/components/features/agents/PendingDecisionCard.tsx` (new)

#### `AgentConfigPanel`
- **Purpose**: Slide-out panel for configuring an agent
- **Props**: agent name, current config, onSave
- **Fields**: mode (auto/recommend/gated), temperature, enabled toggle, custom prompt, confidence threshold
- **Usage**: Admin agents page
- **File**: `apps/admin/components/features/agents/AgentConfigPanel.tsx` (new)

#### `AgentActivityLog`
- **Purpose**: Filterable table of agent actions from audit log
- **Props**: entries, filters (agent, action type, date range)
- **Columns**: timestamp, agent, action, user, confidence, tokens, latency, status
- **Data source**: `agent_audit_log` table
- **Usage**: Admin agents page
- **File**: `apps/admin/components/features/agents/AgentActivityLog.tsx` (new)

#### `AgentReasoningBlock`
- **Purpose**: Expandable display of agent reasoning chain
- **Props**: reasoning_chain (JSONB), cited_sources, alternatives_considered
- **States**: collapsed (summary), expanded (full chain)
- **Data source**: `agent_audit_log.reasoning_chain`
- **Usage**: Pending decisions, agent activity log
- **File**: `apps/admin/components/features/agents/AgentReasoningBlock.tsx` (new)

#### `OrchestrationGraph` (enhanced)
- **Purpose**: Interactive visualization of agent routing flow
- **Props**: nodes (agents), edges (routes), live metrics
- **States**: static view, live mode (animated active flows)
- **Usage**: Admin agents page
- **File**: `apps/admin/components/features/agents/AgentOrchestrationGraph.tsx` (existing — enhance from static SVG)

#### `ChatEscalationBanner`
- **Purpose**: Banner shown in AI chat when conversation escalates to human
- **Props**: escalation reason, estimated response time
- **Usage**: AI Chat (`/chat`)
- **File**: `apps/web/components/features/chat/ChatEscalationBanner.tsx` (new)

#### `VettingStatusTimeline`
- **Purpose**: Timeline showing contractor verification steps and current status
- **Props**: verification events, current status
- **Data source**: `contractor_verification_metadata` table
- **Usage**: Contractor profile (Documents tab), admin vetting detail
- **File**: `apps/web/components/features/contractor/VettingStatusTimeline.tsx` (new)

#### `TrustScoreProgress`
- **Purpose**: Visual trust score with improvement guidance
- **Props**: trust_score, trust_score_breakdown, improvement_tips
- **Data source**: `contractors.trust_score_breakdown` JSONB
- **Usage**: Contractor dashboard, contractor profile
- **File**: `apps/web/components/features/contractor/TrustScoreProgress.tsx` (new)

#### `CampaignPreviewCard`
- **Purpose**: Preview outreach campaign message before admin approval
- **Props**: campaign type, message, channel, variant, audience count
- **Data source**: `outreach_queue` table
- **Usage**: Admin outreach approval queue
- **File**: `apps/admin/components/features/outreach/CampaignPreviewCard.tsx` (new)

---

## Component File Structure

```
apps/web/components/
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Textarea.tsx
│   ├── Badge.tsx
│   ├── Modal.tsx
│   ├── Toast.tsx
│   └── Skeleton.tsx
├── shared/
│   ├── StatCard.tsx         (existing)
│   ├── EmptyState.tsx       (existing)
│   ├── NotificationPanel.tsx (existing)
│   ├── LanguageToggle.tsx   (existing)
│   ├── ToastContainer.tsx   (existing)
│   ├── StepIndicator.tsx    (new)
│   ├── Breadcrumb.tsx       (new)
│   ├── CategoryChips.tsx    (new)
│   ├── AttentionBanner.tsx  (new)
│   └── TrustBadgeCluster.tsx (new)
├── features/
│   ├── offers/
│   │   ├── OfferCard.tsx      (existing — enhance)
│   │   └── PricingTiers.tsx   (existing — enhance)
│   ├── building/
│   │   └── BuildingSummaryCard.tsx (new)
│   ├── matching/
│   │   └── ContractorCard.tsx (existing — enhance)
│   ├── orders/
│   │   ├── OrderCard.tsx      (new)
│   │   └── OrderTimeline.tsx  (new)
│   ├── payments/
│   │   ├── StripeCheckoutForm.tsx (existing)
│   │   ├── PaymentRow.tsx     (new)
│   │   ├── EscrowBadge.tsx    (new)
│   │   └── PriceBreakdown.tsx (new)
│   ├── chat/
│   │   └── AIChat.tsx         (existing)
│   └── ContractorTrustBadge.tsx (existing — enhance)
└── layouts/
    ├── ResidentLayout.tsx     (existing — may be legacy)
    └── ContractorLayout.tsx   (existing — may be legacy)

apps/admin/components/
├── shared/
│   ├── DataTable.tsx          (new)
│   └── AdminActionModal.tsx   (new)
├── features/
│   ├── agents/
│   │   ├── AgentCard.tsx      (existing — enhance)
│   │   ├── AgentOrchestrationGraph.tsx (existing — enhance from static SVG)
│   │   ├── AgentStatusDot.tsx (new)
│   │   ├── AgentModeLabel.tsx (new)
│   │   ├── PendingDecisionCard.tsx (new)
│   │   ├── AgentConfigPanel.tsx (new)
│   │   ├── AgentActivityLog.tsx (new)
│   │   └── AgentReasoningBlock.tsx (new)
│   ├── escalations/
│   │   └── EscalationsTable.tsx (existing)
│   ├── metrics/
│   │   ├── MetricCard.tsx     (existing)
│   │   └── AgentMetricsChart.tsx (existing)
│   └── outreach/
│       └── CampaignPreviewCard.tsx (new)
└── AdminShell.tsx             (existing)

apps/web/components/features/
├── chat/
│   ├── AIChat.tsx             (existing — enhance)
│   └── ChatEscalationBanner.tsx (new)
└── contractor/
    ├── VettingStatusTimeline.tsx (new)
    └── TrustScoreProgress.tsx (new)
```
