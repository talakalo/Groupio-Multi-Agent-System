# API Client Consolidation Decision

## Current State

- **packages/api-client** – Full-featured `GroupioApiClient` class. Used by **admin app** for contractors, metrics, escalations, health, payments, etc.
- **apps/web/lib/api/client.ts** – Separate `ApiClient` class. Used by **web app**. Handles token refresh (401 retry), different base URL pattern.
- **apps/mobile** – Own `lib/api.ts` with different base URL and endpoint paths (see `docs/CODE_REVIEW.md` / `docs/MOBILE_API_ALIGNMENT.md`).
- **packages/types** – Exports shared types: `Resident`, `Building`, `Offer`, `Contractor`, `Payment`, `Invoice`, `EscrowAccount`, `ContractorPayout`, `PaymentSummary`, and enums. Both apps use `@groupio/types` for type imports.

## Recommendation

**Keep separate clients for now.** Share types via `@groupio/types`.

- Admin and web have different auth flows (admin: HTTP-only cookies; web: Bearer token + refresh).
- Web client’s 401 retry and token handling would need careful refactor to extract.
- Forcing a single client would be disruptive without clear gain.

## Type Usage

- Use `@groupio/types` for shared domain types in both apps.
- Some pages define local types (e.g. `Payment`, `User`, admin `Offer`, admin `PaymentSummary`). TODOs were added where these duplicate or diverge from `@groupio/types`.
- Prefer importing from `@groupio/types` when aligning API response shapes.

## Future

- Consider unifying clients if:
  - API surface stabilizes.
  - Auth patterns converge.
  - Maintenance cost of multiple clients outweighs migration effort.
- First step: ensure `packages/types` exports all shared types; then gradually replace local type duplicates with imports.
