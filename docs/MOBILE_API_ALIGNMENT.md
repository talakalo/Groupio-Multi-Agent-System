# Mobile API Alignment

The mobile app (`apps/mobile`) calls the backend at a base URL ending in `/api/v1` (e.g. `EXPO_PUBLIC_API_URL=https://api.groupio.co.il/api/v1`).

## Core Endpoints (Implemented)

| Mobile method      | HTTP  | Path       | Backend route        |
|--------------------|-------|------------|----------------------|
| `sendMessage`      | POST  | `/message` | `POST /api/v1/message` |
| `getProfile`       | GET   | `/auth/me` | `GET /api/v1/auth/me`  |
| `updateProfile`    | PUT   | `/auth/me` | `PUT /api/v1/auth/me`  |
| `getOffers`        | GET   | `/offers`  | `GET /api/v1/offers`  |
| `getContractors`    | GET   | `/contractors` | `GET /api/v1/contractors` |

## Optional / Not Yet Backed

These endpoints are used by the mobile client but may return 404 or be stubbed. The app should handle 404 and show empty or offline state.

| Mobile method         | HTTP | Path                        | Notes |
|-----------------------|------|-----------------------------|--------|
| `getActivityFeed`     | GET  | `/activity`                 | Activity feed; backend may add later. |
| `getContractorMatches`| GET  | `/contractors/matches`      | AI-based matches; can use search/offers in the meantime. |
| `getBuildingNews`      | GET  | `/buildings/:id/news`       | Building announcements; optional. |
| `uploadAvatar`         | POST | `/profile/avatar`           | Use `PUT /auth/me` with avatar URL or add multipart later. |
| `sendMessageStream`    | POST | `/chat/stream`              | SSE stream; backend has single-message `POST /message`. |

## Auth Token Storage

For production, store the auth token in secure storage (e.g. Expo SecureStore) instead of in-memory. See [LOCAL_SETUP.md](./LOCAL_SETUP.md) for configuration and [apps/mobile/lib/api.ts](../apps/mobile/lib/api.ts) for `setAuthToken` / `getAuthToken`.
