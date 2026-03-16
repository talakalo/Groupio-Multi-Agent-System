# Groupio Mobile App — Design Reference

> App: `apps/mobile` (Expo / React Native)
> Stack: Expo Router, React Native Paper (Material 3), React Query
> Backend: Same API as web (`/api/v1`)

---

## 1. Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Expo (React Native) |
| Router | Expo Router (file-based) |
| UI Library | React Native Paper (Material Design 3) |
| State | React Query (`@tanstack/react-query`) |
| Auth | JWT in memory + `expo-secure-store` |
| Storage | `expo-secure-store` (auth), `@react-native-async-storage` (user, settings, cache) |
| Icons | `react-native-vector-icons` (MaterialCommunityIcons) |
| Animation | `react-native-reanimated` |
| Push | `expo-notifications` |
| i18n | `expo-localization` + `I18nManager` |
| Config | `app.json`, `eas.json`, `.env.example` |

---

## 2. Screen Inventory

| Screen | File | Purpose |
|--------|------|---------|
| **Root Layout** | `app/_layout.tsx` | Auth guard, RTL, React Query, Paper provider, theme |
| **Login** | `app/(auth)/login.tsx` | Email/password login |
| **Home** | `app/(tabs)/index.tsx` | Stats, quick actions, activity, building news |
| **Offers** | `app/(tabs)/offers.tsx` | Offer list with category chips, search |
| **Chat** | `app/(tabs)/chat.tsx` | AI chat with streaming, suggestion chips |
| **Profile** | `app/(tabs)/profile.tsx` | User info, settings, building, language, logout |
| **Offer Detail** | `app/offer-detail.tsx` | Full offer view (modal presentation) |
| **Create Offer** | `app/create-offer.tsx` | Contractor offer creation (modal) |

### Tab Navigation

```
┌─────────────────────────────────────────┐
│  בית  │  הצעות  │  צ'אט  │  פרופיל    │
│   🏠  │   🏷️   │   💬   │    👤      │
└─────────────────────────────────────────┘
```

4 tabs: Home, Offers, Chat, Profile (Hebrew labels hardcoded).

---

## 3. Components

| Component | File | Purpose |
|-----------|------|---------|
| `MobileOfferCard` | `components/MobileOfferCard.tsx` | Offer card with gradient header, stats, join CTA |
| `StatCard` | `components/StatCard.tsx` | Metric display card |
| `CategoryChip` | `components/CategoryChip.tsx` | Category filter chip (uses Paper `Chip`) |
| `ChatBubble` | `components/ChatBubble.tsx` | Chat message bubble (user/assistant) |

---

## 4. Theme / Design System

### Material 3 Themes (defined in `_layout.tsx`)

| Token | Light | Dark |
|-------|-------|------|
| primary | `#1976D2` | `#90CAF9` |
| secondary | `#FF6F00` | `#FFB74D` |
| tertiary | `#2E7D32` | `#81C784` |
| surface | `#FFFFFF` | `#121212` |
| background | `#F8F9FA` | `#121212` |
| error | `#D32F2F` | `#EF9A9A` |
| onPrimary | `#FFFFFF` | `#1E3A5F` |
| surfaceVariant | `#F0F2F5` | `#1E1E1E` |

### Design Token Misalignment

The mobile app uses **completely different colors** from the web app:

| Token | Web (current) | Web (proposed) | Mobile | Admin |
|-------|--------------|---------------|--------|-------|
| Primary | sky-500 `#0ea5e9` | teal `#1a9a76` | blue `#1976D2` | indigo `#6366f1` |
| Secondary/Accent | violet `#8b5cf6` | amber `#f59e0b` | orange `#FF6F00` | — |

**Recommendation**: Align mobile to the proposed teal/amber palette from MASTER.md. This requires updating `groupioColors` and `groupioDarkColors` in `_layout.tsx`.

---

## 5. API Integration — `lib/api.ts`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `login` | POST /auth/login/json | Authentication |
| `getProfile` | GET /auth/me | Current user |
| `updateProfile` | PUT /auth/me | Update profile |
| `getOffers` | GET /offers | Offer listing |
| `getOffer` | GET /offers/{id} | Offer detail |
| `joinOffer` | POST /offers/{id}/join | Join offer |
| `getContractors` | GET /contractors | Contractor list |
| `sendMessage` | POST /message | AI chat |
| `getActivityFeed` | GET /activity/recent | Activity feed |
| `getBuildingNews` | GET /buildings/{id}/news | Building news |

**Auth**: JWT token stored in `expo-secure-store`, refreshed on 401.

**Base URL**: `EXPO_PUBLIC_API_URL` or `Constants.expoConfig.extra.apiUrl`, default `https://api.groupio.co.il/api/v1`.

---

## 6. Mobile-Specific Hooks — `lib/hooks.ts`

| Hook | Returns | Cache |
|------|---------|-------|
| `useProfile()` | User profile | 5 min stale |
| `useOffers(category?, search?)` | Filtered offers | 2 min stale |
| `useActivityFeed()` | Recent activity | 1 min stale |
| `useBuildingNews()` | Building news | 5 min stale |

---

## 7. Storage — `lib/storage.ts`

| Store | Backend | Keys |
|-------|---------|------|
| SecureStore | `expo-secure-store` | `auth_token`, `refresh_token` |
| AsyncStorage | `@react-native-async-storage` | `user_data`, `app_settings`, `onboarding_complete` |
| Cache | AsyncStorage with TTL | `cache_{key}` |

---

## 8. Push Notifications — `lib/notifications.ts`

- Uses `expo-notifications`
- Requests permission, gets Expo push token
- Registers token with backend (`POST /auth/push-token`)
- Handles foreground and background notifications

---

## 9. RTL Support

- `I18nManager.allowRTL(true)` and `I18nManager.forceRTL(true)` when locale is Hebrew or Arabic
- Chat uses `writingDirection`, `textAlign`, and `scaleX` based on RTL state
- Profile tab handles RTL/LTR switching
- Tab labels hardcoded in Hebrew (no i18n file)

---

## 10. Current Problems

| Problem | Impact | Priority |
|---------|--------|----------|
| **No i18n system** — all strings hardcoded in Hebrew | Can't add English | P2 |
| **Color palette misaligned** with web and proposed design system | Brand inconsistency | P1 |
| **Limited screens** — no checkout, payments, orders, building page, onboarding | Feature gap | P1 |
| **No contractor-specific screens** — only create-offer modal | Contractors can't use mobile fully | P2 |
| **No dark mode toggle** — theme is system-auto only | User preference gap | P3 |
| **No offline support** — cache exists but no offline queue | UX in poor connectivity | P3 |
| **No signup screen** — only login | Users can't register on mobile | P1 |
| **Tab labels hardcoded** — "בית", "הצעות", "צ'אט", "פרופיל" | Not localizable | P2 |
| **Expo config** references Supabase but mobile doesn't use it directly | Config cleanup | P3 |

---

## 11. Missing Mobile Screens (vs Web)

| Screen | Web Route | Mobile | Status |
|--------|-----------|--------|--------|
| Signup | `/signup` | — | **Missing** |
| Email verification | `/verify-email` | — | **Missing** |
| Onboarding | `/onboarding` | — | **Missing** |
| Resident dashboard | `/dashboard` | `(tabs)/index` | Partial |
| Offers list | `/offers` | `(tabs)/offers` | Present |
| Offer detail | `/offers/[id]` | `offer-detail` | Present |
| Checkout | `/checkout` | — | **Missing** |
| Orders | `/orders` | — | **Missing** |
| Order detail | `/orders/[id]` | — | **Missing** |
| Payments | `/payments` | — | **Missing** |
| Building | `/building` | — | **Missing** |
| Building join | `/building/join` | — | **Missing** |
| Contractors | `/contractors` | — | **Missing** |
| Profile | `/profile` | `(tabs)/profile` | Present |
| Chat | `/chat` | `(tabs)/chat` | Present |
| Contractor dashboard | `/contractor/dashboard` | — | **Missing** |
| Create offer | `/contractor/offers/create` | `create-offer` | Present (modal) |
| Active offers | `/contractor/offers/active` | — | **Missing** |
| Projects | `/contractor/projects` | — | **Missing** |
| Contractor profile | `/contractor/profile` | — | **Missing** |

**Gap**: Mobile covers ~30% of web functionality. Critical missing: signup, checkout, orders, payments, building page, contractor management.
