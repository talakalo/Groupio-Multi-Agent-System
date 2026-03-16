# Groupio UI/UX Design Specification

> Principal Product Designer audit and redesign specification
> Version: 2.0.0 | Last updated: 2025-03-16
> Stack: Next.js 14 + React + Tailwind CSS + Expo (mobile)
> Backend: Python + FastAPI + PostgreSQL + LangGraph (11 AI agents)

---

## 1. Executive Design Summary

### Product Category Reasoning

Groupio is a **community-backed commerce platform** — a group-buying marketplace for residential buildings. The correct design archetype blends:

- **Marketplace trust mechanics** (Airbnb, Thumbtack) — verified contractors, ratings, escrow
- **Local-community warmth** (Nextdoor) — building identity, neighbor connection
- **Transactional clarity** (Stripe, Lemonade) — pricing tiers, payment flow, order tracking

### Recommended Design Direction

**Pattern**: Trusted Marketplace  
**Style Family**: Clean Commercial  

| Attribute | Direction |
|-----------|-----------|
| Tone | Professional yet approachable; warm but not casual |
| Density | Medium — whitespace for trust, density for utility |
| Polish | High — premium feel without luxury exclusivity |
| Personality | Reliable neighbor, not corporate robot |
| Mood | Confident, transparent, community-oriented |

### Why This Fits Groupio

- Residents must **trust** before spending money on group deals
- Contractors need a **professional** business tool
- Building managers need **operational clarity**, not decoration
- Admins need **density and efficiency** — dashboard patterns
- Real money (escrow, payments) demands a **secure** feel
- Hebrew-first RTL demands **strong typographic hierarchy** and generous spacing

---

## 2. Design System

```typescript
type DesignSystemSpec = {
  pattern: "Trusted Marketplace",
  styleFamily: "Clean Commercial",
  colorSystem: {
    primary: "#1a9a76",
    secondary: "#147a5e",
    accent: "#f59e0b",
    background: "#f9fafb",
    surface: "#ffffff",
    textPrimary: "#111827",
    textSecondary: "#4b5563",
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    border: "#e5e7eb"
  },
  typographySystem: {
    headingFamily: "'Heebo', 'Inter', sans-serif",
    bodyFamily: "'Heebo', 'Inter', sans-serif",
    monoFamily: "'JetBrains Mono', 'Fira Code', monospace",
    sizeScale: ["0.75rem", "0.875rem", "1rem", "1.125rem", "1.25rem", "1.5rem", "1.875rem", "2.25rem", "3rem"],
    weightScale: ["400", "500", "600", "700"],
    lineHeightRules: [
      "Headings: 1.25",
      "Body: 1.5",
      "Small text: 1.375",
      "Labels: 1.25"
    ]
  },
  spacingSystem: {
    scale: ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3rem", "4rem", "6rem", "8rem"],
    layoutSpacingRules: [
      "Page padding: 1rem (mobile) to 2rem (desktop)",
      "Section gaps: 1.5rem to 2rem",
      "Card internal padding: 1.5rem"
    ],
    sectionSpacingRules: [
      "Between major sections: 2rem",
      "Between subsections: 1.5rem",
      "Between related items: 0.75rem"
    ]
  },
  radiusSystem: {
    small: "4px",
    medium: "6px",
    large: "8px",
    xl: "12px"
  },
  elevationSystem: {
    card: "0 1px 3px rgba(0,0,0,0.1)",
    modal: "0 20px 25px -5px rgba(0,0,0,0.1)",
    dropdown: "0 10px 15px -3px rgba(0,0,0,0.1)",
    hover: "0 4px 6px -1px rgba(0,0,0,0.1)"
  },
  iconographyGuidelines: [
    "Use lucide-react consistently across web; MaterialCommunityIcons on mobile",
    "Icon size: 16px inline, 20px buttons, 24px standalone",
    "Match icon color to text hierarchy (primary, secondary, muted)",
    "RTL: directional icons (chevron, arrow) must flip"
  ],
  motionGuidelines: [
    "Transition duration: 150ms (micro), 200ms (standard), 300ms (emphasis)",
    "Easing: ease-in-out for most; cubic-bezier(0.34, 1.56, 0.64, 1) for spring",
    "Avoid excessive animations; prefer subtle hover/active feedback",
    "Loading: skeleton preferred over spinners for content areas"
  ],
  accessibilityRules: [
    "Focus-visible ring: 2px offset, primary color at 20% opacity",
    "Minimum touch target: 44x44px",
    "Color contrast: 4.5:1 body, 3:1 large text",
    "Labels must be associated with controls (htmlFor/id)",
    "Modal: focus trap, Escape closes, return focus on close"
  ],
  responsiveRules: [
    "Breakpoints: 640, 768, 1024, 1280, 1536px",
    "Mobile-first: base styles for mobile, sm/md/lg/xl for scale-up",
    "Sidebar collapses to bottom nav or drawer on <1024px",
    "Tables become cards on mobile"
  ],
  rtlRules: [
    "html default dir=rtl for Hebrew",
    "Input/textarea text-align: right",
    "Select background-position: left",
    "Logical properties (margin-inline-start, padding-inline-end)",
    "Flip directional icons and gradients"
  ],
  antiPatternsToAvoid: [
    "Crypto/Web3 aesthetic — no neon, gradients, glows",
    "Generic AI slop — no purple gradients, robot imagery",
    "Over-decorative — no excessive illustrations or patterns",
    "Concept-only — all specs must be implementable"
  ]
}
```

---

## 3. UX Strategy

```typescript
type UXStrategy = {
  residentPrinciples: [
    "Trust before action — show verification, ratings, escrow before join",
    "Clarity over cleverness — pricing tiers must be immediately understandable",
    "Building identity — surface building context in every relevant view",
    "Progressive disclosure — show essentials first, details on demand",
    "One-tap join where safe — reduce friction for trusted offers"
  ],
  contractorPrinciples: [
    "Professional tool — contractor sees a business dashboard, not consumer UI",
    "Document-first — verification status and documents prominent",
    "Create offer friction is acceptable — quality inputs over speed",
    "Analytics and outcomes visible — completed projects, ratings",
    "Support escalation path clear — when to reach admin/support"
  ],
  buildingsManagerPrinciples: [
    "Operational clarity — buildings list, escalations, status at a glance",
    "Resident context — who is in which building, join requests",
    "Minimal cognitive load — BM is part-time role",
    "Action-oriented — approve, assign, resolve with one action"
  ],
  adminPrinciples: [
    "Density over whitespace — admins need information density",
    "Efficient workflows — bulk actions, filters, keyboard shortcuts",
    "Agent visibility — AI agent status, pending decisions, activity log",
    "Audit trail — every action logged and traceable"
  ],
  trustPrinciples: [
    "Verification before prominence — unverified contractors get secondary treatment",
    "Escrow always visible at payment — build trust at conversion moment",
    "Ratings and reviews near contractor — social proof adjacent",
    "Trust badges on cards — verified, licensed, insured at a glance"
  ],
  conversionPrinciples: [
    "Primary CTA above fold on offers — Join / הצטרפו",
    "Pricing tiers with progress — show savings potential",
    "Urgency when appropriate — 'X places left' when capacity low",
    "Checkout trust sidebar — summary, escrow badge, contractor trust"
  ],
  pricingPresentationPrinciples: [
    "Base price + tier table — never hide pricing",
    "Per-unit clarity — what does the resident pay per person/unit",
    "Savings percentage when group grows — incentive to share",
    "No dark patterns — no pre-checked add-ons, no hidden fees"
  ],
  verificationPresentationPrinciples: [
    "Verified badge — green check, clear label",
    "Pending — amber, 'בדיקה' or 'ממתין לאימות'",
    "Unverified — muted, not hidden; explain path to verify",
    "Suspended — red, clear reason when appropriate"
  ],
  paymentPresentationPrinciples: [
    "Escrow badge at checkout — funds held until work complete",
    "Order timeline — pending → processing → released",
    "Payment method icons — recognizable (credit card, etc.)",
    "Receipt/invoice accessible post-payment"
  ]
}
```

---

## 4. Navigation Design

### Guest (Public)

```typescript
{
  role: "Guest",
  primaryNav: [
    { label: "דף הבית", route: "/", purpose: "Landing", priority: "High" },
    { label: "איך זה עובד", route: "/#how-it-works", purpose: "Explain product", priority: "High" },
    { label: "הצעות", route: "/#offers", purpose: "Browse featured", priority: "Medium" },
    { label: "קבלנים", route: "/#contractors", purpose: "Trust section", priority: "Medium" }
  ],
  secondaryNav: [],
  accountNav: [
    { label: "התחברות", route: "/login", purpose: "Login", priority: "High" },
    { label: "הרשמה", route: "/signup", purpose: "Signup", priority: "High" }
  ],
  hiddenRoutes: ["/forgot-password", "/reset-password", "/verify-email", "/resend-verification", "/privacy", "/terms"],
  keyCTAs: [
    { label: "התחילו לחסוך", destination: "/signup", context: "Hero", emphasis: "Primary" },
    { label: "הצטרפו כקבלן", destination: "/signup?role=contractor", context: "Contractor CTA", emphasis: "Secondary" }
  ],
  notes: ["No sidebar; landing layout only"]
}
```

### Resident

```typescript
{
  role: "Resident",
  primaryNav: [
    { label: "דשבורד", route: "/dashboard", purpose: "Home", priority: "High" },
    { label: "הצעות", route: "/offers", purpose: "Browse offers", priority: "High" },
    { label: "הזמנות", route: "/orders", purpose: "My orders", priority: "High" },
    { label: "הבניין שלי", route: "/building", purpose: "Building context", priority: "High" },
    { label: "עוזר חכם", route: "/chat", purpose: "AI chat", priority: "Medium" }
  ],
  secondaryNav: [
    { label: "תשלומים", route: "/payments", purpose: "Payment history", priority: "Medium" },
    { label: "קבלנים", route: "/contractors", purpose: "Contractor directory", priority: "Low" }
  ],
  accountNav: [
    { label: "פרופיל", route: "/profile", purpose: "Profile/settings", priority: "Medium" },
    { label: "שפה", route: "#", purpose: "Language toggle", priority: "Low" },
    { label: "התנתקות", route: "#", purpose: "Logout", priority: "Low" }
  ],
  hiddenRoutes: ["/change-password", "/checkout", "/architecture"],
  keyCTAs: [
    { label: "הצטרפו להצעה", destination: "/offers/[id]", context: "Offer card", emphasis: "Primary" },
    { label: "הצטרפו לבניין", destination: "/building/join", context: "No building", emphasis: "Primary" }
  ],
  notes: ["Remove 'ארכיטקטורה' — not resident-relevant; add mobile bottom nav"]
}
```

### Contractor

```typescript
{
  role: "Contractor",
  primaryNav: [
    { label: "דשבורד", route: "/contractor/dashboard", purpose: "Home", priority: "High" },
    { label: "ההצעות שלי", route: "/contractor/offers/active", purpose: "Manage offers", priority: "High" },
    { label: "פרויקטים", route: "/contractor/projects", purpose: "Completed projects", priority: "High" }
  ],
  secondaryNav: [
    { label: "עוזר חכם", route: "/contractor/chat", purpose: "AI chat if available", priority: "Low" },
    { label: "פרופיל ומסמכים", route: "/contractor/profile", purpose: "Profile + documents", priority: "Medium" }
  ],
  accountNav: [
    { label: "שפה", route: "#", purpose: "Language toggle", priority: "Low" },
    { label: "התנתקות", route: "#", purpose: "Logout", priority: "Low" }
  ],
  hiddenRoutes: [],
  keyCTAs: [
    { label: "צרו הצעה חדשה", destination: "/contractor/offers/create", context: "Sidebar CTA button", emphasis: "Primary" }
  ],
  notes: ["Create Offer as prominent CTA button, not nav link; business name + verified badge in sidebar header"]
}
```

### BuildingsManager

```typescript
{
  role: "BuildingsManager",
  primaryNav: [
    { label: "דשבורד", route: "/buildings-manager/dashboard", purpose: "Overview", priority: "High" },
    { label: "בניינים", route: "/buildings-manager/buildings", purpose: "Manage buildings", priority: "High" },
    { label: "פניות", route: "/buildings-manager/escalations", purpose: "Escalations", priority: "High" }
  ],
  secondaryNav: [],
  accountNav: [
    { label: "פרופיל", route: "/profile", purpose: "Profile", priority: "Low" },
    { label: "התנתקות", route: "#", purpose: "Logout", priority: "Low" }
  ],
  hiddenRoutes: [],
  keyCTAs: [
    { label: "הוספת בניין", destination: "/buildings-manager/buildings", context: "Empty state", emphasis: "Primary" }
  ],
  notes: ["Sparse nav acceptable; consider building-specific sub-nav when multiple buildings"]
}
```

### Admin

```typescript
{
  role: "Admin",
  primaryNav: [
    { label: "דשבורד", route: "/dashboard", purpose: "Overview", priority: "High" },
    { label: "סוכנים", route: "/agents", purpose: "AI agents", priority: "High" },
    { label: "פניות", route: "/escalations", purpose: "Escalations", priority: "High" },
    { label: "תשלומים", route: "/payments", purpose: "Payments", priority: "High" },
    { label: "הצעות", route: "/offers", purpose: "Offers", priority: "High" },
    { label: "משתמשים", route: "/users", purpose: "Users", priority: "High" },
    { label: "קבלנים", route: "/contractors", purpose: "Contractors", priority: "High" },
    { label: "אנליטיקה", route: "/analytics", purpose: "Analytics", priority: "Medium" }
  ],
  secondaryNav: [
    { label: "הגדרות", route: "/settings", purpose: "Settings", priority: "Low" },
    { label: "לוגים", route: "/settings/audit-logs", purpose: "Audit logs", priority: "Low" }
  ],
  accountNav: [
    { label: "התנתקות", route: "#", purpose: "Logout", priority: "Low" }
  ],
  hiddenRoutes: ["/login", "/buildings"],
  keyCTAs: [
    { label: "אישור קבלן", destination: "/contractors", context: "Pending verification", emphasis: "Primary" },
    { label: "טיפול בפנייה", destination: "/escalations", context: "Open escalation", emphasis: "Primary" }
  ],
  notes: ["Group nav into sections: Core (dashboard, agents, escalations, payments), Data (offers, users, contractors, analytics), Config (settings)"]
}
```

---

## 5. Audit Summary (ImplementationStatus by Area)

### ImplementationStatus by AuditTarget

| AuditTarget | Status | Notes |
|-------------|--------|-------|
| ExistingRoutes | Implemented | Web: 45 pages; Admin: 10 pages; Resident/Contractor/BM/Auth flows present |
| ExistingLayouts | Implemented | Resident, Contractor, BuildingsManager, Admin, Auth layouts |
| ExistingNavigation | Implemented | Resident: sidebar + bottom nav + More sheet; Contractor: sidebar + bottom nav + FAB; BM: sidebar; Admin: grouped sections |
| ExistingRoleFlows | Implemented | Resident→Contractor→BM role routing; Admin separate app |
| ExistingDashboards | Implemented | Resident, Contractor, BM, Admin dashboards with metrics |
| ExistingOfferPages | Implemented | List, detail, create, active; filters, empty states |
| ExistingCheckoutPages | Implemented | Stripe/mock modes; PriceBreakdown, EscrowBadge, TrustBadgeCluster |
| ExistingAdminPages | Implemented | Dashboard, Agents, Escalations, Payments, Offers, Users, Contractors, Analytics, Settings, Audit Logs |
| ExistingContractorFlows | Implemented | Create offer wizard, active offers, projects, profile |
| ExistingOnboardingFlows | Implemented | Post-signup onboarding with StepIndicator bar variant |
| ExistingChatAndAIFlows | Implemented | Resident /chat; Admin Agent UI with metrics |
| ExistingErrorsAndLoadingStates | Implemented | 16 error.tsx (root, resident, checkout, orders, building, auth, admin, contractor, BM); 32 loading.tsx across routes |

### Orphaned / Inconsistent

| Item | Status | Recommendation |
|------|--------|----------------|
| `/architecture` (resident) | Orphaned | Low relevance; remove from nav or relocate |
| Admin `/buildings` | Missing | Nav link removed; use BM for buildings |
| packages/ui vs web | Inconsistent | Tokens in packages/ui; some globals duplicated |
| LanguageToggle | Partial | Resident only; Contractor/BM lack it |

---

## 6. Route-by-Route Redesign Plan

### Landing `/`

```typescript
{
  route: "/",
  role: "Public",
  currentPurpose: "Acquire signups and contractor interest",
  currentProblems: [
    "Hero may not convey group-buying value clearly",
    "Featured offers may be empty on launch",
    "Trust section could be stronger"
  ],
  redesignGoals: [
    "Clarify value prop: חסכו עם השכנים (Save with neighbors)",
    "Trust stats above fold",
    "Role-specific CTAs: resident vs contractor"
  ],
  layoutRecommendation: "Full-width sections; auth layout not used",
  keySections: [
    { name: "Hero", purpose: "Value prop + primary CTA", hierarchyLevel: "Primary" },
    { name: "HowItWorks", purpose: "3-step explanation", hierarchyLevel: "Primary" },
    { name: "FeaturedOffers", purpose: "Social proof, sample offers", hierarchyLevel: "Secondary" },
    { name: "TrustSection", purpose: "Verified, escrow, ratings", hierarchyLevel: "Primary" },
    { name: "ContractorCTA", purpose: "Contractor signup", hierarchyLevel: "Secondary" },
    { name: "Footer", purpose: "Links, legal", hierarchyLevel: "Supporting" }
  ],
  importantComponents: ["HeroSection", "HowItWorks", "FeaturedOffers", "TrustSection", "LandingFooter"],
  requiredStates: [
    { state: "Loading", requirement: "Skeleton for featured offers" },
    { state: "Empty", requirement: "Fallback when no featured offers" },
    { state: "Error", requirement: "Non-blocking; show static content" }
  ],
  mobileNotes: ["Stack sections vertically; sticky CTA optional"],
  rtlNotes: ["All text RTL; imagery can be directional"],
  implementationPriority: "P1"
}
```

### Login `/login`

```typescript
{
  route: "/login",
  role: "Public",
  currentPurpose: "Authenticate user",
  currentProblems: [
    "No visual branding beyond layout split",
    "Error messages generic",
    "Unverified flow could be clearer"
  ],
  redesignGoals: [
    "Left: branded illustration + tagline + trust stats",
    "Right: clean form, Groupio logo",
    "Clear error messages with recovery (resend verification)"
  ],
  layoutRecommendation: "Auth split layout (brand left, form right)",
  keySections: [
    { name: "Form", purpose: "Email/phone + password", hierarchyLevel: "Primary" },
    { name: "Links", purpose: "Forgot password, signup", hierarchyLevel: "Supporting" }
  ],
  importantComponents: ["AuthLayout", "LoginForm", "AuthToggle"],
  requiredStates: [
    { state: "Loading", requirement: "Button loading state" },
    { state: "Error", requirement: "Invalid credentials, unverified (resend link)" },
    { state: "Success", requirement: "Redirect to dashboard/onboarding" }
  ],
  mobileNotes: ["Stack vertically; branding compact"],
  rtlNotes: ["Form inputs right-aligned"],
  implementationPriority: "P1"
}
```

### Signup `/signup`

```typescript
{
  route: "/signup",
  role: "Public",
  currentPurpose: "Register resident, contractor, or buildings_manager",
  currentProblems: [
    "Role selection could be more visual",
    "Building code field confusing",
    "buildings_manager maps to resident for API — clarify"
  ],
  redesignGoals: [
    "Step 1: Role cards — דייר, קבלן, מנהל בניין",
    "Step 2: Basic info (name, email, phone, password)",
    "Step 3: Role-specific (building, business, etc.)",
    "Progress indicator at top"
  ],
  layoutRecommendation: "Auth split layout",
  keySections: [
    { name: "RoleSelection", purpose: "Choose role", hierarchyLevel: "Primary" },
    { name: "BasicInfo", purpose: "Credentials", hierarchyLevel: "Primary" },
    { name: "RoleInfo", purpose: "Building/business", hierarchyLevel: "Primary" }
  ],
  importantComponents: ["RoleSelectionCards", "SignupWizard", "StepIndicator"],
  requiredStates: [
    { state: "Validation", requirement: "Inline field errors" },
    { state: "Error", requirement: "Server error, unverified" },
    { state: "Success", requirement: "Redirect to verify-email or onboarding" }
  ],
  mobileNotes: ["Full-screen steps; swipe optional"],
  rtlNotes: ["Labels above, right-aligned inputs"],
  implementationPriority: "P1"
}
```

### Verify Email `/verify-email`

```typescript
{
  route: "/verify-email",
  role: "Public",
  currentPurpose: "Confirm email via token",
  currentProblems: ["Pending state is spinner only", "Error recovery unclear"],
  redesignGoals: [
    "Pending: envelope icon + 'מאמתים את האימייל שלכם...'",
    "Success: checkmark + auto-redirect 3s + manual link",
    "Error: message + 'שלחו שוב' CTA"
  ],
  layoutRecommendation: "Centered card in auth layout",
  keySections: [
    { name: "Status", purpose: "Visual + message", hierarchyLevel: "Primary" },
    { name: "Actions", purpose: "Resend, support link", hierarchyLevel: "Secondary" }
  ],
  importantComponents: ["VerificationStatus"],
  requiredStates: [
    { state: "Loading", requirement: "Pending verification" },
    { state: "Success", requirement: "Auto-redirect" },
    { state: "Error", requirement: "Resend option" },
    { state: "PermissionDenied", requirement: "Expired token handling" }
  ],
  mobileNotes: ["Compact card"],
  rtlNotes: ["RTL layout"],
  implementationPriority: "P2"
}
```

### Resident Dashboard `/dashboard`

```typescript
{
  route: "/dashboard",
  role: "Resident",
  currentPurpose: "Home; orders, offers, building",
  currentProblems: [
    "Information hierarchy could be clearer",
    "Empty states vary"
  ],
  redesignGoals: [
    "Greeting + building context first",
    "Active orders above fold",
    "Building offers / recommended offers",
    "Quick actions: join building, browse offers"
  ],
  layoutRecommendation: "Resident layout with sidebar",
  keySections: [
    { name: "Header", purpose: "Greeting, building", hierarchyLevel: "Primary" },
    { name: "ActiveOrders", purpose: "In-progress orders", hierarchyLevel: "Primary" },
    { name: "BuildingOffers", purpose: "Offers in building", hierarchyLevel: "Primary" },
    { name: "Recommended", purpose: "Other offers", hierarchyLevel: "Secondary" }
  ],
  importantComponents: ["BuildingSummaryCard", "OrderRow", "OfferCard", "StatCard"],
  requiredStates: [
    { state: "Loading", requirement: "Skeleton for each section" },
    { state: "Empty", requirement: "No orders, no building — prompt to join" },
    { state: "Error", requirement: "Retry per section" }
  ],
  mobileNotes: ["Stack sections; bottom nav"],
  rtlNotes: ["RTL"],
  implementationPriority: "P0"
}
```

### Offers List `/offers`

```typescript
{
  route: "/offers",
  role: "Resident",
  currentPurpose: "Browse and filter offers",
  currentProblems: ["Filter UX may be dense", "Empty search unclear"],
  redesignGoals: [
    "Category chips + search + sort",
    "Grid/list of OfferCards",
    "Clear empty and no-results states"
  ],
  layoutRecommendation: "Resident layout",
  keySections: [
    { name: "Filters", purpose: "Category, search, sort", hierarchyLevel: "Secondary" },
    { name: "Results", purpose: "Offer cards", hierarchyLevel: "Primary" }
  ],
  importantComponents: ["CategoryChips", "OfferCard", "EmptyState", "Skeleton"],
  requiredStates: [
    { state: "Loading", requirement: "Skeleton grid" },
    { state: "Empty", requirement: "No offers — explain + CTA" },
    { state: "Error", requirement: "Retry" }
  ],
  mobileNotes: ["Filters as bottom sheet or inline"],
  rtlNotes: ["RTL"],
  implementationPriority: "P0"
}
```

### Offer Detail `/offers/[offerId]`

```typescript
{
  route: "/offers/[offerId]",
  role: "Resident",
  currentPurpose: "View offer, join",
  currentProblems: ["Pricing tiers could be clearer", "Trust signals scattered"],
  redesignGoals: [
    "Pricing tiers with progress prominent",
    "Contractor trust block adjacent to CTA",
    "Escrow badge near join",
    "Urgency when capacity low"
  ],
  layoutRecommendation: "Resident layout; single column or two-column (detail + sidebar)",
  keySections: [
    { name: "Header", purpose: "Title, category, contractor", hierarchyLevel: "Primary" },
    { name: "Pricing", purpose: "Tiers, progress, base price", hierarchyLevel: "Primary" },
    { name: "ContractorTrust", purpose: "Verified, licensed, insured", hierarchyLevel: "Primary" },
    { name: "Description", purpose: "Details", hierarchyLevel: "Secondary" },
    { name: "CTA", purpose: "Join / הצטרפו", hierarchyLevel: "Primary" }
  ],
  importantComponents: ["PricingTiers", "TrustBadgeCluster", "ContractorCard", "OfferCard"],
  requiredStates: [
    { state: "Loading", requirement: "Skeleton" },
    { state: "Error", requirement: "Not found, server error" },
    { state: "Joined", requirement: "Already joined state" },
    { state: "Full", requirement: "Capacity reached" }
  ],
  mobileNotes: ["Sticky CTA at bottom"],
  rtlNotes: ["RTL"],
  implementationPriority: "P0"
}
```

### Checkout `/checkout`

```typescript
{
  route: "/checkout",
  role: "Resident",
  currentPurpose: "Complete payment for offer",
  currentProblems: ["Trust sidebar could be stronger", "Stripe/mock modes"],
  redesignGoals: [
    "Trust sidebar: escrow, contractor, summary",
    "Price breakdown clear",
    "Payment form (Stripe) secure",
    "Success → order detail"
  ],
  layoutRecommendation: "Two-column desktop; stacked mobile",
  keySections: [
    { name: "Summary", purpose: "Offer, tier, amount", hierarchyLevel: "Primary" },
    { name: "TrustSidebar", purpose: "Escrow, contractor", hierarchyLevel: "Primary" },
    { name: "PaymentForm", purpose: "Stripe/mock", hierarchyLevel: "Primary" }
  ],
  importantComponents: ["PriceBreakdown", "EscrowBadge", "StripeCheckoutForm", "TrustSidebar"],
  requiredStates: [
    { state: "Loading", requirement: "Initializing payment" },
    { state: "Validation", requirement: "Card errors" },
    { state: "Error", requirement: "Payment failed" },
    { state: "Success", requirement: "Redirect to order" }
  ],
  mobileNotes: ["Trust block above form"],
  rtlNotes: ["RTL"],
  implementationPriority: "P0"
}
```

### Contractor Create Offer `/contractor/offers/create`

```typescript
{
  route: "/contractor/offers/create",
  role: "Contractor",
  currentPurpose: "Create new offer (4-step wizard)",
  currentProblems: ["Step indicator basic", "Category/region selection could be richer"],
  redesignGoals: [
    "Progress bar at top",
    "Step 1: Details (category, title, description, timeline)",
    "Step 2: Pricing (base + tiers)",
    "Step 3: Target (building/region, min/max participants)",
    "Step 4: Preview + submit"
  ],
  layoutRecommendation: "Contractor layout, centered form",
  keySections: [
    { name: "StepIndicator", purpose: "Progress", hierarchyLevel: "Supporting" },
    { name: "Form", purpose: "Step content", hierarchyLevel: "Primary" },
    { name: "Actions", purpose: "Back, next, submit", hierarchyLevel: "Secondary" }
  ],
  importantComponents: ["StepIndicator", "CategoryChips", "PricingTiers", "FormSection"],
  requiredStates: [
    { state: "Validation", requirement: "Per-step validation" },
    { state: "Loading", requirement: "Submitting" },
    { state: "Error", requirement: "Server error" },
    { state: "Success", requirement: "Redirect to offers" }
  ],
  mobileNotes: ["Full-screen steps"],
  rtlNotes: ["RTL"],
  implementationPriority: "P1"
}
```

### Admin Dashboard `/dashboard` (admin)

```typescript
{
  route: "/dashboard",
  role: "Admin",
  currentPurpose: "Overview — metrics, health, agents",
  currentProblems: ["Information density", "Agent status visibility"],
  redesignGoals: [
    "Top row: GMV, offers, verifications, escalations",
    "System health: API, Redis, Postgres",
    "Agent performance summary",
    "Recent escalations"
  ],
  layoutRecommendation: "AdminShell layout",
  keySections: [
    { name: "Metrics", purpose: "KPI cards", hierarchyLevel: "Primary" },
    { name: "Health", purpose: "Services status", hierarchyLevel: "Primary" },
    { name: "Agents", purpose: "Agent summary", hierarchyLevel: "Primary" },
    { name: "Escalations", purpose: "Recent", hierarchyLevel: "Secondary" }
  ],
  importantComponents: ["MetricCard", "ServiceHealthRow", "AgentSummary", "EscalationsTable"],
  requiredStates: [
    { state: "Loading", requirement: "Skeleton" },
    { state: "Error", requirement: "Degraded, partial data" }
  ],
  mobileNotes: ["Stack; admin rarely mobile"],
  rtlNotes: ["RTL for Hebrew"],
  implementationPriority: "P1"
}
```

---

## 7. Component System

```typescript
// Critical components with specs
const componentSpecs: ComponentSpec[] = [
  {
    name: "LayoutShell",
    purpose: "Role-based app wrapper with sidebar/header",
    variants: ["Resident", "Contractor", "BuildingsManager", "Admin", "Auth"],
    states: ["default", "sidebarCollapsed", "mobileDrawerOpen"],
    usedInRoutes: ["/dashboard", "/offers", "/contractor/*", "/buildings-manager/*", "/admin/*"],
    accessibilityNotes: ["Skip to main", "Focus management on nav"],
    rtlNotes: ["Sidebar on right in RTL"],
    trustRole: undefined
  },
  {
    name: "OfferCard",
    purpose: "Display offer in list/grid with join CTA",
    variants: ["resident", "contractor", "compact", "detail"],
    states: ["default", "joined", "full", "expiring", "expired"],
    usedInRoutes: ["/offers", "/dashboard", "/building", "/contractor/offers/active"],
    accessibilityNotes: ["Card as link or button", "Badge status announced"],
    rtlNotes: ["Layout RTL"],
    trustRole: "Surface contractor verification, escrow"
  },
  {
    name: "OfferPricingBlock",
    purpose: "Pricing tiers with progress",
    variants: ["display", "builder"],
    states: ["single-tier", "multi-tier", "all-unlocked"],
    usedInRoutes: ["/offers/[id]", "/checkout", "/contractor/offers/create"],
    accessibilityNotes: ["Table or list for tiers", "Progress announced"],
    rtlNotes: ["Numbers LTR"],
    trustRole: "Transparency"
  },
  {
    name: "ContractorCard",
    purpose: "Contractor in directory or offer",
    variants: ["grid", "list", "compact"],
    states: ["verified", "pending", "unverified"],
    usedInRoutes: ["/contractors", "/offers/[id]", "/checkout"],
    accessibilityNotes: ["Verification status in text"],
    rtlNotes: ["RTL"],
    trustRole: "Primary trust surface"
  },
  {
    name: "TrustBadge",
    purpose: "Verified, licensed, insured, escrow",
    variants: ["compact", "full", "cluster"],
    states: ["active", "inactive"],
    usedInRoutes: ["/offers/[id]", "/checkout", "/contractors", "/contractor/profile"],
    accessibilityNotes: ["aria-label for icon-only"],
    rtlNotes: ["Icon + text"],
    trustRole: "Core trust element"
  },
  {
    name: "OrderTimeline",
    purpose: "Order status progression",
    variants: ["horizontal", "vertical"],
    states: ["pending", "processing", "released", "failed"],
    usedInRoutes: ["/orders", "/orders/[id]"],
    accessibilityNotes: ["Step labels", "Current step emphasized"],
    rtlNotes: ["Timeline direction RTL"],
    trustRole: "Transparency"
  },
  {
    name: "PaymentSummary",
    purpose: "Checkout price breakdown",
    variants: ["inline", "sidebar"],
    states: ["default", "loading"],
    usedInRoutes: ["/checkout"],
    accessibilityNotes: ["Table semantics"],
    rtlNotes: ["Numbers LTR"],
    trustRole: "Clarity"
  },
  {
    name: "EmptyState",
    purpose: "Zero-data and error states",
    variants: ["default", "search", "error"],
    states: ["empty", "error", "no-results"],
    usedInRoutes: ["All list pages"],
    accessibilityNotes: ["Heading, description, CTA"],
    rtlNotes: ["RTL"],
    trustRole: undefined
  },
  {
    name: "AdminDataTable",
    purpose: "Sortable, filterable table",
    variants: ["default", "compact"],
    states: ["loading", "empty", "error"],
    usedInRoutes: ["/contractors", "/offers", "/users", "/escalations", "/payments"],
    accessibilityNotes: ["Sortable headers", "Row actions"],
    rtlNotes: ["RTL"],
    trustRole: undefined
  },
  {
    name: "ConfirmationModal",
    purpose: "Confirm destructive or important actions",
    variants: ["sm", "md", "lg"],
    states: ["open", "closing"],
    usedInRoutes: ["Admin actions", "Leave offer", "Cancel order"],
    accessibilityNotes: ["Focus trap", "Escape", "aria-modal"],
    rtlNotes: ["RTL"],
    trustRole: undefined
  },
  {
    name: "OnboardingStepper",
    purpose: "Multi-step wizard progress",
    variants: ["circles", "bar"],
    states: ["step1", "step2", "step3", "complete"],
    usedInRoutes: ["/onboarding", "/contractor/offers/create"],
    accessibilityNotes: ["aria-current", "step label"],
    rtlNotes: ["Progress direction RTL"],
    trustRole: undefined
  },
  {
    name: "ChatPanel",
    purpose: "AI chat interface",
    variants: ["sidebar", "full"],
    states: ["idle", "streaming", "error"],
    usedInRoutes: ["/chat", "/contractor/chat"],
    accessibilityNotes: ["Live region for messages"],
    rtlNotes: ["RTL messages"],
    trustRole: "AI disclosure"
  }
];
```

---

## 8. Key Screen Specifications

### LandingPage

```typescript
{
  name: "LandingPage",
  targetRole: "Public",
  primaryGoal: "Acquire signups (resident + contractor)",
  trustSignals: ["Verified contractors count", "Escrow badge", "Building count"],
  primaryCTA: "התחילו לחסוך",
  secondaryCTAs: ["הצטרפו כקבלן", "איך זה עובד"],
  informationHierarchy: ["Hero value prop", "How it works", "Featured offers", "Trust", "Contractor CTA"],
  coreComponents: ["HeroSection", "HowItWorks", "FeaturedOffers", "TrustSection", "LandingFooter"],
  successCriteria: ["Clear value prop", "Trust visible", "Role-specific CTAs"],
  commonFailurePoints: ["Empty featured offers", "Weak hero copy"],
  accessibilityNotes: ["Heading hierarchy", "CTA focus order"],
  mobileNotes: ["Stack sections", "Sticky CTA optional"],
  rtlNotes: ["Full RTL"]
}
```

### LoginPage

```typescript
{
  name: "LoginPage",
  targetRole: "Public",
  primaryGoal: "Authenticate user",
  trustSignals: ["Brand consistency", "Secure form"],
  primaryCTA: "התחברו",
  secondaryCTAs: ["שכחתם סיסמה?", "הרשמה"],
  informationHierarchy: ["Form", "Links"],
  coreComponents: ["AuthLayout", "LoginForm"],
  successCriteria: ["Valid login", "Redirect", "Resend on unverified"],
  commonFailurePoints: ["Generic errors", "Unverified unclear"],
  accessibilityNotes: ["Labels", "Error announcements"],
  mobileNotes: ["Full-width form"],
  rtlNotes: ["RTL form"]
}
```

### OfferDetail

```typescript
{
  name: "OfferDetail",
  targetRole: "Resident",
  primaryGoal: "Join offer",
  trustSignals: ["Contractor verification", "Escrow", "Pricing transparency"],
  primaryCTA: "הצטרפו להצעה",
  secondaryCTAs: ["שיחה עם קבלן", "שתפו"],
  informationHierarchy: ["Title", "Pricing tiers", "Contractor trust", "Description", "CTA"],
  coreComponents: ["PricingTiers", "TrustBadgeCluster", "ContractorCard"],
  successCriteria: ["Join flow", "Trust visible", "Pricing clear"],
  commonFailurePoints: ["Stale data", "Full capacity"],
  accessibilityNotes: ["Pricing table", "Badge labels"],
  mobileNotes: ["Sticky CTA"],
  rtlNotes: ["RTL"]
}
```

### Checkout

```typescript
{
  name: "Checkout",
  targetRole: "Resident",
  primaryGoal: "Complete payment",
  trustSignals: ["Escrow badge", "Contractor summary", "Price breakdown"],
  primaryCTA: "שלם בהגנה",
  secondaryCTAs: ["חזרה להצעה"],
  informationHierarchy: ["Summary", "Trust sidebar", "Payment form"],
  coreComponents: ["PriceBreakdown", "EscrowBadge", "StripeCheckoutForm"],
  successCriteria: ["Payment success", "Redirect to order"],
  commonFailurePoints: ["Card decline", "Network error"],
  accessibilityNotes: ["Form labels", "Error handling"],
  mobileNotes: ["Stack trust above form"],
  rtlNotes: ["RTL"]
}
```

### AdminContractorVerification

```typescript
{
  name: "AdminContractorVerification",
  targetRole: "Admin",
  primaryGoal: "Verify or reject contractor",
  trustSignals: ["Document viewer", "Trust score", "Audit trail"],
  primaryCTA: "אשר קבלן",
  secondaryCTAs: ["דחה", "בקש מסמכים"],
  informationHierarchy: ["Contractor info", "Documents", "Trust data", "Actions"],
  coreComponents: ["DataTable", "AdminActionModal", "DocumentViewer"],
  successCriteria: ["Approve/reject", "Audit log"],
  commonFailurePoints: ["Missing documents", "Partial data"],
  accessibilityNotes: ["Modal focus trap"],
  mobileNotes: ["Rare; stack layout"],
  rtlNotes: ["RTL"]
}
```

---

## 9. Implementation Plan

```typescript
type ImplementationPlan = {
  phase1: [
    "Resident mobile bottom nav",
    "Offer detail trust block redesign",
    "Checkout trust sidebar enhancement",
    "Empty states for offers, orders, building",
    "Loading skeletons for dashboard, offers"
  ],
  phase2: [
    "Auth pages redesign (login, signup, verify-email)",
    "Onboarding UX improvements",
    "Create offer wizard polish",
    "Admin nav grouping",
    "Contractor sidebar CTA prominence"
  ],
  phase3: [
    "Buildings manager building-specific nav",
    "Admin dashboard density improvements",
    "Error page consistency",
    "Payment history UX",
    "Profile and settings consolidation"
  ],
  later: [
    "Storybook for all components",
    "Dark mode (if required)",
    "Advanced filters",
    "Map-based region selection",
    "Mobile parity for BM flows"
  ]
}
```

---

## 10. Design System File Plan

```typescript
type DesignFilePlan = {
  masterFile: "design-system/MASTER.md",
  pageFiles: [
    "design-system/pages/landing.md",
    "design-system/pages/resident-dashboard.md",
    "design-system/pages/offers.md",
    "design-system/pages/offer-detail.md",
    "design-system/pages/checkout.md",
    "design-system/pages/create-offer.md",
    "design-system/pages/contractor-dashboard.md",
    "design-system/pages/admin-dashboard.md"
  ],
  componentFiles: [
    "packages/ui/src/tokens.ts",
    "apps/web/styles/globals.css",
    "apps/admin/app/globals.css",
    "apps/mobile/ theme in _layout"
  ],
  notes: [
    "Wire tokens.ts to Tailwind via tailwind.config extend",
    "Unify web and admin globals where possible",
    "Mobile uses MD3 theme; align colors with tokens"
  ]
}
```

---

## Appendix: Audit Detail

### Orphaned / Inconsistent

- **Architecture route** (`/architecture`) — resident nav; low relevance; consider remove or relocate
- **Admin `/buildings`** — nav link exists; no page at `/buildings`; audit-logs at `/settings/audit-logs`
- **packages/ui** — components exist but not imported by web/admin; tokens used inconsistently
- **Error/loading** — patterns vary by page; no shared ErrorBoundary usage

### Not Verified (Requires QA)

- RTL correctness on all forms
- Mobile bottom nav implementation (resident layout)
- Stripe checkout flow end-to-end
- Admin agent UI integration with backend

---

*End of specification*
