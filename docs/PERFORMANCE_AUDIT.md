# Performance Audit — Login & Navigation

## Applied optimizations

### 1. Login flow — stop blocking on locale API

**Before:** Login did 3 sequential network calls: `login` → `/me` → `/api/locale` (awaited). Redirect to dashboard only after all three finished.

**After:** `/api/locale` is fired without awaiting. Redirect happens immediately after login + `/me`. Locale sync runs in parallel and does not block navigation.

### 2. LocaleSyncProvider — avoid redundant `/me` fetch

**Before:** On every authenticated page load, LocaleSyncProvider fetched `/api/v1/auth/me` to read `preferred_language`, even when the user was already in the store (e.g. right after login).

**After:** Uses `user.preferredLanguage` from the store when available. Fetches `/me` only when the store has no preferred language (e.g. returning visitor with stale persist).

---

## Other factors that can affect slowness

### Development vs production

- **Next.js dev** is slower than production (no minification, HMR, source maps).
- Use `pnpm build && pnpm start` to test production performance.
- Consider **Turbopack** (`next dev --turbo`) for faster dev builds.

### Backend / API latency

- Frontend calls `NEXT_PUBLIC_API_URL` (e.g. `localhost:8000`).
- If backend is cold, uses a remote DB, or has slow queries, API latency will dominate.
- Check backend logs and DB query time; add caching if needed.

### Layout redirect chains

- Resident, contractor, admin, and buildings-manager layouts each run `useEffect` auth checks and may redirect.
- This adds client-side redirects, but only when auth state is missing or incorrect.
- Middleware handles most redirects before the page renders.

### i18n messages

- Root layout loads `getMessages()` via dynamic import of `he.json` / `en.json` (~56KB total).
- Reasonable size; no change needed unless adding many new strings.

### Zustand persist

- Auth store persists `user` and `isAuthenticated` to localStorage.
- Hydration on mount is synchronous; impact should be small.

---

## Checklist for further investigation

- [ ] Run production build and compare dev vs prod timing
- [ ] Profile backend `/api/v1/auth/login`, `/me`, `/refresh` latency
- [ ] Try `next dev --turbo` for dev
- [ ] Add React DevTools Profiler to inspect re-renders
- [ ] Check network tab for duplicate requests or long waits
