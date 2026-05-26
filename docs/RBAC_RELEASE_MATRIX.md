# RBAC matrix (backend source of truth)

Frontend / Next middleware is **UX-only** (see `apps/web/middleware.ts`). **Authorization for data and mutations is enforced in FastAPI dependencies and route handlers.**

| Role | `get_current_user` | `get_admin_user` (admin + super_admin + buildings_manager) | `get_buildings_manager_user` (BM + admin + super_admin) | `require_admin_only` (admin + super_admin, **no** BM) | `require_super_admin` (super_admin only) |
|------|--------------------|----------------------------------------------------------------|---------------------------------------------------------|------------------------------------------------------|------------------------------------------|
| guest | — | — | — | — | — |
| resident | yes | 403 | 403 unless BM (403) | 403 | 403 |
| contractor | yes | 403 | 403 | 403 | 403 |
| buildings_manager | yes | **yes** | **yes** | **403** | 403 |
| admin | yes | **yes** | **yes** | **yes** | 403 |
| super_admin | yes | **yes** | **yes** | **yes** | **yes** |

## Admin API router (`src/api/routes/admin.py`)

- Router dependency: **`require_admin_only`** → **buildings_manager cannot access** admin JSON API by default.
- **Super-admin-only operations** inside handlers: assigning/creating `super_admin` users is restricted to `super_admin` (see inline checks ~259–296).

## Buildings / offers

- **Join offer**: `POST /offers/{id}/join` uses `current_user.id` for DB join; optional `user_id` in body **must match** `current_user.id` or **403** (`src/api/routes/offers.py`).

## Payments

- **Get payment**: owning `user_id` only (`src/api/routes/payments.py`).
- **Resident approve-work**: `POST /payments/{id}/approve-work` — same ownership check.
- **Admin escrow/payout**: admin router + admin dependencies.

## New dependency

- **`require_super_admin`** — `src/api/middleware/auth.py`. Use on routes that must never be callable by `admin` or `buildings_manager` when you need a stricter gate than `require_admin_only`.
