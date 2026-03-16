# Create Offer Page — Design Spec

> Route: `/contractor/offers/create` (`apps/web/app/contractor/offers/create/page.tsx`)
> Priority: **P1 — High**

---

## Current State

- Form with: title, description, category, building, region, pricing, min/max participants
- Pricing tiers preview (PricingTiers component)
- react-hook-form + zod validation
- apiClient.createOffer() integration

## Current UX Problems

1. **Building ID is free text** — no search/autocomplete; contractor types raw IDs
2. **Region is in schema but not sent to API** — form field is misleading
3. **includedServices and requirements in schema but unused** — form doesn't capture them
4. **No step-by-step flow** — all fields on one long page is overwhelming
5. **Pricing tier setup is complex** — contractors may not understand tier thresholds
6. **No preview of how the offer will look** to residents
7. **No save as draft** — if contractor leaves, progress is lost
8. **No image upload** — offers have no visual content
9. **Description field is plain text** — no formatting guidance
10. **No guidance text** — contractor doesn't know what makes a good offer

## Redesign Goals

- **Multi-step wizard** instead of single-page form
- **Building search** with autocomplete
- **Guided pricing tier setup** with live preview
- **Offer preview** before submission
- **Save as draft** capability
- **Helpful guidance** at each step

## Recommended Layout: Multi-Step Wizard

### Progress Bar
- Step indicator: 1. פרטי הצעה → 2. תמחור → 3. יעד ומשתתפים → 4. תצוגה מקדימה
- Current step highlighted, completed steps checked

### Step 1: Offer Details
- **Title** — text input with character count (max 80)
- **Category** — select dropdown with icons
- **Description** — textarea with guidance: "תארו את השירות, מה כלול, ומדוע כדאי"
- **Included Services** — repeatable input list (add/remove items)
- **Requirements** — optional textarea for prerequisites
- **Image Upload** — optional offer photo/cover (future)

### Step 2: Pricing
- **Base Price** — "מחיר למשתתף בודד (ללא הנחה)"
- **Pricing Tiers** — interactive tier builder:
  - Tier 1: minimum participants → price per unit
  - Add tier: "הוסיפו רמת הנחה"
  - Each tier shows: threshold, price, savings % (auto-calculated)
- **Live Preview**: PricingTiers component showing how residents will see it
- **Guidance**: "ככל שמוסיפים משתתפים, המחיר לדירה יורד"

### Step 3: Target & Participants
- **Building** — search autocomplete (search by name/address)
- **Region** — auto-filled from building, or manual select
- **Min Participants** — minimum to activate the offer
- **Max Participants** — capacity
- **Offer Duration** — how long the offer stays active (days)
- **Guidance**: "הגדירו מינימום ריאלי — מומלץ להתחיל מ-10 משתתפים"

### Step 4: Preview & Submit
- Full offer preview as residents will see it:
  - Offer card preview
  - Offer detail preview (compact)
  - Pricing tiers preview
- **Terms checkbox**: "אני מאשר את תנאי השימוש לקבלנים"
- **Actions**: "שמרו כטיוטא" (secondary) | "פרסמו הצעה" (primary)

## Key Components

- `OfferWizard` — multi-step form container with progress
- `StepIndicator` — progress bar with step labels
- `PricingTierBuilder` — interactive tier input with live calculations
- `PricingTiers` (existing — used in preview)
- `BuildingSearchInput` — autocomplete building search
- `ServiceListInput` — repeatable text input list
- `OfferPreview` — renders offer as residents will see it
- `DraftSaveBanner` — "draft saved" indicator

## States

- **Loading**: Skeleton form
- **Editing**: Active form with validation
- **Draft saved**: "טיוטא נשמרה" toast
- **Submitting**: Loading overlay "מפרסמים את ההצעה..."
- **Success**: "ההצעה פורסמה בהצלחה!" with link to view
- **Validation error**: Inline errors per field, step indicator shows which step has errors
- **API error**: Error banner with retry

## Mobile Notes

- Full-screen wizard, one step at a time
- Bottom bar: "הקודם" / "הבא" navigation
- Pricing tier builder: simplified vertical layout
- Preview: scrollable full-screen preview

## RTL Notes

- Form labels right-aligned
- Input text right-aligned (Hebrew)
- Step indicator flows right-to-left
- Price inputs use LTR for numbers
- "הבא" arrow points left (RTL forward), "הקודם" arrow points right
