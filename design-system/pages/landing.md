# Landing Page — Design Spec

> Route: `/` (`apps/web/app/page.tsx`)
> Priority: **P0 — Highest**

---

## Current State

- Fixed header with logo, nav links (איך זה עובד, מספרים), login/signup CTAs
- Hero: badge, headline with primary gradient highlight, description, two CTA buttons
- Stats bar: 4 metrics (2,500+ דיירים, 350+ קבלנים, 40% חיסכון, 180+ בניינים)
- Features grid: 4 value prop cards (group buying, savings, verified contractors, AI)
- Bottom CTA section: gradient background, two buttons
- Footer: logo + copyright

## Current UX Problems

1. **Hero is generic** — reads like any SaaS landing, not a community marketplace
2. **No social proof** — no testimonials, no real building stories, no contractor logos
3. **Value prop unclear** — "group buying power" needs concrete example (e.g., "24 neighbors saved ₪3,200 each on waterproofing")
4. **Sky-blue + violet gradient** feels AI/crypto, not local marketplace
5. **Stats lack credibility** — no context or source attribution
6. **Features section is text-heavy** — no visual hierarchy between features
7. **No pricing example** — residents can't visualize savings without a concrete offer example
8. **No trust section** — no mention of escrow, verification, or money-back guarantee
9. **CTA is "הרשמה חינם" (free signup)** — doesn't communicate value; should be benefit-driven
10. **Footer is minimal** — no links to help, FAQ, about, contact
11. **No "How it works" flow** — steps should be visualized, not just a nav anchor
12. **Mobile header uses fixed positioning** — may overlap content on small screens

## Redesign Goals

- Immediately communicate **what Groupio does** and **why it's better**
- Show a **concrete savings example** within 5 seconds of landing
- Build trust through **social proof, verification badges, and escrow messaging**
- Clear **role-based entry points** (residents vs contractors)
- Conversion-optimized with **benefit-driven CTAs**
- Hebrew-optimized typography with strong visual hierarchy

## Recommended Layout (Top to Bottom)

### 1. Header (sticky)
- Logo (left in RTL)
- Nav: איך זה עובד | קטגוריות | לקבלנים | עזרה
- CTA cluster: התחברות (ghost) | התחלת חיסכון (primary)
- Mobile: hamburger + single CTA button

### 2. Hero Section
- **Headline**: Bold, two-line, specific — e.g., "הדיירים בבניין שלך כבר חוסכים אלפי שקלים"
- **Subheadline**: One sentence explaining the mechanism
- **Concrete example card**: Mini offer card showing "איטום גג — מ-₪4,800 ל-₪2,880 לדירה (40% הנחה)" with group progress bar
- **Two CTAs**: "הצטרפו לבניין שלכם" (primary) | "אני קבלן" (secondary/outline)
- **Trust badge row**: "3,200+ דיירים פעילים" · "תשלום מוגן בנאמנות" · "קבלנים מאומתים בלבד"
- Background: subtle warm gradient (primary-50 → white), no heavy imagery

### 3. How It Works (3 steps)
- Step 1: Icon + "הצטרפו לבניין" + description
- Step 2: Icon + "בחרו הצעה קבוצתית" + description
- Step 3: Icon + "שלמו וחסכו" + description
- Visual: numbered circles connected by dotted line
- Each step has a mini-illustration or screenshot

### 4. Featured Offers (Social Proof + Conversion)
- "הצעות פופולריות עכשיו" heading
- 3 offer cards (real or sample) with:
  - Category icon
  - Title
  - Price range with savings %
  - Participants count / progress bar
  - Contractor verified badge
  - "צפו בהצעה" CTA
- Link: "ראו את כל ההצעות →"

### 5. Trust & Safety Section
- "למה לסמוך על גרופיו?" heading
- 4 trust cards:
  - "קבלנים מאומתים" — license, insurance, background checks
  - "תשלום מוגן" — escrow with step diagram
  - "מחירים שקופים" — no hidden fees, tier-based pricing
  - "תמיכה מלאה" — AI assistant + human escalation
- Each with icon, title, 2-line description

### 6. Social Proof Section
- Testimonial cards (2-3) with:
  - Quote
  - Name, building, city
  - Star rating
  - Savings amount
- Aggregate stats bar: total saved, buildings active, contractors verified

### 7. For Contractors CTA Section
- "?אתם קבלנים" — secondary audience callout
- Value props: reach more customers, group deals volume, verified badge
- Single CTA: "הצטרפו כקבלן מאומת"
- Contractor trust stats

### 8. Footer
- Logo + tagline
- Links: אודות | איך זה עובד | שאלות נפוצות | צור קשר | תנאי שימוש | מדיניות פרטיות
- Social links (if applicable)
- "כל הזכויות שמורות © 2026 גרופיו"

## Key Components

- `HeroSection` — headline, example card, CTAs, trust badges
- `HowItWorksSection` — 3-step visual flow
- `FeaturedOffersSection` — 3 offer cards carousel/grid
- `TrustSection` — 4 trust cards
- `TestimonialsSection` — testimonial cards
- `ContractorCTASection` — contractor callout
- `LandingHeader` — sticky header with role-aware CTAs
- `LandingFooter` — full footer with links

## States

- **Loading**: Skeleton for featured offers
- **Error**: Fallback to static content (no API dependency for landing)
- **No offers**: Show sample/template offers with "בקרוב" badge

## Mobile Notes

- Hero: stack headline + example card vertically; single CTA
- How It Works: vertical step list
- Featured Offers: horizontal scroll carousel
- Trust: 2x2 grid
- Testimonials: single card with swipe dots
- Header: fixed, compact — logo + hamburger + single CTA

## RTL Notes

- All text right-aligned
- Step flow reads right-to-left
- Arrow icons in "How it works" flip
- Progress bars fill right-to-left
- Offer cards: price on the right, action on the left
