# Admin Dashboard — Design Spec

> Route: `/dashboard` (`apps/admin/app/dashboard/page.tsx`)
> Priority: **P1 — High**

---

## Current State

- System health indicators
- Metrics: revenue, active offers, contractors, open tickets, pending vetting
- Agent performance cards
- Recent escalations list
- Activity log

## Current UX Problems

1. **Admin app has no RTL support** — direction is LTR only
2. **Color system diverges from web app** — indigo vs sky blue
3. **Agent cards dominate** — AI operations visible but business metrics less so
4. **No quick action panel** — admin can't quickly jump to common tasks
5. **Pending vetting is a metric only** — should be actionable (click → go to vetting queue)
6. **Escalations list is basic** — no priority indicators inline
7. **Activity log is a text list** — no grouping, no filtering
8. **No "needs attention" hierarchy** — everything at same visual weight
9. **Fonts not explicitly loaded** — Inter and JetBrains Mono referenced but not imported via next/font
10. **No responsive design consideration** — admin may use tablets

## Redesign Goals

- **Operational clarity** — what needs attention NOW
- **Clickable metrics** — every stat links to its detail page
- **Attention hierarchy** — urgent items first, informational last
- **Unified color system** with role-specific accent (indigo for admin)
- **RTL support** — even if admin is often in English
- **Better agent monitoring** — useful but secondary to business operations

## Recommended Layout

### Attention Bar (conditional)
- Urgent: open escalations count (red badge)
- Action needed: pending contractor vetting count
- System: degraded agents or high error rates

### Business Metrics Row (4–5 cards)
1. **הכנסות החודש** — ₪XX,XXX with trend
2. **הצעות פעילות** — count with new this week
3. **קבלנים ממתינים לאימות** — count → links to vetting
4. **פניות פתוחות** — escalation count → links to escalations
5. **משתמשים חדשים** — this week count

Each card is clickable → navigates to relevant page.

### Two-Column Layout (desktop)

#### Left: Operational

**Pending Actions Queue**
- Top 5 items needing admin action:
  - Contractor verification requests
  - Escalations awaiting response
  - Payment releases pending
  - Flagged offers
- Each with: type badge, description, age, CTA

**Recent Escalations**
- Compact table: priority, subject, agent, age, status
- "ראו הכל" link

#### Right: System Health

**Agent Performance**
- Compact agent status grid: name, status dot, avg response, error rate
- Expand for chart
- "ניהול סוכנים" link

**Activity Feed**
- Recent system events with timestamps
- Filter: all, users, payments, offers, agents

### Quick Actions Bar
- אימות קבלנים
- ניהול תשלומים
- ניהול הצעות
- הגדרות מערכת

## Key Components

- `AttentionBar` — urgent items banner
- `MetricCard` (existing, enhance with click-through)
- `PendingActionsQueue` — prioritized action list
- `EscalationsTable` (existing, compact variant)
- `AgentStatusGrid` — compact agent monitoring
- `ActivityFeed` — filtered event timeline
- `QuickActionsBar` — admin shortcuts

## States

- **Loading**: Skeleton dashboard
- **Healthy**: Normal operational view
- **Alerts**: Attention bar with urgent items
- **System degraded**: Agent health warnings prominent
- **Error**: API failure banner with retry

## Mobile / Tablet Notes

- Stack columns vertically
- Metrics: 2x2 grid
- Pending actions: full-width list
- Agent grid: horizontal scroll

## RTL Notes

- Admin should support both RTL and LTR (Hebrew and English)
- Use logical CSS properties
- Currently no RTL support — needs to be added
