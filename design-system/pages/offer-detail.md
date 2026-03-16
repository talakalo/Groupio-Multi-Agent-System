# Offer Detail Page — Design Spec

> Route: `/offers/[offerId]` (`apps/web/app/(resident)/offers/[offerId]/page.tsx`)
> Priority: **P0 — Highest**

---

## Current State

- Offer title, description, contractor info
- PricingTiers component with tier visualization
- ContractorTrustBadge component
- Join modal with cancellation policy

## Current UX Problems

1. **Pricing tiers are complex** — residents may not understand threshold-based pricing
2. **No "what you get" section** — included services aren't listed clearly
3. **No timeline** — when does the offer expire? when does work start?
4. **Contractor section is minimal** — no portfolio, no past project photos
5. **Join modal doesn't explain the commitment** — what happens after joining?
6. **No social proof on this page** — how many from my building joined?
7. **Cancellation policy is in the modal** — should be visible before clicking join
8. **No FAQ section** for the specific offer
9. **No breadcrumb** — user loses navigation context
10. **Missing "share with neighbors" action**

## Redesign Goals

- Make **pricing crystal clear** with visual tier progression
- Build **contractor trust** with verification details and past work
- Show **social proof** (who from my building joined, total participants)
- Clear **timeline and process** — what happens after joining
- Reduce **commitment anxiety** — cancellation policy visible upfront
- Enable **sharing** to boost group participation

## Recommended Layout

### Breadcrumb
- הצעות > [קטגוריה] > [שם ההצעה]

### Hero Section
- Category badge + Offer title (heading-lg)
- Contractor name + verified badge (clickable → profile)
- Status badge: active / ending soon / full
- Key stats row: participants, savings %, days remaining

### Pricing Section (Primary Conversion Block)
- **Current price highlight**: "₪X,XXX / דירה" (large, accent-colored)
- **Original price**: strikethrough
- **Savings**: "חוסכים X%" badge
- **Tier visualization**: visual progress showing how price drops with more participants
  ```
  Tier 1: 10+ → ₪3,600 ✓ (unlocked)
  Tier 2: 20+ → ₪3,200 ✓ (current — 24 joined)
  Tier 3: 30+ → ₪2,880   (6 more needed!)
  ```
- **"Help unlock next tier"** CTA: "שתפו עם שכנים להוזלת המחיר"

### What's Included
- Bullet list of included services
- Duration/scope
- Warranty information (if any)

### Contractor Section
- Profile card: photo/logo, name, verified badge cluster
- Trust score with breakdown (if available)
- Past projects (count + sample images if available)
- License number + insurance status
- "צפו בפרופיל המלא" link

### Social Proof
- "X דיירים מהבניין שלך כבר הצטרפו" (if applicable)
- Total participant count with progress bar toward next tier
- Recent joins: "אלון מ-תל אביב הצטרף לפני 2 שעות"

### Timeline & Process
1. הצטרפו להצעה ← (you are here)
2. תשלום מאובטח בנאמנות
3. תיאום מול הקבלן
4. ביצוע העבודה
5. שחרור התשלום לקבלן

### Cancellation & Terms
- Cancellation policy visible in a bordered callout (not hidden in modal)
- Escrow explanation with lock icon
- Money-back guarantee if applicable

### Sticky CTA Bar (mobile)
- Fixed bottom bar: price + "הצטרפו להצעה" button
- Visible on scroll past the pricing section

### Sticky CTA (desktop)
- Sidebar card that follows scroll with:
  - Current price
  - Savings badge
  - Participant count
  - "הצטרפו" CTA
  - Trust badges row

## Join Flow (Modal or Inline)

1. Confirm offer details (price, tier)
2. Show cancellation policy
3. "המשיכו לתשלום" → redirect to `/checkout?offerId=X`

## Key Components

- `OfferHero` — title, contractor, status, key stats
- `PricingTiers` (enhanced — visual tier progression with unlock messaging)
- `PriceSummaryCard` — sticky sidebar with CTA
- `ContractorProfileCard` — trust badge cluster, verification details
- `IncludedServicesList` — bullet list of services
- `SocialProofSection` — participant count, building context
- `ProcessTimeline` — 5-step visual timeline
- `CancellationCallout` — visible policy block
- `JoinConfirmModal` — confirmation before checkout
- `MobileStickyBar` — fixed bottom CTA

## States

- **Loading**: Skeleton for hero, pricing, contractor sections
- **Offer not found**: 404 with "ההצעה לא נמצאה" + link back to offers
- **Offer expired**: Expired badge, greyed out CTA, "ההצעה הסתיימה" message
- **Offer full**: "ההצעה מלאה" badge, waitlist CTA if applicable
- **Already joined**: Show "כבר הצטרפתם ✓" badge, link to order, hide join CTA
- **Error**: Retry banner

## Mobile Notes

- Stack all sections vertically
- Pricing section: horizontal scroll for tiers if > 3
- Contractor card: compact version
- Sticky bottom bar for CTA
- Social proof: compact single-line indicator
- Process timeline: vertical stepper

## RTL Notes

- All text right-aligned
- Tier progression visual reads right-to-left
- Process timeline reads top-to-bottom (universal)
- Prices use LTR embed for ₪ symbol
- Share button on the left side of the hero
