# Users, Buildings, Contractors, Offers, Escalations – Implementation Status

Summary of what is **implemented** vs **missing** in `src/databases/postgres.py` and used by API routes / orchestration.

---

## 1. Users management

| Method | In postgres.py? | Used by |
|--------|------------------|--------|
| `get_user` | ✅ Yes | auth (refresh, password reset, verify), escalations (assign), middleware (get_current_user) |
| `get_user_by_email` | ✅ Yes | auth (login, signup, register, password reset), contractors (create) |
| `get_user_by_phone` | ✅ Yes | auth (signup, register, update profile) |
| `get_user_password_hash` | ✅ Yes | auth (login, change password) |
| `create_user` | ✅ Yes | auth (signup, register) |
| `update_user` | ✅ Yes | auth (login last_login, profile update, verify email, password reset) |
| `update_user_password` | ✅ Yes | auth (change password, password reset confirm) |
| `get_user_profile` | ✅ Yes | orchestration (graph) |
| `get_user_orders` | ✅ Yes | orchestration (tools), agents (support) |

**Verdict: Users management – fully implemented in PostgresClient.**

---

## 2. Buildings management

| Method | In postgres.py? | Used by |
|--------|------------------|--------|
| `get_building` | ✅ Yes | offers, buildings (get/update/delete/residents/stats/offers/invite), orchestration |
| `get_building_by_phone` | ✅ Yes | main (WhatsApp webhook), webhooks |
| `create_building` | ❌ **Missing** | buildings (create) |
| `list_buildings` | ❌ **Missing** | buildings (list) |
| `update_building` | ❌ **Missing** | buildings (update) |
| `delete_building` | ❌ **Missing** | buildings (delete) |
| `is_user_in_building` | ❌ **Missing** | offers (create, join), buildings (get, update, delete, residents, add resident, stats, offers) |
| `add_resident_to_building` | ❌ **Missing** | buildings (create, add resident) |
| `remove_resident_from_building` | ❌ **Missing** | buildings (remove resident) |
| `get_building_residents` | ❌ **Missing** | buildings (list residents) |
| `is_unit_taken` | ❌ **Missing** | buildings (add resident) |
| `count_active_offers` | ❌ **Missing** | buildings (delete – check before delete) |
| `get_building_stats` | ❌ **Missing** | buildings (stats) |
| `create_invitation` | ❌ **Missing** | buildings (invite) |
| `list_offers` (with building filter) | ❌ **Missing** | buildings (building offers) |

**Verdict: Buildings management – only get_building and get_building_by_phone exist. Create/list/update/delete, residents, stats, invitations, and list_offers are missing.**

---

## 3. Contractors management

| Method | In postgres.py? | Used by |
|--------|------------------|--------|
| `get_contractor_documents` | ✅ Yes | postgres (contractor docs), agents (vetting) |
| `create_contractor` | ❌ **Missing** | contractors (register) |
| `list_contractors` | ❌ **Missing** | contractors (list/search) |
| `get_contractor` | ❌ **Missing** | contractors (get/update/reviews/stats/trust), offers (assign contractor) |
| `get_contractors_by_ids` | ❌ **Missing** | contractors (list by IDs from vector/graph search) |
| `update_contractor` | ❌ **Missing** | contractors (update, assign to offer, trust score) |
| `get_contractor_reviews` | ❌ **Missing** | contractors (reviews list) |
| `has_user_completed_offer_with_contractor` | ❌ **Missing** | contractors (create review) |
| `create_review` | ❌ **Missing** | contractors (submit review) |
| `update_contractor_rating` | ❌ **Missing** | contractors (after new review) |
| `get_contractor_stats` | ❌ **Missing** | contractors (stats) |

**Verdict: Contractors management – only get_contractor_documents exists. All CRUD, list, reviews, stats, and rating updates are missing.**

---

## 4. Offers management

| Method | In postgres.py? | Used by |
|--------|------------------|--------|
| `get_active_offers` | ✅ Yes | orchestration (graph), tools | 
| `create_offer` | ❌ **Missing** | offers (create) |
| `list_offers` | ❌ **Missing** | offers (list), buildings (building offers) |
| `get_offer` | ❌ **Missing** | offers (get, update, cancel, join, leave, publish, start matching, assign contractor, participants) |
| `update_offer` | ❌ **Missing** | offers (update, cancel, publish, start matching, assign contractor) |
| `is_user_in_building` | ❌ **Missing** | offers (create, join) – see Buildings |
| `has_user_joined_offer` | ❌ **Missing** | offers (join, leave) |
| `join_offer` | ❌ **Missing** | offers (join) |
| `leave_offer` | ❌ **Missing** | offers (leave) |
| `get_offer_participants` | ❌ **Missing** | offers (participants) |

**Verdict: Offers management – only get_active_offers exists. Create/list/get/update, join/leave, and participants are missing.**

---

## 5. Escalations management

| Method | In postgres.py? | Used by |
|--------|------------------|--------|
| `create_escalation` | ❌ **Missing** | escalations (create) |
| `list_escalations` | ❌ **Missing** | escalations (list, filter, my) |
| `get_escalation` | ❌ **Missing** | escalations (get, update, assign, reply, resolve, reopen, messages) |
| `update_escalation` | ❌ **Missing** | escalations (update, assign, reply, resolve, reopen) |
| `get_escalation_stats` | ❌ **Missing** | escalations (stats) |
| `add_escalation_message` | ❌ **Missing** | escalations (reply, reopen) |
| `get_escalation_messages` | ❌ **Missing** | escalations (messages) |

**Verdict: Escalations management – nothing implemented in PostgresClient.**

---

## 6. Other (support / logging)

| Method | In postgres.py? | Used by |
|--------|------------------|--------|
| `create_support_ticket` | ✅ Yes | orchestration (graph), tools |
| `log_conversation` | ✅ Yes | main (message handler) – Supabase only; asyncpg path missing |
| `get_market_data` | ✅ Yes | orchestration (tools), agents (pricing) |

---

## Summary table

| Domain      | Implemented | Missing |
|------------|-------------|--------|
| **Users**  | Full CRUD, profile, password, orders | — |
| **Buildings** | get_building, get_building_by_phone | create, list, update, delete, is_user_in_building, add/remove resident, get_building_residents, is_unit_taken, count_active_offers, get_building_stats, create_invitation, list_offers (for building) |
| **Contractors** | get_contractor_documents | create, list, get, get_contractors_by_ids, update, get_contractor_reviews, has_user_completed_offer_with_contractor, create_review, update_contractor_rating, get_contractor_stats |
| **Offers** | get_active_offers | create, list, get, update, is_user_in_building, has_user_joined_offer, join_offer, leave_offer, get_offer_participants |
| **Escalations** | — | create, list, get, update, get_escalation_stats, add_escalation_message, get_escalation_messages |

---

## Impact

- **Auth and user profile flows** work (signup, login, refresh, me, password, verify).
- **Building/contractor/offer/escalation API routes** will raise **AttributeError** at runtime when calling any of the missing methods.
- **Orchestration** only uses implemented methods (get_user_profile, get_building, get_active_offers, create_support_ticket, get_market_data, get_user_orders) plus agents (get_contractor_documents, get_user_orders, get_market_data), so the chat/message flow can work; building/offer/contractor admin and resident flows will fail without the missing PostgresClient methods.

---

*Schema for all tables exists in `alembic/versions/001_initial_schema.py`. Implement missing methods in `src/databases/postgres.py` for both Supabase and asyncpg (local) paths where applicable.*

---

## 7. Admin App – What’s Wired vs Mock vs Wrong URL

### Agents (admin/app/agents, dashboard)

| Feature | Admin frontend | Backend | Status |
|--------|-----------------|--------|--------|
| **List agents / status** | `useSystemStatus()` → GET `/admin/status` | `GET /api/v1/admin/status` (admin router) | ✅ Implemented – returns all 7 agents (router, matching, pricing, vetting, support, outreach, analytics) with model, calls, errors |
| **Reload agent** | `useReloadAgent()` → POST `/admin/agents/:name/reload` | `POST /api/v1/admin/agents/:name/reload` (main.py + admin router) | ✅ Implemented – reloads agent config |
| **Per-agent metrics** | `useAgentMetrics(name)` | Builds from `getSystemStatus()`; backend has `GET /api/v1/agents/:name/metrics` (agents router, no admin prefix) | ✅ Status works; per-agent metrics endpoint exists but admin uses status-derived data |
| **Enable/disable agent** | Toggles in UI | No API | ❌ Client-only – toggles do not persist or affect backend |
| **Edit agent prompt** | — | `PromptUpdateRequest` in admin.py but no route | ❌ Not implemented |

**Verdict: Agents are “managed” in the sense of view status (calls, errors) and reload config. All 7 agents are covered. No enable/disable or prompt-edit API.**

---

### Escalations (admin/app/escalations, dashboard)

| Feature | Admin frontend | Backend | Status |
|--------|-----------------|--------|--------|
| **List escalations** | `getEscalations()` → GET `/admin/escalations` | Escalations live at GET `/api/v1/escalations` (not under `/admin`) | ❌ **URL mismatch** – client calls `/admin/escalations`, backend has `/escalations` |
| **Resolve escalation** | `useResolveEscalation()` → POST `/admin/escalations/:id/resolve` | POST `/api/v1/escalations/:id/resolve` | ❌ **URL mismatch** – client calls `/admin/...`, backend has `/escalations/...` |

**Fixes:** Either (1) add admin proxy routes `GET /admin/escalations` and `POST /admin/escalations/:id/resolve` that delegate to the escalations API, or (2) change the admin API client and hooks to use `/escalations` and `/escalations/:id/resolve` (with same auth). Backend escalation logic itself is implemented in routes; PostgresClient methods for escalations are still missing (see §5).

---

### Contractors (admin/app/contractors)

| Feature | Admin frontend | Backend | Status |
|--------|-----------------|--------|--------|
| **List contractors** | `useContractors()` | No call to backend; returns **hardcoded mock list** in `lib/hooks.ts` | ❌ **Not from backend** – comment says “In production this would call /api/v1/admin/contractors”. No such backend route exists. |

**Verdict: Admin contractors list is mock-only. Real contractor list would need backend `list_contractors` (and PostgresClient implementation) plus an admin endpoint or reuse of GET `/contractors` with admin auth.**

---

### Dashboard (admin/app/dashboard)

| Feature | Source | Status |
|--------|--------|--------|
| **Health** | `useHealthStatus()` → GET `/health` | ✅ Backend has GET `/api/v1/health` |
| **System status / agent summary** | `useSystemStatus()` → GET `/admin/status` | ✅ Implemented |
| **Dashboard metrics (GMV, offers, etc.)** | `useDashboardMetrics()` – derives from `getMetrics()` with **hardcoded fallbacks** | ⚠️ Partially mock – uses agent totalCalls/totalErrors; GMV, conversion, etc. are placeholders |
| **Recent escalations** | `useEscalations()` | ❌ Wrong URL (see Escalations above); also PostgresClient escalation methods missing |
| **Activity log** | `generateActivityLog()` in page | ❌ **Fully mock** – no API |

---

### Analytics (admin/app/analytics)

| Feature | Admin frontend | Backend | Status |
|--------|-----------------|--------|--------|
| **Analytics data** | `fetch('/api/admin/analytics?...')` | No route in backend; no Next.js API route under `apps/admin/app/api/` | ❌ **No implementation** – request goes to Next.js and 404s (no `app/api/admin/analytics`). |

---

## 8. Admin – Summary

| Area | Implemented | Missing / issues |
|------|-------------|-------------------|
| **Agents** | Status (all 7), reload config | Enable/disable API, prompt update API; enable/disable is UI-only |
| **Escalations** | Backend routes exist (list, resolve, etc.) | Admin client uses wrong path (`/admin/escalations`); PostgresClient methods missing |
| **Contractors** | — | Admin uses mock data; no GET /admin/contractors; PostgresClient contractor methods missing |
| **Dashboard** | Health, system status, agent summary | Escalations wrong URL; metrics partially mock; activity log mock |
| **Analytics** | — | No backend or Next.js API route for `/api/admin/analytics` |

---

## 9. Mobile App – API vs Backend

Mobile uses its own client in `apps/mobile/lib/api.ts` (not `@groupio/api-client` for most calls). Base URL is `Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "https://api.groupio.co.il/v1"` (default missing `/api`).

| Mobile method / path | Backend equivalent | Status |
|----------------------|--------------------|--------|
| `sendMessage` POST `/chat` | POST `/api/v1/message` | ❌ Path mismatch |
| `getProfile` GET `/profile` | GET `/api/v1/auth/me` | ❌ Path mismatch |
| `updateProfile` PATCH `/profile` | PUT `/api/v1/auth/me` | ❌ Path + method mismatch |
| `getOffers` GET `/offers` | GET `/api/v1/offers?...` | ⚠️ Base URL must be `.../api/v1` |
| `getOffer` GET `/offers/:id` | GET `/api/v1/offers/:id` | ⚠️ Same |
| `createOffer` POST `/offers` | POST `/api/v1/offers` | ⚠️ Same |
| `joinOffer` POST `/offers/:id/join` | POST `/api/v1/offers/:id/join` | ⚠️ Same |
| `getContractors` GET `/contractors` | GET `/api/v1/contractors` | ⚠️ Same |
| `getContractorMatches` GET `/contractors/matches` | — | ❌ No backend route |
| `uploadAvatar` POST `/profile/avatar` | — | ❌ No backend route |
| `sendMessageStream` POST `/chat/stream` | — | ❌ No backend SSE for chat |
| `getActivityFeed` GET `/activity` | — | ❌ No backend route |
| `getBuildingNews` GET `/buildings/:id/news` | — | ❌ No backend route |

**Verdict:** Mobile app will 404 or hit wrong paths until base URL includes `/api` and paths are aligned (e.g. `/message`, `/auth/me`). Optional backend endpoints for activity, building news, contractor matches, profile avatar, and chat streaming can be added later or stubbed in the client.
