# Contractor Dashboard — Design Spec

> Route: `/contractor/dashboard` (`apps/web/app/contractor/dashboard/page.tsx`)
> Priority: **P1 — High**

---

## Current State

- Stats: active offers, completed projects, total revenue, rating
- Trust score with breakdown (license, insurance, experience, reputation, completion, response)
- Pending offers list
- AI assistant (AIChat component)
- Active projects grid

## Current UX Problems

1. **Dashboard is dense but not actionable** — lots of info but unclear "what to do next"
2. **Trust score breakdown is overwhelming** — 6 dimensions shown at once
3. **Pending offers and active projects compete** for attention without clear priority
4. **No earnings overview** — revenue number alone isn't useful without trends
5. **No notification center** — contractor can't see what needs attention
6. **AI Chat takes up sidebar space** — useful but should be optional/minimized
7. **Hardcoded sky-500 colors** — should use role-specific accent
8. **No document request alerts** — if admin requested docs, it should be prominent
9. **No calendar/timeline view** for upcoming projects
10. **Loading is generic spinner** — should use skeleton

## Redesign Goals

- **Action-oriented dashboard** — "needs attention" items first
- **Earnings clarity** — revenue trends, not just totals
- **Trust score as progress** — what to improve for better ranking
- **Project timeline** — what's coming up
- **Document/verification status** — prominent if action needed

## Recommended Layout

### Attention Bar (conditional)
- If admin requested documents: prominent banner "נדרש להעלות מסמכים — השלימו לפני [תאריך]"
- If offers need response: "X הצעות ממתינות לתגובה"
- If profile incomplete: "השלימו את הפרופיל שלכם"
- Dismissable but persistent until resolved

### Stats Row (4 cards, 2-col on mobile)
1. **הכנסה החודש** — ₪XX,XXX with trend arrow (vs last month)
2. **הצעות פעילות** — X active offers
3. **פרויקטים בתהליך** — X in-progress projects
4. **דירוג ממוצע** — ⭐ X.X with review count

### Trust Score Card
- Compact: overall score (e.g., 85/100) with "מה לשפר?" link
- Expanded (on click): breakdown bars for each dimension
- Actionable: each low dimension links to how to improve it

### My Offers Section
- Tab toggle: "ממתינות" | "פעילות" | "הושלמו"
- Compact offer rows: title, participants, revenue, status, CTA
- "צרו הצעה חדשה" button

### Upcoming Projects
- Timeline view: next 30 days
- Project cards with: name, address, date, status, participant count
- Empty: "אין פרויקטים קרובים"

### Quick Actions
- Create new offer
- View earnings report
- Update profile / upload documents
- Contact support

### AI Assistant (minimized)
- Collapsed bar: "יש לכם שאלה?" — expands to AIChat
- Or: floating action button

## Key Components

- `AttentionBanner` — conditional alert for required actions
- `ContractorStats` — enhanced stat cards with trends
- `TrustScoreCard` — compact with expandable breakdown
- `OfferCard` (existing, `variant="contractor"`)
- `ProjectTimeline` — upcoming projects timeline
- `QuickActionsGrid` — action shortcuts
- `AIChatMinimized` — collapsed AI assistant

## States

- **Loading**: Skeleton dashboard
- **New contractor (no data)**: Onboarding checklist — create first offer, complete profile, upload docs
- **Active contractor**: Full dashboard
- **Suspended contractor**: Warning banner, limited actions
- **Error**: Retry banner

## Mobile Notes

- Stats: 2x2 grid
- Attention bar: full-width, swipeable if multiple
- Offers: tabs + scrollable list
- Projects: vertical timeline
- AI chat: floating button

## RTL Notes

- Stats flow right-to-left
- Trust score bar fills right-to-left
- Timeline reads top-to-bottom
- Revenue amounts use LTR embed
