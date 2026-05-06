# Roles & Permissions Rules

## The 5 Roles

| Role | Self-register | Primary scope |
|------|--------------|---------------|
| `resident` | Yes | Join offers, pay, chat, view building offers |
| `contractor` | Yes | Create offers, manage tiers, receive payouts |
| `buildings_manager` | No (admin-created) | Manage building residents, view all activity |
| `admin` | No | Full access, escalations, metrics, payout approvals |
| `super_admin` | No | Admin + system config, role management |

## Enforcement (two layers, both required)

### Layer 1 — RLS (PostgreSQL)
- Every table has RLS policies scoped to role
- Residents can only see their own building's offers
- Contractors can only see/edit their own offers
- Admins bypass RLS for management operations

### Layer 2 — Backend Guards (FastAPI)
- Role checked in middleware after JWT validation
- Use `require_role(["admin", "super_admin"])` decorator pattern
- Never rely on RLS alone for business-level access control

## What each role can do

### Resident
- View offers in their building
- Join/leave an offer (within deadline)
- Make payments for joined offers
- Chat with contractor
- Leave reviews after completion

### Contractor
- Create offers (must be verified)
- Edit own offer details and pricing tiers
- View participants list for own offers
- Cannot see other contractors' offers or pricing

### Buildings Manager
- View all residents and their offers in managed building
- Invite residents
- View building-level analytics
- Cannot create offers (that's contractor territory)

### Admin
- View everything
- Approve contractor payouts
- Manage escalations
- Create buildings_manager accounts
- Disable/suspend users

### Super Admin
- All admin actions
- Change system config
- Assign/remove admin roles

## Testing Requirements
- Every new protected endpoint needs tests for all relevant roles
- Playwright E2E must cover role-based routing (wrong role → redirect)
- RLS must be validated in integration tests, not just unit tests
- The `apps/web/e2e/` directory has role-specific spec files — add tests there
