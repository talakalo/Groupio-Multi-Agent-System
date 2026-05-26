# Super admin: admin API vs full CRUD

Admin UI uses `NEXT_PUBLIC_API_URL` → FastAPI `/api/v1`. Routes below assume `require_admin_only` (or stricter checks noted).

## Matrix (verify manually)

| Area | List / read | Create | Update | Delete / destructive |
|------|-------------|--------|--------|----------------------|
| **Users** | `GET /admin/users`, `GET /admin/users/{id}` | `POST /admin/users` | `PUT /admin/users/{id}` | — (use suspend) |
| **Users (state)** | — | — | — | `POST .../suspend`, `POST .../activate` |
| **Contractors** | `GET /admin/contractors` | — | `PATCH /admin/contractors/{id}/membership` | — |
| **Contractor docs** | `GET .../verification-metadata`, `GET .../documents` | — | `POST .../request-docs` | — |
| **Offers** | `GET /admin/offers` | — | actions: `POST .../approve`, `/cancel`, `/flag`, `/force-cancel` | — |
| **Exports** | `GET /admin/export/offers`, `/participants`, `/payments` | — | — | — |
| **Settings** | `GET /admin/settings` | — | `PUT /admin/settings` | — |
| **Audit** | `GET /admin/audit-logs`, `GET /admin/agents/audit`, `GET .../audit/{id}` | — | — | — |
| **Agents** | `GET /metrics`, `/collections`, `/agents/autonomy`, `/agents/pending-decisions` | — | `POST /agents/{name}/reload` | — |
| **Agent decisions** | — | — | `POST .../pending-decisions/{id}/approve`, `/reject` | — |
| **Escalations** | `GET /api/v1/escalations/` (and filter, stats, `/{id}`) | `POST /api/v1/escalations/` (agents) | `PUT /api/v1/escalations/{id}`, `POST .../assign`, `POST .../reply` | — |
| **Outreach** | `GET /admin/outreach/queue` | — | `POST .../approve`, `/reject` | — |
| **Payments** | export | — | `PATCH /admin/payments/{id}/status` | — |
| **Credit awards** | `GET /admin/credit-awards` | — | `POST .../approve`, `/reject` | — |
| **Vetting** | `GET /admin/vetting/status` | — | — | — |

## Privilege notes

- Creating users with role `super_admin` and assigning `super_admin` is restricted to existing super admins in `admin.py`.
- Not every screen implements **Create** for every entity; many admin flows are **review / approve / export** only.

## Regression checks

1. **Offers table**: `base_price`, `current_participants`, and `building_name` (from `building_id`) should appear after API + UI mapping.
2. **Contractors / escalations**: if columns are empty, compare network JSON keys to the table’s expected fields (same pattern as offers).
