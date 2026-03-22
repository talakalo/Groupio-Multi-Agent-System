# Checkout Page — Design Spec

> Route: `/checkout` (`apps/web/app/(resident)/checkout/page.tsx`)
> Priority: **P0 — Highest**

---

## Current State

- Gets `offerId` from query params (BUG: payments page sends `offer` not `offerId`)
- Mock mode: immediate success
- Stripe mode: StripeCheckoutForm with PaymentElement
- Order summary: subtotal, VAT, total
- Escrow badge
- Success and error states

## Current UX Problems

1. **URL param mismatch** — payments page links with `offer=` but checkout reads `offerId=`
2. **No order review step** — user goes straight to payment without confirming what they're buying
3. **Escrow messaging is minimal** — a small badge isn't enough for first-time payment trust
4. **No price breakdown** — just subtotal + VAT; should show original price, discount, group savings
5. **No cancellation/refund reminder** at the payment step
6. **Success state is basic** — no next-steps guidance
7. **Error recovery is poor** — generic error message, no retry guidance
8. **No payment method selection** — Stripe only, no indication of accepted methods
9. **No loading state during payment processing** — anxiety gap
10. **No breadcrumb or back navigation**

## Redesign Goals

- **Maximum trust at the payment moment** — escrow, guarantees, security badges
- **Clear order review** before payment
- **Transparent pricing** with full breakdown
- **Post-payment clarity** — what happens next
- **Error recovery** — clear guidance on failures

## Recommended Layout

### Breadcrumb
- הצעות > [שם ההצעה] > תשלום

### Two-Column Layout (desktop) / Stacked (mobile)

#### Left Column (RTL: Right) — Order Review + Payment

**Step 1: Review Order**
- Offer title + category
- Contractor name + verified badge
- Selected tier / price tier
- Price breakdown:
  - מחיר מקורי: ₪X,XXX (strikethrough)
  - הנחה קבוצתית (40%): -₪X,XXX
  - סה"כ לפני מע"מ: ₪X,XXX
  - מע"מ (17%): ₪XXX
  - **סה"כ לתשלום: ₪X,XXX** (bold, large)

**Step 2: Payment**
- Payment method header with card brand icons (Visa, Mastercard, Amex)
- Stripe PaymentElement
- "שלמו ₪X,XXX" CTA button (primary, large, with lock icon)

#### Right Column (RTL: Left) — Trust & Summary Sidebar

**Trust Cluster**
- 🔒 "תשלום מוגן בנאמנות" — with explanation:
  "הכסף שלכם מוחזק בנאמנות עד לסיום העבודה בהצלחה"
- ✓ "קבלן מאומת ומבוטח"
- ↩ "ביטול חינם עד 48 שעות"
- 🛡 "הגנת קונה מלאה"

**Need Help?**
- "שאלות לפני תשלום?" + chat/support link

### Processing State
- Full-screen overlay with:
  - Spinner + "מעבדים את התשלום שלכם..."
  - Trust message: "הכסף שלכם מוגן"
  - Estimated time: "זה יכול לקחת מספר שניות"

### Success State
- ✓ Checkmark animation
- "התשלום בוצע בהצלחה!"
- Order number
- Next steps:
  1. "קיבלתם אישור במייל"
  2. "הקבלן ייצור קשר לתיאום"
  3. "תוכלו לעקוב בהזמנות שלכם"
- CTAs: "צפו בהזמנה" (primary) | "חזרו להצעות" (secondary)

### Error State
- ✗ Error icon
- Clear error message (card declined, network error, etc.)
- "נסו שוב" CTA
- "שנו אמצעי תשלום" option
- Support link: "צריכים עזרה? דברו איתנו"

## Key Components

- `OrderReview` — offer details + price breakdown
- `TrustSidebar` — escrow, verification, cancellation, guarantee
- `StripeCheckoutForm` (existing, enhance)
- `PaymentProcessingOverlay` — spinner + trust message
- `PaymentSuccess` — confirmation + next steps
- `PaymentError` — error message + recovery actions
- `PriceBreakdown` — line-by-line pricing table

## States

- **Loading**: Skeleton for order summary, disabled payment form
- **Ready**: Order review + active payment form
- **Processing**: Overlay with spinner and trust message
- **Success**: Confirmation with next steps
- **Error**: Error message with retry
- **Offer not found**: "ההצעה לא נמצאה" with back link (FIX the offerId param bug)

## Mobile Notes

- Single column: order review → trust badges (collapsed accordion) → payment form
- Sticky bottom: "שלמו ₪X,XXX" button
- Success/error: full screen
- Trust badges: horizontal scroll row or collapsed section

## RTL Notes

- Price table: labels right, amounts left
- Card brand icons: universal direction
- Trust badges: icon on right (start), text on left (end)

## Bug to Fix

- `apps/web/app/(resident)/payments/page.tsx` sends `offer=${payment.offerId}` but checkout expects `offerId`. Fix: change payments page to use `offerId=${payment.offerId}`.
