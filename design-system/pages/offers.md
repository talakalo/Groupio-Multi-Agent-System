# Offers List Page — Design Spec

> Route: `/offers` (`apps/web/app/(resident)/offers/page.tsx`)
> Priority: **P0 — Highest**

---

## Current State

- Search bar + filters
- Offer card grid (OfferCard components)
- Empty state when no results

## Current UX Problems

1. **Filters are basic** — no category chips for quick filtering
2. **No "recommended for your building"** section
3. **No savings-first framing** — offers show price but not savings prominently
4. **Card design doesn't highlight urgency** — no "X spots left" or "ends in Y days"
5. **No sorting options visible** — user can't sort by savings, popularity, or recency
6. **No pagination or infinite scroll** indicator
7. **Missing offer count** — user doesn't know how many offers exist
8. **No map/region view** — all offers look identical regardless of proximity

## Redesign Goals

- Make offer discovery **fast and intuitive**
- Lead with **savings and social proof** (how many joined, how much saved)
- Add **urgency signals** where relevant
- **Category-first browsing** with chips/tabs
- Clear **sort + filter** controls
- Building-relevant offers at the top

## Recommended Layout

### Header
- Page title: "הצעות קבוצתיות" with result count (42 הצעות)
- Sort control: פופולריות | חדש | חיסכון גבוה | מחיר נמוך

### Category Chips (horizontal scroll)
- אינסטלציה | חשמל | איטום | ניקיון | שיפוצים | גינון | מעליות | כללי
- "הכל" chip as default selected
- Chip with count badge: "איטום (8)"

### Building Offers Section (if applicable)
- "הצעות לבניין שלך" heading
- 1-3 building-specific offers highlighted with primary-50 bg
- Separator

### All Offers Grid
- 3-col on desktop, 2-col on tablet, 1-col on mobile
- Each card shows: category icon, title, contractor (verified badge), price range, savings %, participants/capacity, "הצטרפו" CTA
- Cards with < 20% capacity remaining show "X מקומות אחרונים!" badge

### Filters Panel (sidebar on desktop, bottom sheet on mobile)
- Category (multi-select)
- Price range (slider)
- Region
- Min savings %
- Contractor rating
- Availability (spots remaining)

### Pagination
- "טעינת עוד הצעות" button (load more pattern)
- Result count updates

## Key Components

- `OfferCard` (enhanced — add urgency badge, savings highlight, progress bar)
- `CategoryChips` — horizontal scrollable category filter
- `SortControl` — dropdown or segmented control
- `FilterPanel` — sidebar/bottom sheet filter form
- `EmptyState` (existing)

## Offer Card Enhancement Spec

```
┌─────────────────────────────────┐
│ [Category Icon]  איטום גגות     │
│ שם הקבלן ✓ מאומת               │
│                                 │
│ ₪2,880 / דירה     ← accent-600 │
│ ₪4,800 ←line-through gray-400  │
│ 40% חיסכון        ← accent bg  │
│                                 │
│ ████████░░  18/25 הצטרפו        │
│                                 │
│ [הצטרפו להצעה]    CTA button   │
│ 7 מקומות אחרונים!  ← warning   │
└─────────────────────────────────┘
```

## States

- **Loading**: Skeleton grid (6 skeleton cards)
- **Empty (no results)**: "לא נמצאו הצעות" + suggestion to adjust filters
- **Empty (no offers at all)**: "אין הצעות זמינות כרגע — נעדכן אתכם!" + notification opt-in
- **Error**: Retry banner
- **Filtering**: Spinner overlay on grid, filters remain interactive

## Mobile Notes

- Category chips: horizontal scroll with fade gradient at edges
- Filter: icon button → opens bottom sheet
- Sort: dropdown above grid
- Cards: full-width, stacked
- Pull-to-refresh

## RTL Notes

- Category chips scroll from right
- Prices right-aligned, savings badge on left
- Progress bar fills right-to-left
- Filter panel slides from right (RTL logical end)
