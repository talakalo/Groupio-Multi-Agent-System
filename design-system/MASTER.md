# Groupio Design System — MASTER

> Version: 1.1.0
> Last updated: 2026-03-16
> Status: Implementation-ready specification
> Stack: Next.js 14 + React + Tailwind CSS + lucide-react
> Backend: Python + FastAPI + PostgreSQL + LangGraph (11 AI agents)

### Document Index

| Document | Contents |
|----------|----------|
| **MASTER.md** (this file) | Design tokens, component specs, trust framework, anti-patterns |
| **BACKEND.md** | Full backend architecture — API (130+ endpoints, 17 modules), services (8), auth, middleware, infra, CI/CD (8 workflows), testing, monitoring |
| **AGENTS.md** | Agent system UX — all 11 agents, LangGraph orchestration, admin UI, pending decisions, trust communication |
| **DATABASE.md** | Database schema → UI mapping — 21 tables, all fields, data flow to components, missing models |
| **MOBILE.md** | Mobile app (Expo) — 8 screens, components, themes, API integration, RTL, gaps vs web (30% coverage) |
| **INFRASTRUCTURE.md** | Cross-cutting: i18n (450 keys), PWA/manifest, SEO, error/loading pages, RAG pipeline, shared packages, scripts, Storybook, env config |
| **ROUTES.md** | Route-by-route redesign plan with priorities (40+ routes across 4 roles) |
| **NAVIGATION.md** | Navigation redesign per role — sidebar, mobile nav, breadcrumbs, CTAs, notification indicators |
| **COMPONENTS.md** | Component library map — 40+ components with variants, states, accessibility, data sources |
| **IMPLEMENTATION.md** | 3-phase implementation plan with file-level changes and ROI ranking |
| **pages/*.md** | Per-page detailed design specs (8 critical screens) |

---

## 1. Executive Design Direction

### Product Pattern: **Trusted Marketplace**

Groupio is a residential group-buying marketplace. The correct design archetype is a **community-backed commerce platform** — blending marketplace trust mechanics (Airbnb, Thumbtack) with local-community warmth (Nextdoor) and clear transactional UX (Stripe, Lemonade).

### Style Family: **Clean Commercial**

| Attribute | Direction |
|-----------|-----------|
| Tone | Professional yet approachable; warm but not casual |
| Density | Medium — enough whitespace for trust, enough density for utility |
| Polish | High — premium feel without luxury exclusivity |
| Personality | Reliable neighbor, not corporate robot |
| Mood | Confident, transparent, community-oriented |

### Why This Fits Groupio

- Residents need to **trust** before spending money on group deals
- Contractors need to feel **professional** — this is their business tool
- Building managers need **operational clarity** — not decoration
- Admins need **density and efficiency** — dashboard patterns
- The product handles real money (escrow, payments) — must feel **secure**
- Hebrew-first RTL demands **strong typographic hierarchy** and generous spacing

---

## 2. Color System

### Primary Palette

The current sky-blue primary is too generic and cold for a community marketplace. Shift to a warmer, more trustworthy blue-teal that feels both professional and community-oriented.

```
primary-50:  #f0f9f6    (backgrounds, subtle fills)
primary-100: #d1f0e6    (hover backgrounds, borders)
primary-200: #a3e1cd    (light accents)
primary-300: #6ec9ad    (secondary interactive)
primary-400: #3fb08f    (hover states)
primary-500: #1a9a76    (primary CTA, links, active states)
primary-600: #147a5e    (pressed states)
primary-700: #105f49    (text on light backgrounds)
primary-800: #0d4938    (dark emphasis)
primary-900: #0a3329    (headings, high contrast)
primary-950: #061f19    (near-black text)
```

### Secondary / Accent

Warm amber for urgency, promotions, and conversion moments.

```
accent-50:  #fffbeb
accent-100: #fef3c7
accent-200: #fde68a
accent-300: #fcd34d
accent-400: #fbbf24
accent-500: #f59e0b    (CTAs, savings highlights, badges)
accent-600: #d97706
accent-700: #b45309
accent-800: #92400e
accent-900: #78350f
accent-950: #451a03
```

### Semantic Colors

```
success-50:  #f0fdf4    success-500: #22c55e    success-700: #15803d
warning-50:  #fffbeb    warning-500: #f59e0b    warning-700: #b45309
error-50:    #fef2f2    error-500:   #ef4444    error-700:   #b91c1c
info-50:     #eff6ff    info-500:    #3b82f6    info-700:    #1d4ed8
```

### Neutrals

```
gray-50:  #f9fafb    (page backgrounds)
gray-100: #f3f4f6    (card backgrounds, dividers)
gray-200: #e5e7eb    (borders, separators)
gray-300: #d1d5db    (disabled borders)
gray-400: #9ca3af    (placeholder text, disabled text)
gray-500: #6b7280    (secondary text)
gray-600: #4b5563    (body text)
gray-700: #374151    (primary text)
gray-800: #1f2937    (headings)
gray-900: #111827    (high-emphasis text)
gray-950: #030712    (near-black)
```

### Surface Colors

```
surface-white:  #ffffff    (cards, modals, popovers)
surface-page:   #f9fafb    (page background)
surface-subtle: #f3f4f6    (secondary containers)
surface-muted:  #e5e7eb    (inactive/disabled containers)
```

### Role-Specific Accent (Optional — Applied via Layout)

| Role | Accent |
|------|--------|
| Resident | primary (teal) |
| Contractor | `#2563eb` (blue-600 — professional) |
| Buildings Manager | `#059669` (emerald-600 — operational) |
| Admin | `#4f46e5` (indigo-600 — authority) |

### Usage Rules

- Primary for CTAs, links, active navigation, focus rings
- Accent (amber) for savings badges, urgency, promotion callouts, pricing highlights
- Never use accent as a CTA background — it's for attention, not action
- Semantic colors only for their designated purpose (success, warning, error, info)
- Gray-700 for body text; gray-800 for headings; gray-500 for secondary/muted text
- Cards always `surface-white` with `gray-200` border or `shadow-sm`

### Anti-Patterns

- ❌ Sky-blue + violet gradient (current) — too SaaS/AI; not marketplace
- ❌ Neon gradients — crypto aesthetic
- ❌ Pure white backgrounds with no borders — cards lose definition
- ❌ More than 2 saturated colors on any screen
- ❌ Gradient text except on hero headlines

---

## 3. Typography

### Font Stack

| Context | Font | Weight Range | Notes |
|---------|------|-------------|-------|
| Hebrew (primary) | **Heebo** | 400, 500, 600, 700 | Clean, excellent Hebrew rendering |
| Latin / Numbers | **Inter** | 400, 500, 600, 700 | Pairs well with Heebo |
| Monospace (admin) | **JetBrains Mono** | 400, 500 | Code, IDs, logs |

### Type Scale

| Token | Size | Line Height | Weight | Usage |
|-------|------|------------|--------|-------|
| `display-lg` | 36px / 2.25rem | 1.2 | 700 | Hero headline |
| `display-sm` | 30px / 1.875rem | 1.2 | 700 | Page titles |
| `heading-lg` | 24px / 1.5rem | 1.3 | 600 | Section headings |
| `heading-md` | 20px / 1.25rem | 1.35 | 600 | Card titles, modal titles |
| `heading-sm` | 18px / 1.125rem | 1.4 | 600 | Subsection headings |
| `body-lg` | 16px / 1rem | 1.6 | 400 | Primary body text |
| `body-md` | 14px / 0.875rem | 1.5 | 400 | Secondary body, descriptions |
| `body-sm` | 13px / 0.8125rem | 1.5 | 400 | Captions, meta text |
| `label` | 14px / 0.875rem | 1.4 | 500 | Form labels, nav items |
| `caption` | 12px / 0.75rem | 1.4 | 400 | Timestamps, footnotes, badges |
| `overline` | 11px / 0.6875rem | 1.5 | 600 | Category labels, section dividers |

### Hebrew Typography Rules

- Default `text-align: right` in RTL context
- Heebo renders best at 400+ weight — avoid 300 for body text
- Hebrew body text benefits from slightly larger line-height (1.6) vs Latin (1.5)
- Use `font-feature-settings: "liga" 1` for proper ligatures
- Numbers always render LTR within RTL text — use `direction: ltr; unicode-bidi: embed` for phone numbers, prices
- Price rendering: `₪XXX` with LTR embed inside RTL flow

### Anti-Patterns

- ❌ Font weight 300 for Hebrew body text (too thin)
- ❌ Line-height below 1.4 for Hebrew
- ❌ More than 3 font sizes on a single card
- ❌ ALL CAPS for Hebrew text (Hebrew has no uppercase — meaningless)
- ❌ Tight letter-spacing for Hebrew (degrades readability)

---

## 4. Spacing Scale

Based on a 4px grid (0.25rem base unit).

| Token | Value | Usage |
|-------|-------|-------|
| `space-0` | 0px | — |
| `space-0.5` | 2px | Inline icon offset |
| `space-1` | 4px | Tight padding, icon gaps |
| `space-1.5` | 6px | Compact list items |
| `space-2` | 8px | Inner card padding (compact), badge padding |
| `space-3` | 12px | Form field gaps, small card padding |
| `space-4` | 16px | Standard card padding, section gaps |
| `space-5` | 20px | — |
| `space-6` | 24px | Card internal sections, form groups |
| `space-8` | 32px | Section separators, major card padding |
| `space-10` | 40px | Page section gaps |
| `space-12` | 48px | Major page sections |
| `space-16` | 64px | Hero padding, page-level breathing room |
| `space-20` | 80px | Landing page section separation |
| `space-24` | 96px | Maximum section padding |

### Spacing Rules

- Card padding: `space-4` (compact) or `space-6` (standard)
- Card gap in grids: `space-4` or `space-6`
- Form field vertical gap: `space-4`
- Form group gap: `space-6` to `space-8`
- Page container horizontal padding: `space-4` (mobile) → `space-6` (tablet) → `space-8` (desktop)
- Section vertical padding: `space-10` (mobile) → `space-16` (desktop)

---

## 5. Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `radius-none` | 0px | — |
| `radius-sm` | 4px | Badges, small tags |
| `radius-md` | 6px | Inputs, buttons, small cards |
| `radius-lg` | 8px | Cards, modals, dropdowns |
| `radius-xl` | 12px | Feature cards, hero sections |
| `radius-2xl` | 16px | Large promotional cards, image containers |
| `radius-full` | 9999px | Avatars, pills, circular buttons |

### Radius Rules

- Buttons: `radius-md` (6px)
- Inputs: `radius-md` (6px)
- Cards: `radius-lg` (8px)
- Modals: `radius-xl` (12px)
- Badges/pills: `radius-full`
- Avatars: `radius-full`
- Current `4xl: 2rem` is too rounded for a marketplace — reduce to `radius-xl` max

### Anti-Patterns

- ❌ `border-radius: 2rem` on cards (current `rounded-4xl`) — too bubbly, reduces trust
- ❌ Mixed radius styles on the same screen
- ❌ Sharp corners (0px) on interactive elements

---

## 6. Elevation / Shadow System

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-none` | none | Flat elements |
| `shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Subtle lift (badges, inline cards) |
| `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | Cards at rest |
| `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Cards on hover, dropdowns |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Modals, popovers |
| `shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | Floating action menus |

### Elevation Rules

- Cards: `shadow-sm` default → `shadow-md` on hover
- Modals: `shadow-lg`
- Dropdowns/popovers: `shadow-md`
- Sticky headers: `shadow-xs` on scroll
- Never stack shadows — one element, one shadow level
- Use border (`gray-200`) + shadow for card definition at rest

---

## 7. Iconography

### Library: `lucide-react`

- Keep using lucide-react for consistency
- Default icon size: 20px (`w-5 h-5`) for inline, 24px (`w-6 h-6`) for standalone
- Icon color: inherit from text color, or `gray-500` for decorative
- Navigation icons: 20px, `stroke-width: 1.75`
- Stat card icons: 24px in colored circle container (40px)
- Empty state icons: 48px–64px, `gray-300`

### RTL Icon Rules

- Directional icons (arrows, chevrons) must flip in RTL using `.rtl-flip` or `[dir="rtl"]:rotate-180`
- Non-directional icons (home, settings, search) do NOT flip
- Icons that imply reading direction (list, text) flip
- Icons that imply physical direction (phone, download) do NOT flip

### Trust Iconography

- Verified contractor: `ShieldCheck` in primary-500
- Escrow protected: `Lock` in primary-500
- License verified: `BadgeCheck` in success-500
- Insurance: `ShieldAlert` in info-500
- Group discount: `Users` in accent-500
- Savings: `TrendingDown` in success-500

---

## 8. Motion / Animation

### Principles

- Motion serves function — never decoration
- Fast for micro-interactions (150–200ms)
- Moderate for transitions (250–350ms)
- Ease-out for entrances, ease-in for exits
- No motion on initial page load (except hero if needed)
- Respect `prefers-reduced-motion`

### Tokens

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `transition-fast` | 150ms | ease-out | Button hover, focus, toggle |
| `transition-base` | 200ms | ease-out | Card hover, dropdown open |
| `transition-slow` | 300ms | ease-out | Modal open/close, page transitions |
| `transition-spring` | 350ms | cubic-bezier(0.34, 1.56, 0.64, 1) | Toast entrance, notification pop |

### Specific Animations

- **Card hover**: `transform: translateY(-2px)` + `shadow-md` at 200ms
- **Modal open**: fade-in backdrop (200ms) + slide-up content (250ms)
- **Modal close**: fade-out (150ms)
- **Toast enter**: slide-in from top + fade (300ms spring)
- **Toast exit**: fade-out + slide-up (200ms ease-in)
- **Skeleton shimmer**: linear gradient sweep, 1.5s infinite
- **Loading spinner**: rotate 360deg, 600ms linear infinite
- **Tab switch**: opacity crossfade (200ms)

### Anti-Patterns

- ❌ Bounce animations (childish)
- ❌ Parallax scrolling (disorienting in RTL)
- ❌ Auto-playing carousels
- ❌ Animation duration > 400ms for any micro-interaction
- ❌ Scale transforms on cards (distorts text)

---

## 9. Accessibility Rules

### WCAG 2.1 AA Compliance

- All text: minimum 4.5:1 contrast ratio against background
- Large text (18px+ or 14px+ bold): minimum 3:1 contrast ratio
- Interactive elements: minimum 44x44px touch target (mobile)
- Focus visible: 2px outline, `primary-500`, 2px offset
- All images: `alt` text required
- All form inputs: associated `<label>` element
- Error messages: programmatically associated with input (`aria-describedby`)
- Modals: focus trap, `Escape` to close, `aria-modal="true"`
- Loading states: `aria-busy="true"`, `aria-live="polite"` for dynamic content
- No color as sole indicator — always pair with icon/text

### Keyboard Navigation

- `Tab` order follows visual layout (no `tabindex` manipulation)
- `Enter`/`Space` activates buttons and links
- `Escape` closes modals, dropdowns, popovers
- Arrow keys navigate within tab groups, select options, sliders
- Skip-to-content link on every page

### Screen Reader

- Meaningful heading hierarchy (one `h1` per page)
- `aria-label` for icon-only buttons
- `aria-expanded` for collapsible sections
- `role="status"` for toast notifications
- Hebrew `lang="he"` attribute on body; English sections use `lang="en"`

---

## 10. Responsive Breakpoints

| Token | Width | Device Target |
|-------|-------|--------------|
| `mobile` | < 640px | Small phones |
| `sm` | 640px+ | Large phones |
| `md` | 768px+ | Tablets |
| `lg` | 1024px+ | Small laptops |
| `xl` | 1280px+ | Desktops |
| `2xl` | 1536px+ | Large desktops |

### Layout Rules

| Breakpoint | Container Max | Sidebar | Grid Columns |
|-----------|--------------|---------|-------------|
| mobile | 100% – 32px | Hidden (hamburger) | 1 |
| sm | 640px | Hidden (hamburger) | 1–2 |
| md | 768px | Hidden (hamburger) | 2 |
| lg | 1024px | Visible (240px) | 2–3 |
| xl | 1280px | Visible (260px) | 3–4 |
| 2xl | 1400px max | Visible (260px) | 3–4 |

### Mobile-First Rules

- All layouts start mobile, scale up
- Navigation: bottom sheet on mobile, sidebar on desktop
- Stat grids: 2-col on mobile, 4-col on desktop
- Cards: full-width stack on mobile, grid on desktop
- Tables: card-list on mobile, table on desktop
- Modals: full-screen sheet on mobile, centered on desktop

---

## 11. RTL / LTR Rules

### Base Direction

- Default: RTL (Hebrew is primary language)
- `<html dir="rtl" lang="he">`
- Switch to `dir="ltr" lang="en"` when user selects English

### Layout Mirroring

| Element | RTL | LTR |
|---------|-----|-----|
| Sidebar | Right side | Left side |
| Text alignment | Right | Left |
| Flex direction | Row-reverse (logical) | Row |
| Margin/Padding start | Right | Left |
| Icons (directional) | Mirrored | Normal |
| Progress bars | Right to left | Left to right |
| Breadcrumbs | Right to left | Left to right |

### Implementation

- Use Tailwind logical properties: `ps-*` / `pe-*` / `ms-*` / `me-*` / `start-*` / `end-*`
- Use `flex-row` (Tailwind auto-mirrors in RTL with CSS logical properties)
- For manual flip: `[dir="rtl"]:` prefix or `.rtl-flip` class
- Price format: `₪1,234` (symbol before number, LTR-embedded within RTL)
- Phone numbers: LTR-embedded
- Percentages: `40%` with LTR embed

### Testing Checklist

- [ ] All text aligns correctly in both directions
- [ ] Sidebar is on the correct side
- [ ] Directional icons flip
- [ ] Form labels align with inputs
- [ ] Breadcrumbs read in the correct direction
- [ ] Charts/graphs are not mirrored (data is universal)
- [ ] Number inputs allow LTR typing

---

## 12. Component Specifications

### 12.1 Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| `primary` | primary-500 | white | none | Main CTA: Join, Submit, Pay |
| `secondary` | white | primary-700 | primary-200 | Secondary action: Cancel, Back |
| `accent` | accent-500 | white | none | Conversion moments: savings, deals |
| `ghost` | transparent | gray-700 | none | Tertiary actions, in-card actions |
| `danger` | error-500 | white | none | Destructive: Delete, Remove |
| `outline` | transparent | gray-700 | gray-300 | Neutral alternative actions |

| Size | Height | Padding X | Font Size | Icon Size |
|------|--------|-----------|-----------|-----------|
| `sm` | 32px | 12px | 13px | 16px |
| `md` | 40px | 16px | 14px | 18px |
| `lg` | 48px | 24px | 16px | 20px |

| State | Modifier |
|-------|----------|
| Default | Base styles |
| Hover | Darken bg by one step (500→600), shadow-xs |
| Active/Pressed | Darken by two steps (500→700), translateY(1px) |
| Disabled | opacity-50, cursor-not-allowed |
| Loading | Spinner icon replacing text, opacity-75, pointer-events-none |

### 12.2 Form Inputs

| Element | Height | Border | Radius | Padding |
|---------|--------|--------|--------|---------|
| Text Input | 40px | gray-300 | radius-md | 12px 12px |
| Textarea | auto (min 120px) | gray-300 | radius-md | 12px 12px |
| Select | 40px | gray-300 | radius-md | 12px 36px 12px 12px |

| State | Border | Background | Ring |
|-------|--------|-----------|------|
| Default | gray-300 | white | none |
| Hover | gray-400 | white | none |
| Focus | primary-500 | white | primary-500/20 (3px) |
| Error | error-500 | error-50 | error-500/20 (3px) |
| Disabled | gray-200 | gray-50 | none |

### 12.3 Cards

| Variant | Background | Border | Shadow | Radius | Padding |
|---------|-----------|--------|--------|--------|---------|
| `default` | white | gray-200 | shadow-sm | radius-lg | space-4 to space-6 |
| `interactive` | white | gray-200 | shadow-sm → shadow-md hover | radius-lg | space-4 to space-6 |
| `highlighted` | primary-50 | primary-200 | shadow-sm | radius-lg | space-4 to space-6 |
| `stat` | white | gray-200 | shadow-xs | radius-lg | space-4 |

### 12.4 Badges

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `default` | gray-100 | gray-700 | none |
| `primary` | primary-50 | primary-700 | none |
| `success` | success-50 | success-700 | none |
| `warning` | warning-50 | warning-700 | none |
| `error` | error-50 | error-700 | none |
| `accent` | accent-50 | accent-700 | none |

Size: 24px height, padding `space-1 space-2`, `caption` font size, `radius-full`.

### 12.5 Modal / Dialog

| Property | Value |
|----------|-------|
| Backdrop | black/50 with blur(4px) |
| Container | white, shadow-lg, radius-xl |
| Width | sm: 400px, md: 520px, lg: 680px, full: 100vw |
| Max height | 85vh |
| Padding | space-6 |
| Header | heading-md, bottom border gray-100, padding-bottom space-4 |
| Footer | top border gray-100, padding-top space-4, right-aligned buttons |
| Mobile | Full-screen sheet (slide up from bottom) |
| Animation | fade-in backdrop 200ms, slide-up content 250ms |

### 12.6 Tables (Admin)

| Property | Value |
|----------|-------|
| Header | gray-50 bg, label font, gray-600 text, sticky |
| Row | white bg, bottom border gray-100 |
| Row hover | gray-50 bg |
| Cell padding | space-3 vertical, space-4 horizontal |
| Mobile | Convert to card list, stack columns vertically |

### 12.7 Empty States

| Property | Value |
|----------|-------|
| Container | centered, max-w-sm, padding space-12 |
| Icon | 48px, gray-300 |
| Title | heading-sm, gray-700, margin-top space-4 |
| Description | body-md, gray-500, margin-top space-2 |
| Action | primary button, margin-top space-6 |

---

## 13. Trust Framework

Trust is the #1 design priority for Groupio. Every screen that involves money, contractor selection, or commitment must reinforce trust.

### Trust Signals (Reusable Cluster)

| Signal | Icon | Text | When to Show |
|--------|------|------|-------------|
| Verified Contractor | `ShieldCheck` | "קבלן מאומת" | Offer cards, contractor profiles, checkout |
| Escrow Protected | `Lock` | "תשלום מוגן בנאמנות" | Checkout, payment pages, offer detail |
| Licensed | `BadgeCheck` | "בעל רישיון" | Contractor cards, offer detail |
| Insured | `Shield` | "מבוטח" | Contractor cards |
| Rating | `Star` | "4.8 (127 ביקורות)" | Contractor cards, offer detail |
| Group Size | `Users` | "24 דיירים הצטרפו" | Offer cards, offer detail |
| Money-Back | `RotateCcw` | "החזר כספי מובטח" | Checkout, pricing tiers |

### Trust Placement Rules

- Offer cards: show verified badge + group size + savings percentage
- Offer detail: full trust cluster (verified, licensed, insured, rating, group size, escrow)
- Checkout: escrow badge prominent above payment form
- Contractor profile: verification document status, trust score breakdown
- Landing page: trust section with aggregate stats

---

## 14. Anti-Patterns to Avoid

### Visual

- ❌ Gradient backgrounds on functional pages (reserve for hero/CTA only)
- ❌ Violet/purple accent (current) — not marketplace-appropriate
- ❌ `rounded-4xl` on cards (current) — too bubbly
- ❌ More than 2 brand colors visible simultaneously
- ❌ Decorative animations that don't serve UX
- ❌ Inconsistent card styles across pages
- ❌ Generic stock illustrations
- ❌ Shadows without borders (cards float without grounding)

### UX

- ❌ `window.location.reload()` after actions (current in contractor profile)
- ❌ `window.prompt()` for admin inputs (current in payments page)
- ❌ Hardcoded Hebrew strings outside i18n system
- ❌ Settings toggles that aren't wired to API
- ❌ Non-functional UI elements (deactivate button, request review)
- ❌ Missing loading/error/empty states
- ❌ URL parameter mismatches (current: `offer` vs `offerId` in checkout)
- ❌ Duplicate font loading (Google Fonts import + next/font)

### Architecture

- ❌ packages/ui components existing but not used in apps
- ❌ Each page reinventing badge/modal/table patterns
- ❌ Inconsistent color tokens between web and admin apps
- ❌ Layouts defined inline in route groups vs component files
- ❌ Mixed class-based and token-based styling approaches

---

## 15. Implementation Token Map

### Tailwind Config Alignment

The following tokens should be added/updated in both `apps/web/tailwind.config.ts` and `apps/admin/tailwind.config.ts` to create a unified design system:

```js
// Shared design tokens for tailwind.config.ts
{
  colors: {
    primary: {
      50: '#f0f9f6', 100: '#d1f0e6', 200: '#a3e1cd', 300: '#6ec9ad',
      400: '#3fb08f', 500: '#1a9a76', 600: '#147a5e', 700: '#105f49',
      800: '#0d4938', 900: '#0a3329', 950: '#061f19'
    },
    accent: {
      50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
      400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
      800: '#92400e', 900: '#78350f', 950: '#451a03'
    },
    success: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
    warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
    error:   { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
    info:    { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
    surface: { white: '#ffffff', page: '#f9fafb', subtle: '#f3f4f6', muted: '#e5e7eb' }
  },
  fontFamily: {
    heebo: ['var(--font-heebo)', 'sans-serif'],
    inter: ['var(--font-inter)', 'sans-serif'],
    mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
  },
  fontSize: {
    'display-lg': ['2.25rem', { lineHeight: '1.2', fontWeight: '700' }],
    'display-sm': ['1.875rem', { lineHeight: '1.2', fontWeight: '700' }],
    'heading-lg': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
    'heading-md': ['1.25rem', { lineHeight: '1.35', fontWeight: '600' }],
    'heading-sm': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
    'body-lg': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
    'body-md': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
    'body-sm': ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
    'label': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
    'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
    'overline': ['0.6875rem', { lineHeight: '1.5', fontWeight: '600' }]
  },
  borderRadius: {
    'sm': '4px', 'md': '6px', 'lg': '8px', 'xl': '12px', '2xl': '16px', 'full': '9999px'
  },
  boxShadow: {
    'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    'sm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
  },
  transitionDuration: {
    'fast': '150ms', 'base': '200ms', 'slow': '300ms'
  }
}
```

### CSS Variables (globals.css)

```css
:root {
  --sidebar-width: 260px;
  --sidebar-width-collapsed: 72px;
  --header-height: 64px;
  --page-max-width: 1400px;
  --card-radius: 8px;
  --transition-fast: 150ms;
  --transition-base: 200ms;
  --transition-slow: 300ms;
}
```
