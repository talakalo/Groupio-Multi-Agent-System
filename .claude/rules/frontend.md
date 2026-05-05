# Frontend Rules

## State Management
- **React Query** for all server state (API data, lists, mutations)
- **Zustand** only for client-only state: auth session, UI toggles, notification queue
- Never put API responses directly into Zustand stores
- Invalidate query cache after mutations; don't manually update store

## TypeScript
- No `any` types — use types from `@groupio/types` or define locally
- All component props must be typed; no implicit props spreading without types
- API response shapes come from `packages/types/src/index.ts` — don't redefine them

## Components
- Use components from `packages/ui` before creating new ones
- All new UI components must work in both LTR (English) and RTL (Hebrew)
- Use `next-intl` for all user-facing strings — no hardcoded Hebrew or English text
- Test RTL layout by checking Hebrew locale in Playwright (`apps/web/playwright.config.ts` has Hebrew project)

## API Client
- Use `packages/api-client` — never call `fetch` or `axios` directly in app code
- All API calls go through the shared client which handles auth headers, retries, and deduplication

## Forms
- React Hook Form + Zod for all forms
- Validate on both client (Zod schema) and server (Pydantic)
- Show field-level errors, not just toast notifications

## Testing
- Unit tests in `apps/web/__tests__/` using Vitest + React Testing Library
- E2E tests in `apps/web/e2e/` using Playwright
- Every new user-facing flow needs a Playwright spec covering resident AND contractor roles
- Mock `useAuthHasHydrated` in layout tests to avoid hydration flakiness
