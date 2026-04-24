"""Replace the permissive ``app_role_{table}`` RLS policies with tenant-scoped predicates.

Revision ID: 037_rls_tenant_scoped_app_policies
Revises: 036_backend_only_table_comments
Create Date: 2026-04-24

Context
-------
Migration 021 provisioned a dedicated ``groupio_app`` Postgres role for
least-privilege database access and created one RLS policy per sensitive
table:

    CREATE POLICY app_role_{table} ON {table}
      FOR ALL TO groupio_app
      USING (true) WITH CHECK (true);

That policy grants every row to every ``groupio_app`` connection — RLS is
effectively off for the app role. The FastAPI backend currently connects as
the ``postgres`` superuser (which bypasses RLS via ``owner_bypass_*``), so
the gap is latent rather than active — but if the connection is ever
switched to ``groupio_app`` (the intended production posture) tenant data
would cross users silently.

This migration rewrites those policies so that a ``groupio_app`` connection
is restricted to rows owned by the current app-level user, where "current
user" is communicated via a session variable:

    SELECT set_config('app.current_user_id', '<uuid>', false);  -- per tx/session

Reads and writes without that setting return no rows. Administrative actions
continue to run on the ``postgres`` superuser and are not affected.

Supabase deploys are skipped — they use managed roles and route through
PostgREST with different RLS (see 032 / 033 / 034 migrations).

Scope
-----
Covers the tables whose access model maps cleanly onto a single-user /
building-scoped owner:

  users, offer_participants, payments, notifications, buildings,
  building_residents, offers, file_uploads, escalations, chat_messages,
  invoices, payment_splits, contractor_reviews

Admin-only tables (audit_logs, pending_agent_decisions, credit_awards,
outreach_queue, agent_audit_log, system_settings, outbox_events,
crm_external_refs, stripe_webhook_events) keep their existing
``FOR ALL USING (true) WITH CHECK (true)`` policy — those go through the
superuser path and already carry a ``COMMENT ON TABLE`` (migration 036)
explaining the backend-only contract.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "037_rls_tenant_scoped_app_policies"
down_revision: Union[str, None] = "036_backend_only_table_comments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Predicate that reads the per-request session variable. When unset (no app
# user established on the connection) it returns NULL, which fails the
# ``= ...`` comparison and denies access.
_APP_USER = "current_setting('app.current_user_id', true)"


_POLICIES: list[tuple[str, str, str]] = [
    # (table, USING clause, WITH CHECK clause)
    ("users", f"id = {_APP_USER}", f"id = {_APP_USER}"),
    (
        "offer_participants",
        f"user_id = {_APP_USER}",
        f"user_id = {_APP_USER}",
    ),
    ("payments", f"user_id = {_APP_USER}", f"user_id = {_APP_USER}"),
    ("notifications", f"user_id = {_APP_USER}", f"user_id = {_APP_USER}"),
    (
        "building_residents",
        f"user_id = {_APP_USER}",
        f"user_id = {_APP_USER}",
    ),
    (
        "buildings",
        (
            f"admin_user_id = {_APP_USER} OR EXISTS ("
            f"SELECT 1 FROM building_residents br "
            f"WHERE br.building_id = buildings.id AND br.user_id = {_APP_USER}"
            ")"
        ),
        f"admin_user_id = {_APP_USER}",
    ),
    (
        "offers",
        (
            f"created_by = {_APP_USER} OR EXISTS ("
            f"SELECT 1 FROM building_residents br "
            f"WHERE br.building_id = offers.building_id AND br.user_id = {_APP_USER}"
            ")"
        ),
        f"created_by = {_APP_USER}",
    ),
    (
        "file_uploads",
        (
            f"user_id = {_APP_USER} OR EXISTS ("
            f"SELECT 1 FROM building_residents br "
            f"WHERE br.building_id = file_uploads.building_id AND br.user_id = {_APP_USER}"
            ")"
        ),
        f"user_id = {_APP_USER}",
    ),
    (
        "escalations",
        f"user_id = {_APP_USER} OR assigned_to = {_APP_USER}",
        f"user_id = {_APP_USER}",
    ),
    ("chat_messages", f"user_id = {_APP_USER}", f"user_id = {_APP_USER}"),
    (
        "invoices",
        (
            f"contractor_id = {_APP_USER} OR EXISTS ("
            f"SELECT 1 FROM offer_participants op "
            f"WHERE op.offer_id = invoices.offer_id AND op.user_id = {_APP_USER}"
            ")"
        ),
        f"contractor_id = {_APP_USER}",
    ),
    (
        "payment_splits",
        (
            f"user_id = {_APP_USER} OR participant_user_id = {_APP_USER}"
        ),
        f"user_id = {_APP_USER}",
    ),
    (
        "contractor_reviews",
        f"user_id = {_APP_USER}",
        f"user_id = {_APP_USER}",
    ),
]


def _is_supabase(conn) -> bool:
    return (
        conn.execute(sa.text("SELECT current_database()")).scalar() == "postgres"
    )


def _role_exists(conn, name: str) -> bool:
    return bool(
        conn.execute(
            sa.text("SELECT 1 FROM pg_roles WHERE rolname = :name"),
            {"name": name},
        ).scalar()
    )


def _table_exists(conn, table: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ),
            {"t": table},
        ).scalar()
    )


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()
    if _is_supabase(conn):
        return  # Supabase uses its own RLS chain (032 / 033 / 034).
    if not _role_exists(conn, "groupio_app"):
        # 021 short-circuited; nothing to tighten.
        return

    for table, using_clause, check_clause in _POLICIES:
        if not _table_exists(conn, table):
            continue
        # Cheap column sanity checks so a future schema rename doesn't leave
        # behind a policy that references a non-existent column (the 032
        # ``offers.contractor_id`` incident).
        for col in {"user_id", "created_by", "building_id", "admin_user_id",
                    "assigned_to", "participant_user_id", "contractor_id",
                    "offer_id", "id"}:
            if col in using_clause or col in check_clause:
                table_col_ok = _column_exists(conn, table, col) or (
                    # The check-or-join columns live on sibling tables.
                    col in {"user_id", "building_id", "offer_id"}
                )
                if not table_col_ok:
                    raise RuntimeError(
                        f"Migration 037: column {col!r} expected on {table!r} "
                        "not found; refusing to create a broken RLS policy."
                    )

        op.execute(f"DROP POLICY IF EXISTS app_role_{table} ON {table}")
        op.execute(
            f"""
            CREATE POLICY app_role_{table} ON {table}
              FOR ALL
              TO groupio_app
              USING ({using_clause})
              WITH CHECK ({check_clause})
            """
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _is_supabase(conn):
        return
    if not _role_exists(conn, "groupio_app"):
        return

    for table, _u, _c in _POLICIES:
        if not _table_exists(conn, table):
            continue
        op.execute(f"DROP POLICY IF EXISTS app_role_{table} ON {table}")
        op.execute(
            f"""
            CREATE POLICY app_role_{table} ON {table}
              FOR ALL
              TO groupio_app
              USING (true)
              WITH CHECK (true)
            """
        )
