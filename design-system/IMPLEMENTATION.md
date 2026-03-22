# Groupio Implementation Plan

> Companion to: `design-system/MASTER.md`
> See also: `ROUTES.md`, `NAVIGATION.md`, `COMPONENTS.md`

---

## Implementation Strategy

The redesign is split into 3 phases. Each phase delivers visible, shippable improvements while building toward the full design system.

**Principle**: Foundation first, conversion pages second, polish third.

---

## Phase 1 — Foundation + Conversion Critical Path (Weeks 1–3)

> Goal: Unified design tokens, core components, and high-impact conversion pages.

### 1.1 Design Token Unification (Week 1, Days 1–2)

**Files to update:**

| File | Changes |
|------|---------|
| `apps/web/tailwind.config.ts` | Replace sky-blue primary with teal palette, replace violet accent with amber, add semantic colors, update border-radius scale, add shadow tokens, add fontSize tokens |
| `apps/admin/tailwind.config.ts` | Align colors with web (admin-accent variant via CSS variable), add shared tokens |
| `apps/web/styles/globals.css` | Remove duplicate Google Fonts import (keep next/font only), add CSS variables, update component classes (.card, .btn-*, .badge, .input-field) to use new tokens, add new utility classes |
| `apps/admin/app/globals.css` | Add RTL support, update component classes to use shared token values |
| `apps/web/app/layout.tsx` | Verify font loading is correct (remove redundant Heebo import) |
| `packages/ui/src/tokens.ts` | Update to match new design system values (source of truth) |

**Estimated effort**: 1 day for token files, 1 day for verification and visual regression checks.

### 1.2 Core UI Components (Week 1, Days 3–5)

Create or enhance these components:

| Component | Action | File |
|-----------|--------|------|
| `Badge` | **Create** — unified badge component replacing inline classes | `apps/web/components/ui/Badge.tsx` |
| `Button` | **Enhance** — formalize variants from globals.css into component | `apps/web/components/ui/Button.tsx` |
| `Breadcrumb` | **Create** | `apps/web/components/shared/Breadcrumb.tsx` |
| `StepIndicator` | **Create** | `apps/web/components/shared/StepIndicator.tsx` |
| `TrustBadgeCluster` | **Create** | `apps/web/components/shared/TrustBadgeCluster.tsx` |
| `AttentionBanner` | **Create** | `apps/web/components/shared/AttentionBanner.tsx` |
| `Skeleton` | **Create** — proper skeleton variants | `apps/web/components/ui/Skeleton.tsx` |
| `CategoryChips` | **Create** | `apps/web/components/shared/CategoryChips.tsx` |

### 1.3 Landing Page Redesign (Week 2)

**File**: `apps/web/app/page.tsx`

**Changes**:
1. Restructure hero: specific headline, concrete savings example, benefit-driven CTAs
2. Add "How it works" 3-step section
3. Add featured offers section (or sample offers)
4. Add trust & safety section
5. Add social proof section
6. Add contractor CTA section
7. Redesign footer with full links
8. Apply new color palette and typography
9. Mobile-optimize all sections
10. Remove sky-blue + violet gradients

**New components to create:**
- `components/landing/HeroSection.tsx`
- `components/landing/HowItWorksSection.tsx`
- `components/landing/FeaturedOffers.tsx`
- `components/landing/TrustSection.tsx`
- `components/landing/ContractorCTA.tsx`
- `components/landing/LandingFooter.tsx`

### 1.4 Offer Detail Conversion (Week 2–3)

**File**: `apps/web/app/(resident)/offers/[offerId]/page.tsx`

**Changes**:
1. Add breadcrumb
2. Enhance pricing tier visualization (unlock messaging, progress)
3. Add "what's included" section
4. Enhance contractor trust section
5. Add social proof (building context, recent joins)
6. Add process timeline
7. Move cancellation policy to visible callout
8. Add sticky CTA sidebar (desktop) / bottom bar (mobile)
9. Add share functionality

### 1.5 Checkout Trust Enhancement (Week 3)

**File**: `apps/web/app/(resident)/checkout/page.tsx`

**Changes**:
1. **Fix URL param bug**: Change payments page to use `offerId` parameter
2. Add order review step before payment
3. Enhanced price breakdown (original, discount, subtotal, VAT, total)
4. Trust sidebar with escrow explanation, verified contractor, guarantee
5. Processing overlay with trust messaging
6. Enhanced success state with next steps
7. Better error recovery UI

**Files also to fix:**
- `apps/web/app/(resident)/payments/page.tsx` — Fix `offer=${payment.offerId}` → `offerId=${payment.offerId}`

### 1.6 Offers List Enhancement (Week 3)

**File**: `apps/web/app/(resident)/offers/page.tsx`

**Changes**:
1. Add category chips filter
2. Add sort control
3. Enhance OfferCard: savings highlight, urgency badge, progress bar
4. Add "building offers" section at top
5. Mobile: horizontal scroll for categories, bottom sheet for filters
6. Better empty/loading states

---

## Phase 2 — Role-Specific Dashboards + Key Flows (Weeks 4–6)

### 2.1 Resident Dashboard Redesign (Week 4)

**File**: `apps/web/app/(resident)/dashboard/page.tsx`

**Changes**:
1. Personalized greeting with building context
2. Enhanced stat cards (savings amount, active offers, neighbors, active orders)
3. Building summary card with invite
4. Recommended offers section
5. Active orders section
6. Quick actions
7. AI assistant teaser

### 2.2 Resident Navigation Overhaul (Week 4)

**Files**:
- `apps/web/app/(resident)/layout.tsx` — Redesign sidebar, add mobile bottom nav
- Remove `/architecture` from nav
- Add `/orders` to primary nav
- Move `/contractors`, `/payments` to secondary

### 2.3 Contractor Dashboard Redesign (Week 5)

**File**: `apps/web/app/contractor/dashboard/page.tsx`

**Changes**:
1. Attention bar for required actions
2. Enhanced stats with trends
3. Compact trust score with expandable breakdown
4. Tab-based offers section
5. Upcoming projects timeline
6. Quick actions

### 2.4 Create Offer Wizard (Week 5)

**File**: `apps/web/app/contractor/offers/create/page.tsx`

**Changes**:
1. Convert to multi-step wizard
2. Building search autocomplete
3. Enhanced pricing tier builder
4. Offer preview step
5. Save as draft capability

### 2.5 Contractor Navigation + Profile (Week 5–6)

**Files**:
- `apps/web/app/contractor/layout.tsx` — Redesign sidebar, "Create Offer" as CTA button
- `apps/web/app/contractor/profile/page.tsx` — Fix reload, enhance document upload, wire settings

### 2.6 Onboarding Flow Enhancement (Week 6)

**File**: `apps/web/app/(auth)/onboarding/page.tsx`

**Changes**:
1. Replace circle step indicator with progress bar
2. Address autocomplete integration
3. Visual category chip selector
4. Completion screen with CTA

### 2.7 Auth Pages Polish (Week 6)

**Files**:
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/(auth)/signup/page.tsx`
- `apps/web/app/(auth)/layout.tsx`

**Changes**:
1. Enhanced branding panel
2. Visual role selection for signup
3. Better error states
4. Consistent form styling

---

## Phase 3 — Admin + Agents + Polish + Completeness (Weeks 7–9)

### 3.1 Admin Dashboard Redesign (Week 7)

**File**: `apps/admin/app/dashboard/page.tsx`

**Changes**:
1. Attention hierarchy
2. Clickable metric cards
3. Pending actions queue
4. Grouped navigation

### 3.2 Admin RTL Support (Week 7)

**Files**:
- `apps/admin/app/layout.tsx` — Add RTL support, locale detection
- `apps/admin/app/globals.css` — Add RTL styles
- All admin pages — Verify RTL compatibility

### 3.3 Admin Contractor Verification (Week 7)

**File**: `apps/admin/app/contractors/page.tsx`

**Changes**:
1. Vetting queue
2. Document viewer
3. Verification checklist
4. Fix API inconsistency (request-docs vs request-documents)

### 3.4 Admin Payments (Week 8)

**File**: `apps/admin/app/payments/page.tsx`

**Changes**:
1. Replace `window.prompt()` with proper modal
2. Move platform fee to config
3. Enhanced escrow/payouts tables

### 3.5 Admin Shared Components (Week 8)

Create:
- `apps/admin/components/shared/DataTable.tsx` — reusable sortable/filterable table
- `apps/admin/components/shared/AdminActionModal.tsx` — replaces window.prompt

### 3.6 Agent Management UI Redesign (Week 8)

**File**: `apps/admin/app/agents/page.tsx` + `apps/admin/components/features/agents/`

**Changes**:
1. Enhanced agent cards: add mode badge (auto/recommend/gated), status dot, quick config
2. Agent config panel: slide-out with mode, temperature, threshold controls
3. Pending decisions queue redesign: filter by agent/type, decision cards with reasoning
4. Interactive orchestration graph (replace static SVG)
5. Enhanced activity log: filterable, expandable reasoning chain
6. Alert banner when agents degraded/offline
7. Agent comparison metrics view

**New components**:
- `apps/admin/components/features/agents/AgentConfigPanel.tsx`
- `apps/admin/components/features/agents/PendingDecisionCard.tsx`
- `apps/admin/components/features/agents/AgentActivityLog.tsx`
- `apps/admin/components/features/agents/AgentStatusDot.tsx`
- `apps/admin/components/features/agents/AgentModeLabel.tsx`

**See**: `design-system/AGENTS.md` for full specification.

### 3.7 AI Chat UX Enhancement (Week 8)

**File**: `apps/web/components/features/chat/AIChat.tsx`

**Changes**:
1. Escalation UX: clear "transferring to human" message
2. Context-aware suggestions based on user's offers/orders
3. Conversation history (persist across sessions)
4. Typing/thinking indicator with context ("checking your order...")
5. "Talk to human" always available
6. Clear AI indicator label

**See**: `design-system/AGENTS.md` Section 2.1 for full specification.

### 3.8 Contractor Vetting UX Enhancement (Week 8)

**File**: `apps/web/app/contractor/profile/page.tsx` (Documents tab)

**Changes**:
1. Document status cards with vetting agent status
2. Trust score progress bar with improvement tips
3. Verification timeline showing vetting steps
4. Missing document alerts with specific guidance

**New components**:
- `apps/web/components/features/contractor/VettingStatusTimeline.tsx`
- `apps/web/components/features/contractor/TrustScoreProgress.tsx`

### 3.9 Buildings Manager Pages (Week 8–9)

**Files**:
- `apps/web/app/buildings-manager/dashboard/page.tsx` — Enhanced stats, building cards
- `apps/web/app/buildings-manager/buildings/page.tsx` — Search, filters
- `apps/web/app/buildings-manager/escalations/page.tsx` — Priority indicators

### 3.10 Remaining Resident Pages (Week 9)

- `/orders` and `/orders/[id]` — Order cards, timeline
- `/payments` — Enhanced payment rows, fix offerId link
- `/profile` — Merge change-password, enhance tabs
- `/building` — Enhanced invite section, activity feed
- `/contractors` — Search, filters, enhanced cards

### 3.11 Remaining Contractor Pages (Week 9)

- `/contractor/offers/active` — Tabs, row-based view, analytics
- `/contractor/projects` and `/contractor/projects/[id]` — Project cards, milestone timeline

---

## Bug Fixes (Integrate into Phases)

| Bug | Fix | Phase |
|-----|-----|-------|
| Checkout URL param mismatch | Change `/payments` to use `offerId` param | Phase 1 |
| Duplicate Heebo font loading | Remove Google Fonts import from globals.css | Phase 1 |
| `window.location.reload()` in contractor profile | Use state update / React Query invalidation | Phase 2 |
| `window.prompt()` in admin payments | Replace with AdminActionModal | Phase 3 |
| Non-functional deactivate button | Either implement or remove | Phase 3 |
| Non-functional request review button | Either implement or remove | Phase 3 |
| Unconnected notification toggles | Wire to API or hide | Phase 2 |
| API inconsistency (request-docs) | Standardize endpoint naming | Phase 3 |
| Hardcoded Hebrew in OfferAnalyticsPanel | Move to i18n | Phase 2 |

---

## Highest ROI Changes (Do First)

These changes deliver the most user value with least effort:

| Change | Effort | Impact | ROI |
|--------|--------|--------|-----|
| Fix checkout offerId param | 5 min | Critical bug fix | ★★★★★ |
| Remove duplicate font import | 5 min | Performance improvement | ★★★★★ |
| Update color palette in Tailwind config | 1 hour | Entire app visual refresh | ★★★★★ |
| Create Badge component | 2 hours | Consistent badges everywhere | ★★★★☆ |
| Enhance OfferCard with savings/urgency | 3 hours | Offer conversion improvement | ★★★★☆ |
| Add breadcrumbs to detail pages | 2 hours | Navigation clarity | ★★★★☆ |
| Landing page hero rewrite | 4 hours | First-impression conversion | ★★★★☆ |
| Checkout trust enhancement | 4 hours | Payment conversion | ★★★★☆ |
| Add mobile bottom nav for residents | 3 hours | Mobile usability | ★★★★☆ |
| Create TrustBadgeCluster | 2 hours | Trust signals everywhere | ★★★☆☆ |

---

## File Change Summary

### New Files to Create

```
design-system/
├── MASTER.md          ✅ Created
├── ROUTES.md          ✅ Created
├── NAVIGATION.md      ✅ Created
├── COMPONENTS.md      ✅ Created
├── IMPLEMENTATION.md  ✅ Created
└── pages/
    ├── landing.md           ✅ Created
    ├── resident-dashboard.md ✅ Created
    ├── offers.md            ✅ Created
    ├── offer-detail.md      ✅ Created
    ├── checkout.md          ✅ Created
    ├── contractor-dashboard.md ✅ Created
    ├── create-offer.md      ✅ Created
    └── admin-dashboard.md   ✅ Created

apps/web/components/
├── ui/
│   ├── Badge.tsx            (Phase 1 — new)
│   ├── Button.tsx           (Phase 1 — new/enhance)
│   └── Skeleton.tsx         (Phase 1 — new)
├── shared/
│   ├── Breadcrumb.tsx       (Phase 1 — new)
│   ├── StepIndicator.tsx    (Phase 1 — new)
│   ├── TrustBadgeCluster.tsx (Phase 1 — new)
│   ├── AttentionBanner.tsx  (Phase 1 — new)
│   └── CategoryChips.tsx    (Phase 1 — new)
├── landing/
│   ├── HeroSection.tsx      (Phase 1 — new)
│   ├── HowItWorksSection.tsx (Phase 1 — new)
│   ├── FeaturedOffers.tsx   (Phase 1 — new)
│   ├── TrustSection.tsx     (Phase 1 — new)
│   ├── ContractorCTA.tsx    (Phase 1 — new)
│   └── LandingFooter.tsx    (Phase 1 — new)
└── features/
    ├── building/
    │   └── BuildingSummaryCard.tsx (Phase 2 — new)
    ├── orders/
    │   ├── OrderCard.tsx    (Phase 3 — new)
    │   └── OrderTimeline.tsx (Phase 3 — new)
    └── payments/
        ├── PaymentRow.tsx   (Phase 3 — new)
        ├── EscrowBadge.tsx  (Phase 1 — new)
        └── PriceBreakdown.tsx (Phase 1 — new)

apps/admin/components/
├── shared/
│   ├── DataTable.tsx        (Phase 3 — new)
│   └── AdminActionModal.tsx (Phase 3 — new)
```

### Existing Files to Modify

```
Phase 1:
├── apps/web/tailwind.config.ts          (token update)
├── apps/web/styles/globals.css          (remove font dup, update classes)
├── apps/web/app/page.tsx                (landing redesign)
├── apps/web/app/(resident)/offers/page.tsx (enhance)
├── apps/web/app/(resident)/offers/[offerId]/page.tsx (enhance)
├── apps/web/app/(resident)/checkout/page.tsx (enhance)
├── apps/web/app/(resident)/payments/page.tsx (fix offerId bug)
├── apps/web/components/features/offers/OfferCard.tsx (enhance)
├── apps/web/components/features/offers/PricingTiers.tsx (enhance)
└── apps/web/components/features/ContractorTrustBadge.tsx (enhance)

Phase 2:
├── apps/web/app/(resident)/dashboard/page.tsx (redesign)
├── apps/web/app/(resident)/layout.tsx (navigation redesign)
├── apps/web/app/contractor/dashboard/page.tsx (redesign)
├── apps/web/app/contractor/offers/create/page.tsx (wizard)
├── apps/web/app/contractor/layout.tsx (navigation redesign)
├── apps/web/app/contractor/profile/page.tsx (fix reload, enhance)
├── apps/web/app/(auth)/onboarding/page.tsx (enhance)
├── apps/web/app/(auth)/login/page.tsx (polish)
├── apps/web/app/(auth)/signup/page.tsx (enhance)
└── apps/web/components/shared/StatCard.tsx (enhance)

Phase 3:
├── apps/admin/tailwind.config.ts (align tokens)
├── apps/admin/app/globals.css (RTL, token alignment)
├── apps/admin/app/layout.tsx (RTL support)
├── apps/admin/app/dashboard/page.tsx (redesign)
├── apps/admin/app/contractors/page.tsx (enhance)
├── apps/admin/app/payments/page.tsx (fix prompt, enhance)
├── apps/web/app/buildings-manager/dashboard/page.tsx (enhance)
├── apps/web/app/(resident)/orders/page.tsx (enhance)
├── apps/web/app/(resident)/orders/[id]/page.tsx (enhance)
├── apps/web/app/(resident)/profile/page.tsx (enhance)
├── apps/web/app/(resident)/building/page.tsx (enhance)
└── apps/web/app/contractor/offers/active/page.tsx (enhance)
```
