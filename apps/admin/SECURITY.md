# Admin App Security Notes

## Token Storage

The admin app uses HTTP-only cookies for authentication (no token in JavaScript).

- **access_token** and **refresh_token** are set as HTTP-only cookies by the backend on login.
- **admin_role_verified** is set by the admin login page after role verification (used by middleware).
- No token is stored in `sessionStorage` or `localStorage` — reduces XSS exposure.
- All API calls use `credentials: "include"` so cookies are sent automatically.

## Middleware

The admin middleware requires both `refresh_token` and `admin_role_verified` cookies for protected routes.

## 401 Unauthorized on `/api/v1/...` (browser Network tab)

**Meaning:** The API did not accept the session — usually **no or expired `access_token` cookie** while calling protected routes (`/auth/me`, `/admin/contractors`, `/escalations`, etc.).

**Why it happens:**

1. **Expired access token** — `access_token` TTL is short; `refresh_token` lasts longer. Next.js middleware only checks `refresh_token`, so you can still load the shell while API calls return 401 until the access token is refreshed.
2. **Not logged in** — open `/login` and sign in again.
3. **`localhost` vs `127.0.0.1` mismatch** — Cookies are host-specific. Use **one** API base everywhere (`NEXT_PUBLIC_API_URL`), e.g. always `http://localhost:8000`, not mixed with `http://127.0.0.1:8000`.

The app retries once after `POST /api/v1/auth/refresh` when a credentialed request gets 401 (see `@groupio/api-client` and `lib/fetch-with-session-refresh.ts`).
