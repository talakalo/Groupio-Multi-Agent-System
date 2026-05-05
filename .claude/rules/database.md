# Database Rules

## Schema Changes
- All schema changes go through Alembic migrations in `alembic/versions/`
- Never ALTER tables directly in production — always generate a migration first
- Generate: `alembic revision --autogenerate -m "description"`
- Apply: `alembic upgrade head`

## RLS (Row-Level Security)
- Every new table MUST have RLS enabled and policies defined
- Test RLS by querying as each role: resident, contractor, admin, buildings_manager
- RLS policies live in Alembic migrations — don't apply them ad-hoc in SQL editors

## Query Patterns
- No `SELECT *` — use named column lists defined in `src/databases/postgres.py`
- Add new column lists at the top of `postgres.py` alongside existing ones
- asyncpg connection pool: min 5, max 25, 300s idle timeout, 60s command timeout
- Use `RETURNING id` on INSERT to avoid a separate SELECT

## Foreign Keys & Relationships
```
users → buildings (building_id)
users → contractors (contractor_id)
offers → contractors (matched_contractor_id)
offers → buildings (building_id)
offer_participants → offers + users
payments → offers + users
invoices → offers + contractors
payment_splits → invoices + users
escalations → users + conversations
```
Never insert child records without verifying the parent exists first.

## JSON Columns
- `pricing_tiers` (JSONB on offers) — validate structure before write
- `trust_score_breakdown` (JSONB on contractors)
- `notification_settings` (JSONB on users)
- `provider_data` (JSONB on contractors) — Stripe subscription data

## Migrations Checklist
Before creating a migration:
1. Does the new table need RLS? (almost always yes)
2. Are all FKs declared with `ON DELETE` behavior?
3. Are indexes needed for common query patterns?
4. Is there a corresponding Pydantic model in `src/models/`?
