# Groupio Infrastructure & Cross-Cutting Concerns

> Covers: i18n, PWA, SEO, error handling, RAG pipeline, shared packages, scripts, Storybook, env config

---

## 1. Internationalization (i18n)

### Web App — `apps/web`

| File | Purpose |
|------|---------|
| `i18n/config.ts` | Locales: `["he", "en"]`, default: `"he"` |
| `i18n/request.ts` | Reads locale from `NEXT_LOCALE` or `locale` cookie, loads `messages/{locale}.json` |
| `messages/he.json` | ~450 keys, full Hebrew translations |
| `messages/en.json` | ~450 keys, full English translations |

### Translation Key Structure

```
common: { loading, error, retry, save, cancel, back, next, close, search, noResults }
auth: { login, signup, forgotPassword, resetPassword, verifyEmail, ... }
residentNav: { dashboard, offers, contractors, building, profile, ... }
contractorNav: { dashboard, offers, createOffer, projects, profile }
dashboard: { greeting, stats, recentActivity, quickActions, ... }
offers: { title, search, filter, sort, joinOffer, ... }
contractors: { title, verified, trustScore, ... }
profile: { personalInfo, notifications, security, ... }
building: { title, residents, inviteCode, ... }
contractor.dashboard: { stats, activeOffers, pendingOffers, ... }
contractor.offers: { create, edit, active, ... }
contractor.profile: { businessInfo, documents, settings, ... }
contractor.projects: { title, status, ... }
onboarding: { steps, role, info, preferences, ... }
chat: { title, placeholder, suggestions, ... }
categories: { plumbing, electrical, waterproofing, cleaning, renovation, ... }
regions: { north, center, south, jerusalem, ... }
payment: { checkout, summary, escrow, ... }
architecture: { title, upload, ... }
```

### Translation Completeness

Both `he.json` and `en.json` have 1:1 key parity. Coverage is good for existing pages.

### Gaps

- **Mobile app has NO i18n** — all strings hardcoded in Hebrew
- **Admin app has NO i18n** — uses hardcoded English/Hebrew mix
- **Hardcoded strings in code** — some pages (OfferAnalyticsPanel, contractor projects) have inline Hebrew strings instead of using translation keys
- **No RTL-specific translations** — number formatting and price display rely on manual LTR embedding

---

## 2. PWA / Web Manifest

### Manifest — `apps/web/app/manifest.ts`

| Field | Value |
|-------|-------|
| name | גרופיו - קניות קבוצתיות לבניינים |
| short_name | גרופיו |
| description | Hebrew description of group buying platform |
| dir | rtl |
| lang | he |
| start_url | / |
| display | standalone |
| theme_color | #0ea5e9 (needs update to new primary) |
| background_color | #f9fafb |
| icons | 72px to 512px (in `/public/icons/`) |
| screenshots | home.png, offers.png, mobile-home.png (referenced but **may not exist**) |
| categories | shopping, lifestyle, finance |
| shortcuts | הצעות (/offers), הבניין שלי (/building) |
| related_applications | Play Store, App Store (placeholder IDs) |

### Issues

- `theme_color` still uses old sky-blue — needs update to new primary
- Screenshot files may not exist in `/public/screenshots/`
- Play Store / App Store IDs are placeholders

---

## 3. SEO & Metadata

### Root Layout — `apps/web/app/layout.tsx`

```
title: { default: "גרופיו - קניות קבוצתיות לבניינים", template: "%s | גרופיו" }
description: Hebrew description
keywords: ["קניות קבוצתיות", "בניינים", "חיסכון", "קבלנים", ...]
openGraph: { locale: "he_IL", type: "website", images: "/og-image.png" }
twitter: { card: "summary_large_image" }
robots: { index: true, follow: true }
```

### Sitemap — `apps/web/app/sitemap.ts`

Generates URLs for:
- Static pages: /, /login, /signup, /offers, /contractors, /terms, /privacy
- Category pages: /offers?category={category} for each ServiceCategory
- Region pages: /offers?region={region} for each Region

**Base URL**: `NEXT_PUBLIC_APP_URL` or `https://groupio.co.il`

### Issues

- `og-image.png` referenced but needs verification that it exists and looks good
- No per-page metadata beyond root (offers, contractor profiles, etc. should have dynamic OG)
- No structured data (JSON-LD) for offers, contractors, or organization

---

## 4. Error & Loading Pages

### Error Boundaries

| File | Scope | UI Pattern |
|------|-------|-----------|
| `apps/web/app/error.tsx` | Root | Error message + retry + support link |
| `apps/web/app/(resident)/error.tsx` | All resident pages | Same pattern |
| `apps/web/app/(resident)/dashboard/error.tsx` | Dashboard | Same pattern |
| `apps/web/app/(resident)/offers/error.tsx` | Offers | Same pattern |
| `apps/web/app/(resident)/payments/error.tsx` | Payments | Same pattern |
| `apps/web/app/contractor/error.tsx` | All contractor pages | Same pattern |
| `apps/admin/app/error.tsx` | Admin root | Same pattern |

**Pattern**: All error pages show: error icon, error message (dev: actual error, prod: generic), retry button, support link.

### Loading States

| File | Scope | UI Pattern |
|------|-------|-----------|
| `apps/web/app/contractor/offers/create/loading.tsx` | Create offer | Spinner |
| `apps/web/app/contractor/offers/active/loading.tsx` | Active offers | Spinner |
| `apps/web/app/contractor/projects/loading.tsx` | Projects list | Spinner |
| `apps/web/app/contractor/projects/[id]/loading.tsx` | Project detail | Spinner |

**Gap**: No loading.tsx for resident pages (dashboard, offers, payments, orders, building, chat, profile). These pages likely show no loading indicator during navigation.

### Not Found Pages

| File | Pattern |
|------|---------|
| `apps/web/app/not-found.tsx` | 404 with link back to home |
| `apps/admin/app/not-found.tsx` | Admin 404 |

### Recommendation

- Add `loading.tsx` to all resident route groups
- Replace spinner-only loading pages with skeleton screens
- Add specific empty states per page (different from error states)

---

## 5. RAG Pipeline — `src/rag/`

### Architecture

```
User Query → EmbeddingClient.embed_query()
                    │
                    ▼
         VectorStore.search() / hybrid_search()
                    │
                    ▼
              Reranker.rerank()
                    │
                    ▼
         GroupioRAG.augment_prompt()
                    │
                    ▼
           Agent uses augmented context
```

### Components

| File | Class | Purpose |
|------|-------|---------|
| `pipeline.py` | `GroupioRAG` | Main pipeline: retrieve, augment, metrics |
| `embeddings.py` | `EmbeddingClient` | OpenAI text-embedding-3-large, batch/query/document embedding |
| `chunking.py` | — | Token-based chunking: `chunk_by_tokens`, `chunk_document`, `chunk_faq`, `chunk_by_sections` |
| `reranking.py` | `Reranker` | LLM-based relevance scoring with fallback |

### Retrieval Modes

| Mode | Description |
|------|-------------|
| `semantic` | Pure vector similarity search |
| `hybrid` | 70% semantic + 30% keyword scoring |
| `contextual` | Semantic with metadata filters (building, region) |
| `multi_hop` | Two-stage retrieval: initial + follow-up queries |

### Vector Collections Used

| Collection | Content | Populated By |
|------------|---------|-------------|
| `contractors` | Contractor profiles + descriptions | `scripts/setup_vector_db.py` |
| `buildings` | Building information | `scripts/setup_vector_db.py` |
| `knowledge_base` | FAQs, guides, policies | `scripts/setup_vector_db.py` |
| `conversations` | Past conversation snippets | Agent runtime |

### Agents That Use RAG

| Agent | Collections | Mode |
|-------|-------------|------|
| MatchingAgent | contractors, buildings | contextual |
| PricingAgent | contractors (market data) | semantic |
| SupportAgent | knowledge_base, conversations | hybrid |
| ArchitectureAgent | buildings | semantic |

---

## 6. Shared Packages

### `packages/types/src/index.ts`

Shared TypeScript types used by web, admin, mobile, and api-client:

| Type | Key Fields |
|------|-----------|
| `Resident` | id, fullName, email, phone, buildingId, avatarUrl |
| `Building` | id, name, address, city, region, totalUnits, residentCount, totalSavings |
| `Contractor` | id, businessName, categories, regions, verificationStatus, trustScore, averageRating |
| `Offer` | id, title, description, category, basePrice, pricingTiers, status, currentParticipants, maxParticipants |
| `PricingTier` | minParticipants, pricePerUnit, label |
| `Review` | id, contractorId, userId, rating, comment |
| `Message` | role, content, metadata |
| `ContractorMatch` | contractor, score, reasoning, strengths, concerns |
| `Payment` | id, invoiceId, userId, amount, status, provider |
| `Invoice` | id, offerId, invoiceNumber, subtotal, taxRate, taxAmount, total, platformFee |
| `EscrowAccount` | offerId, heldAmount, status, releasedAt |
| `Escalation` | id, userId, sourceAgent, reason, priority, status, summary |
| `SystemStatus` | status, agents, vectorStore, graphStore, redis |

**Enums**: `ServiceCategory`, `Region`, `BuildingType`, `OfferStatus`, `Channel`, `ResponseType`

### `packages/utils/src/`

| File | Exports |
|------|---------|
| `format.ts` | `formatPrice(amount, currency='ILS')`, `formatDate(date, locale='he-IL')`, `formatPercentage(value)`, `formatPhoneNumber(phone)` |
| `categories.ts` | `categoryNamesHe`, `categoryNamesEn`, `regionNamesHe`, `regionNamesEn`, `translateCategory(key, locale)`, `translateRegion(key, locale)`, `allCategories`, `allRegions` |

### `packages/api-client/src/client.ts`

Shared API client with typed methods for all major endpoints. Error types: `ApiError`, `NetworkError`, `ValidationError`, `UnauthorizedError`, `NotFoundError`, `RateLimitError`.

**Note**: Web app uses its own `ApiClient` (`apps/web/lib/api/client.ts`) instead of the shared package. Admin uses custom fetch calls. Mobile uses its own `api.ts`. The shared `GroupioApiClient` is effectively unused in production.

---

## 7. Scripts — `scripts/`

| Script | Purpose | Usage |
|--------|---------|-------|
| `seed_user_accounts.py` | Seed 4 demo users (BM, Resident, Contractor, Super Admin) | Manual dev setup |
| `seed_data.py` | Seed general data (buildings, offers, etc.) | Manual dev setup |
| `seed_test_data.py` | Seed test data | CI / testing |
| `setup_vector_db.py` | Initialize Qdrant collections, seed FAQ/knowledge base | First-time setup |
| `setup_graph_db.py` | Initialize Neo4j schema, seed graph data | First-time setup |
| `migrate_embeddings.py` | Migrate/regenerate embeddings | Maintenance |
| `create-db.sh` | Create PostgreSQL database | First-time setup |
| `rollback.sh` | Database rollback helper | Emergency |
| `validate_code_review.sh` | Code review validation for CI | CI |
| `protect-main-branch.sh` | Branch protection setup | Repo setup |

---

## 8. Storybook — `packages/ui`

### Config

| File | Detail |
|------|--------|
| `.storybook/main.ts` | React-Vite framework, addons: essentials, interactions, a11y, Chromatic |
| `.storybook/preview.ts` | Backgrounds (light/dark), viewports (mobile/tablet/desktop), autodocs |

### Stories Present

- `Button.stories.tsx` — all variants and sizes
- `Input.stories.tsx` — all variants, sizes, icons, states
- `Modal.stories.tsx` — sizes, overlay behavior
- `LoadingSpinner.stories.tsx` — sizes, colors, overlay, skeleton

### Stories Missing

- Select, Textarea, Checkbox, Radio, Switch (form primitives)
- Navbar, Sidebar, Footer (navigation)
- ErrorBoundary, Toast (feedback)
- SocialAuthButtons (auth)
- No feature component stories (OfferCard, ContractorCard, etc.)

### Chromatic

CI workflow exists (`chromatic.yml`) for visual regression testing, but only covers the 4 documented stories.

---

## 9. Environment Configuration

### `.env.example` (root — backend)

```
# LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
PRIMARY_MODEL=claude-sonnet-4-20250514
FALLBACK_MODEL=gpt-4o

# Databases
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/groupio
SUPABASE_URL=
SUPABASE_KEY=
USE_LOCAL_POSTGRES=1
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
NEO4J_URI=bolt://localhost:7687

# Auth
JWT_SECRET_KEY=
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Payments
PAYMENT_PROVIDER=mock
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Messaging
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
SMTP_HOST=
FROM_EMAIL=

# Agent modes
MATCHING_AGENT_MODE=recommend
PRICING_AGENT_MODE=recommend
VETTING_AGENT_MODE=recommend
OUTREACH_AGENT_MODE=gated

# Infrastructure
ENVIRONMENT=development
CORS_ORIGINS=["http://localhost:3000","http://localhost:3001"]
RATE_LIMIT_PER_USER=60
```

### `apps/web/.env.example`

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_DEFAULT_LOCALE=he
NEXT_PUBLIC_MOCK_PAYMENTS=true
```

### `apps/admin/.env.example`

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ADMIN_EMAILS=
NEXT_PUBLIC_PROMETHEUS_URL=
NEXT_PUBLIC_GRAFANA_URL=
```

### `apps/mobile/.env.example`

```
EXPO_PUBLIC_API_URL=https://api.groupio.co.il/api/v1
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_ENABLE_PUSH=true
EXPO_PUBLIC_ENABLE_BIOMETRIC=false
EXPO_PUBLIC_ENABLE_OFFLINE=false
EXPO_PUBLIC_DEFAULT_LOCALE=he
```
