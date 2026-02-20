# E2E Tests – CI Artifact Analysis and Fix Plan

**CI run:** [Actions run 21990560633](https://github.com/talakalo/Groupio-Multi-Agent-System/actions/runs/21990560633)  
**Artifact URL:** `https://github.com/talakalo/Groupio-Multi-Agent-System/actions/runs/21990560633/artifacts/5502023436`

**Note:** GitHub Actions artifacts require authentication to download; they cannot be fetched from this environment. The analysis below is based on comparing the E2E spec files with the actual app routes and UI.

---

## 1. E2E test layout (current)

| App    | Spec file              | Location                    | CI runs it?      |
|--------|-------------------------|-----------------------------|------------------|
| Web    | resident-flow.spec.ts   | apps/web/e2e/               | Yes (chromium)   |
| Web    | contractor-flow.spec.ts | apps/web/e2e/               | Yes (chromium)   |
| Admin  | admin-flow.spec.ts      | apps/admin/e2e/             | No (not in workflow) |

CI runs only: `pnpm --filter @groupio/web exec playwright test --project=chromium` (see `.github/workflows/ci.yml`). E2E runs only on `main` and `dev`; `continue-on-error: true` so failures do not fail the pipeline.

---

## 2. Route and page mismatches (likely failures)

### 2.1 Resident flow

| E2E expects              | App actually has        | Action |
|--------------------------|--------------------------|--------|
| `/register`              | `/signup`                | **Fix:** In E2E, use `page.goto("/signup")` and mock `**/api/v1/auth/signup` (not `auth/register`). |
| `/forgot-password`       | Not present              | **Fix:** Either add a minimal forgot-password page or remove/skip the E2E test that navigates there. |
| `/orders`, `/orders/:id` | Not present              | **Fix:** App has `/offers`, `/dashboard`, `/profile` but no orders. Either add stub routes or skip/remove “Resident Order Tracking” and “Resident Review” E2E describe blocks (or rewrite to use existing pages). |
| Registration API         | `**/api/v1/auth/register` | Backend uses `/api/v1/auth/signup`. **Fix:** E2E mocks should use `**/api/v1/auth/signup` and response shape matching backend (e.g. `token`, `user`). |

### 2.2 Contractor flow

| E2E expects                 | App actually has                    | Action |
|-----------------------------|-------------------------------------|--------|
| `/contractor/register`      | Single `/signup?role=contractor`    | **Fix:** E2E should use `page.goto("/signup?role=contractor")` and match the unified signup form (no separate contractor register page). |
| `/contractor/vetting`       | Not present                         | **Fix:** Skip or remove “Contractor Vetting Process” tests, or add a minimal `/contractor/vetting` page and then re-enable. |
| `**/api/v1/contractors/register` | Backend may use signup + role   | **Fix:** Align E2E mocks with real API (e.g. signup with role=contractor). |

### 2.3 Login

- E2E: `input[name="identifier"]`, `input[name="password"]`, goto `/login`, mock `**/api/v1/auth/login/json`.
- App: login page at `/login`, uses `identifier` and `password`; apiClient calls `/api/v1/auth/login/json`. **Compatible** if error/success messages match.

---

## 3. Selectors and UI assumptions (likely failures)

- **No `data-testid` in app:** E2E uses `[data-testid="chat-widget"]`, `[data-testid="contractor-modal"]`, `[data-testid="share-modal"]`, `[data-testid="typing-indicator"]`, `[data-testid="date-picker"]`. These do not exist in the codebase, so those tests will fail.
- **Fix:** Either add the same `data-testid` attributes to the relevant components in the web app, or change E2E to use other stable selectors (e.g. role + name, or unique text).

- **Hebrew copy:** E2E expects exact strings (e.g. "הרשמה", "אימייל לא תקין", "הסיסמה חייבת להכיל", "התחברות"). Any change in copy or i18n keys will break tests.
- **Fix:** Prefer data-testids or stable labels for critical flows; or centralize expected copy in E2E fixtures and update when copy changes.

- **Signup form:** E2E expects `input[name="apartmentNumber"]`, building selector with `input[placeholder*="כתובת"]` and `text=רוטשילד 15, תל אביב`. Current signup has `name`, `email`, `phone`, `password`, optional `buildingId` and a different flow (role step then details). **Fix:** Align E2E steps with the real signup UI (steps, fields, and building selection).

---

## 4. API mock alignment

- **Auth:** Use `**/api/v1/auth/signup` and `**/api/v1/auth/login/json` with response shapes that match the client (e.g. `token`, `user` for signup; `access_token`, `refresh_token`, `expires_in` for login).
- **Offers:** E2E mocks `**/api/v1/offers*` with `{ offers: [...] }`. Backend returns this shape; ensure query params (e.g. `building_id`) match what the app sends.
- **Building search:** E2E mocks `**/api/v1/buildings/search*`. Confirm backend exposes this and the app uses it on signup or elsewhere; if not, add or adjust mock and app.

---

## 5. Fix plan (ordered)

### Phase 1 – Routes and API (unblock most tests)

1. **Resident registration**
   - In `resident-flow.spec.ts`: replace `/register` with `/signup`; replace `**/api/v1/auth/register` with `**/api/v1/auth/signup`; adjust request/response to match backend (e.g. `name`, `email`, `phone`, `password`, `buildingId`).
   - Update signup test steps to match the real form (role selection if present, then details, then submit).

2. **Contractor registration**
   - In `contractor-flow.spec.ts`: replace `page.goto("/contractor/register")` with `page.goto("/signup?role=contractor")`; use signup API mock instead of `**/api/v1/contractors/register` unless that endpoint exists.
   - Adjust form fill (e.g. business name, license, etc.) to match the single signup form when `role=contractor`.

3. **Login**
   - Keep `/login` and `**/api/v1/auth/login/json`; verify error messages in the app (e.g. “פרטי התחברות שגויים”) and match in E2E expectations.

4. **Forgot password**
   - Either add a minimal `/forgot-password` page or remove/skip the E2E test that goes to `/forgot-password`.

### Phase 2 – Missing routes (skip or add)

5. **Orders**
   - If the product does not have an “orders” page yet: skip or remove the “Resident Order Tracking Flow” and “Resident Review Flow” describe blocks (or mark as `.skip` with a TODO).
   - If orders are planned: add `/orders` and `/orders/[id]` pages and then re-enable tests.

6. **Contractor vetting**
   - Skip “Contractor Vetting Process” tests (or add `/contractor/vetting` and required API mocks), then re-enable when the feature exists.

### Phase 3 – Selectors and stability

7. **data-testid**
   - Add `data-testid` to: chat widget (dashboard), contractor modal (offer detail), share modal, typing indicator (if any), date picker (if any). Use the same IDs as in the E2E specs so existing selectors pass.

8. **Copy and i18n**
   - Option A: Add a small E2E “copy” map and use it in expectations so copy changes are updated in one place.
   - Option B: Rely on data-testids for structure and only assert on a few key visible strings.

### Phase 4 – CI and reporting

9. **Run E2E in CI without port conflict**
   - CI already runs `pnpm dev` via Playwright’s webServer; ensure no other job uses port 3000. If running e2e in another context, set `reuseExistingServer: true` or use a different port in config.

10. **Use Playwright report when failures occur**
    - Artifact is uploaded at `apps/web/playwright-report/`. In the run summary, document that failures can be inspected by downloading “playwright-report” and opening `index.html`.

11. **Optional: fail CI on E2E failures**
    - When E2E is stable, set `continue-on-error: false` for the “Run E2E tests” step so the pipeline fails on failure.

---

## 6. Quick reference – file changes

| File / area                         | Change |
|-------------------------------------|--------|
| apps/web/e2e/resident-flow.spec.ts   | `/register` → `/signup`; `auth/register` → `auth/signup`; align form fields and API mock; skip or remove orders/review tests if routes missing; fix forgot-password test. |
| apps/web/e2e/contractor-flow.spec.ts| `/contractor/register` → `/signup?role=contractor`; align with signup API; skip vetting tests or add route. |
| apps/web/app (components/pages)      | Add `data-testid` for chat-widget, contractor-modal, share-modal, typing-indicator, date-picker where used. |
| .github/workflows/ci.yml             | Optional: set `continue-on-error: false` when E2E is green. |

---

## 7. How to re-run E2E locally

```bash
# From repo root (ensure nothing is on port 3000, or set reuseExistingServer: true in playwright.config.ts)
pnpm --filter @groupio/web exec playwright test --project=chromium

# With UI
pnpm --filter @groupio/web exec playwright test --project=chromium --ui

# Single file
pnpm --filter @groupio/web exec playwright test apps/web/e2e/resident-flow.spec.ts --project=chromium
```

After applying Phase 1–2, run the above and fix any remaining selector or timing issues; then run in CI and inspect the uploaded Playwright report artifact if needed.
