# Groupio Navigation Redesign

> Companion to: `design-system/MASTER.md`

---

## Current Navigation Audit

### Problems Found

1. **Resident sidebar** has "ארכיטקטורה" (architecture) link — irrelevant to residents
2. **No mobile bottom navigation** — hamburger menu only; mobile users need persistent nav
3. **Contractor nav** has 5 items — fine, but "create offer" should be a prominent CTA, not just a nav item
4. **Buildings Manager nav** has only 3 items — too sparse, no building-specific navigation
5. **Admin nav** has 8 items with no grouping — cognitive overload
6. **No breadcrumbs** on any inner pages
7. **Settings/account access** is inconsistent across roles
8. **No notification indicator** in navigation (exists in layout but not in nav items)
9. **Language toggle** exists but isn't in a consistent location
10. **Unverified email banner** is a good pattern but takes persistent space

---

## Proposed Navigation: Resident

### Desktop Sidebar (260px)

```
┌──────────────────────┐
│  🏠 Groupio Logo     │
│──────────────────────│
│                      │
│  📊 דשבורד           │  /dashboard
│  🏷️ הצעות            │  /offers
│  📦 הזמנות           │  /orders
│  🏢 הבניין שלי        │  /building
│  💬 עוזר חכם         │  /chat
│                      │
│──────────────────────│
│  SECONDARY           │
│  💳 תשלומים          │  /payments
│  👷 קבלנים           │  /contractors
│                      │
│──────────────────────│
│  ⚙️ פרופיל           │  /profile
│  🌐 EN | עב          │  Language toggle
│  🚪 התנתקות          │  Logout
└──────────────────────┘
```

### Mobile Bottom Navigation (5 items max)

```
┌─────────────────────────────────┐
│  דשבורד  │  הצעות  │  הזמנות  │  בניין  │  עוד  │
│    📊    │   🏷️   │   📦    │   🏢   │   ⋯   │
└─────────────────────────────────┘
```

"עוד" (More) opens a bottom sheet with:
- עוזר חכם
- תשלומים
- קבלנים
- פרופיל
- שפה
- התנתקות

### Changes from Current

- **Removed**: "ארכיטקטורה" (not relevant to residents)
- **Added**: "הזמנות" to primary nav (orders are central to experience)
- **Moved**: "קבלנים" to secondary (less frequent action)
- **Moved**: "תשלומים" to secondary (reference, not primary action)
- **Added**: Mobile bottom nav (previously hamburger only)
- **Merged**: Change password into profile security tab

---

## Proposed Navigation: Contractor

### Desktop Sidebar (260px)

```
┌──────────────────────┐
│  🏠 Groupio Logo     │
│  [שם העסק]  ✓ מאומת  │
│──────────────────────│
│                      │
│  📊 דשבורד           │  /contractor/dashboard
│  🏷️ ההצעות שלי       │  /contractor/offers/active
│  📋 פרויקטים         │  /contractor/projects
│                      │
│  ┌──────────────────┐│
│  │ + צרו הצעה חדשה  ││  /contractor/offers/create
│  └──────────────────┘│  (Primary CTA button, not nav item)
│                      │
│──────────────────────│
│  💬 עוזר חכם         │  AI chat (if available for contractors)
│  ⚙️ פרופיל ומסמכים   │  /contractor/profile
│  🌐 EN | עב          │  Language toggle
│  🚪 התנתקות          │  Logout
└──────────────────────┘
```

### Mobile Bottom Navigation

```
┌──────────────────────────────────────┐
│  דשבורד  │  הצעות  │  + חדש  │  פרויקטים  │  עוד  │
│    📊    │   🏷️   │   ➕   │    📋     │   ⋯   │
└──────────────────────────────────────┘
```

### Changes from Current

- **"Create Offer"** is now a prominent CTA button in sidebar (not just a nav link)
- **Mobile**: "Create" gets center position (like Instagram's create button)
- **Profile**: renamed to "פרופיל ומסמכים" to signal document management
- **Business name + verified badge** shown in sidebar header

---

## Proposed Navigation: Buildings Manager

### Desktop Sidebar (260px)

```
┌──────────────────────┐
│  🏠 Groupio Logo     │
│  מנהל בניינים        │
│──────────────────────│
│                      │
│  📊 דשבורד           │  /buildings-manager/dashboard
│  🏢 בניינים          │  /buildings-manager/buildings
│  🏷️ הצעות פעילות     │  (new: building offers view)
│  ⚠️ פניות            │  /buildings-manager/escalations
│                      │
│──────────────────────│
│  ⚙️ הגדרות           │  Settings
│  🌐 EN | עב          │
│  🚪 התנתקות          │
└──────────────────────┘
```

### Changes from Current

- **Added**: "הצעות פעילות" — BMs should see offers relevant to their buildings
- **Renamed**: "פניות" (escalations → more user-friendly Hebrew)
- **Escalation badge**: show count of open escalations

---

## Proposed Navigation: Admin

### Desktop Sidebar (260px, collapsible with icons)

```
┌──────────────────────┐
│  🏠 Groupio Admin    │
│  [Admin Name]        │
│──────────────────────│
│  OPERATIONS          │
│  📊 דשבורד           │  /dashboard
│  👷 אימות קבלנים     │  /contractors
│  ⚠️ פניות            │  /escalations
│  💳 תשלומים          │  /payments
│                      │
│  MANAGEMENT          │
│  🏷️ הצעות            │  /offers
│  👥 משתמשים          │  /users
│                      │
│  SYSTEM              │
│  🤖 סוכנים           │  /agents
│  📈 אנליטיקס         │  /analytics
│  ⚙️ הגדרות           │  /settings
└──────────────────────┘
```

### Changes from Current

- **Grouped into sections**: Operations, Management, System — reduces cognitive load
- **Reordered by frequency**: vetting and escalations first (most frequent admin tasks)
- **Badge counts**: escalations (open), contractors (pending vetting), payments (pending release)
- **Collapsible sidebar**: icon-only mode for more workspace (existing in AdminShell)

---

## Breadcrumbs

Add breadcrumbs to all detail/inner pages:

| Page | Breadcrumb |
|------|-----------|
| Offer detail | הצעות > [קטגוריה] > [שם ההצעה] |
| Checkout | הצעות > [שם ההצעה] > תשלום |
| Order detail | הזמנות > [מספר הזמנה] |
| Building page | הבניין שלי |
| Contractor profile (resident view) | קבלנים > [שם הקבלן] |
| Project detail (contractor) | פרויקטים > [שם הפרויקט] |
| Admin contractor detail | אימות קבלנים > [שם הקבלן] |

Implementation: `Breadcrumb` component with `items: { label: string, href?: string }[]`

---

## CTA Placement Rules

| Context | CTA | Position |
|---------|-----|----------|
| Resident dashboard | "צפו בהצעות" | Quick actions + offers section |
| Offers list | "הצטרפו" per card | Card bottom |
| Offer detail | "הצטרפו להצעה" | Sticky sidebar (desktop), sticky bottom bar (mobile) |
| Checkout | "שלמו ₪X,XXX" | Bottom of payment form |
| Contractor dashboard | "צרו הצעה חדשה" | Quick actions + sidebar CTA |
| Admin contractors | "אשרו" / "בקשו מסמכים" | Per-row actions + bulk bar |
| Landing page | "התחלת חיסכון" | Hero + bottom CTA section |

---

## Notification Indicators

| Location | Badge Type |
|----------|-----------|
| Sidebar "הזמנות" (resident) | Count of active orders |
| Sidebar "ההצעות שלי" (contractor) | Count of pending offers |
| Sidebar "פניות" (admin/BM) | Count of open escalations |
| Sidebar "אימות קבלנים" (admin) | Count of pending verifications |
| Sidebar "תשלומים" (admin) | Count of pending releases |
| Header bell icon | Total unread notifications |

---

## Hidden Pages (No Nav Entry)

These pages exist but don't need dedicated nav slots:

- `/verify-email` — accessed via email link
- `/reset-password` — accessed via email link
- `/resend-verification` — linked from login/verify error states
- `/forgot-password` — linked from login page
- `/building/join` — linked from onboarding or building page
- `/terms` — linked from footer
- `/privacy` — linked from footer
- `/architecture` — should be removed from resident app or moved to docs
- `/change-password` — merge into profile security tab
