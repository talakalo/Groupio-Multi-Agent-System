# Resident Dashboard — Design Spec

> Route: `/dashboard` (`apps/web/app/(resident)/dashboard/page.tsx`)
> Priority: **P0 — Highest**

---

## Current State

- Stats row: active offers, neighbors, savings (StatCard components)
- Recent activity list
- Quick actions grid
- Active offer cards

## Current UX Problems

1. **No personalization** — doesn't greet user or reference their building
2. **Stats are generic** — "active offers" count doesn't show value; "savings" needs ₪ amount
3. **No building context** — resident doesn't see their building's activity
4. **Quick actions are a grid** but lack visual priority — everything looks equally important
5. **No offer recommendations** — no personalized or building-relevant offers shown
6. **No onboarding completion prompt** — if profile incomplete, no nudge
7. **No escrow/payment status** — active orders not visible at a glance
8. **AI chat is absent** from dashboard (only on separate route)

## Redesign Goals

- Make the dashboard **building-aware** — "הבניין שלך" is the central context
- Show **personal savings and activity** prominently
- Surface **relevant offers** for this resident's building/area
- Provide **quick access to active orders** with status
- Gentle **onboarding completion** nudge if profile incomplete
- **Reduce navigation overhead** — the dashboard should answer "what should I do?"

## Recommended Layout

### Top Bar Context
- "שלום, [שם]" greeting
- Building name + address badge
- Unverified email banner if applicable (exists, keep)

### Stats Row (4 cards, 2-col on mobile)
1. **חיסכון אישי** — ₪X,XXX saved total (accent highlight)
2. **הצעות פעילות** — X active offers you've joined
3. **שכנים פעילים** — X neighbors in your building on Groupio
4. **הזמנות בתהליך** — X active orders with status summary

### My Building Section
- Building card: name, address, resident count, active offers count
- "הזמינו שכנים" CTA with invite code display
- Building activity feed (recent joins, new offers)

### Recommended Offers
- "הצעות מומלצות לבניין שלך" heading
- 2-3 OfferCards relevant to building/region
- "ראו את כל ההצעות →" link
- Empty state: "אין הצעות חדשות — נעדכן אתכם כשיופיעו"

### Active Orders
- Compact order list with status badges (pending, processing, completed)
- Click-through to order detail
- Empty state: "עדיין לא הצטרפתם להצעה — מומלץ לבדוק את ההצעות"

### Quick Actions (secondary)
- Browse offers
- Invite neighbors
- Chat with AI assistant
- View payment history

### AI Assistant Teaser (optional)
- Compact chat prompt: "יש לכם שאלה? העוזר החכם שלנו כאן"
- Opens chat panel or navigates to /chat

## Key Components

- `DashboardGreeting` — personalized header
- `StatCard` (existing, enhance with accent variant)
- `BuildingSummaryCard` — building context with invite
- `OfferCard` (existing, use `variant="resident"`)
- `ActiveOrdersList` — compact order cards
- `QuickActionsGrid` — icon + label action buttons
- `AIChatTeaser` — minimal chat prompt

## States

- **Loading**: Skeleton grid for stats, skeleton cards for offers/orders
- **Empty (new user)**: Onboarding completion prompt, invite neighbors CTA
- **Empty (no offers)**: "No offers available" with category preferences suggestion
- **Error**: Retry banner with "נסו שוב" button

## Mobile Notes

- Stats: 2x2 grid
- Building section: full-width card
- Offers: horizontal scroll or stacked
- Orders: compact list
- Quick actions: horizontal scroll row

## RTL Notes

- Greeting and building info right-aligned
- Stats cards flow right-to-left
- Order status badges on the left (start) side of each row
