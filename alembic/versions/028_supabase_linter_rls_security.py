"""Fix Supabase Database Linter issues: RLS on public tables, user_orders SECURITY INVOKER.

Revision ID: 028
Revises: 027
Create Date: 2026-03-17

Addresses:
- security_definer_view: user_orders uses SECURITY DEFINER (bypasses RLS)
- rls_disabled_in_public: tables exposed via PostgREST without RLS
- Backend connects as table owner and bypasses RLS; enabling RLS restricts PostgREST anon/auth.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that need RLS (exclude users, offer_participants, payments — already have RLS)
_RLS_TABLES = [
    "alembic_version",
    "building_residents",
    "contractors",
    "contractor_reviews",
    "escalations",
    "escalation_messages",
    "chat_messages",
    "agent_metrics",
    "invitations",
    "conversation_logs",
    "file_uploads",
    "audit_logs",
    "system_settings",
    "payment_methods",
    "chat_messages_archive",
    "outreach_queue",
    "agent_audit_log",
    "contractor_verification_metadata",
    "buildings",
    "credit_awards",
    "pending_agent_decisions",
    "invoices",
    "payment_splits",
    "offers",
    "notifications",
]


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


def _rls_enabled(conn, table: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT relrowsecurity FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relname = :t"
            ),
            {"t": table},
        ).scalar()
    )


def _view_exists(conn, view: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.views "
                "WHERE table_schema = 'public' AND table_name = :v"
            ),
            {"v": view},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()

    # 1. user_orders: set SECURITY INVOKER (PG 15+, optional for local Docker)
    if _view_exists(conn, "user_orders"):
        conn.execute(sa.text("SAVEPOINT alter_view_sp"))
        try:
            op.execute("ALTER VIEW user_orders SET (security_invoker = on)")
            conn.execute(sa.text("RELEASE SAVEPOINT alter_view_sp"))
        except Exception:
            conn.execute(sa.text("ROLLBACK TO SAVEPOINT alter_view_sp"))

    # 2. Enable RLS on tables that don't have it
    for table in _RLS_TABLES:
        if not _table_exists(conn, table):
            continue
        if _rls_enabled(conn, table):
            continue
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    conn = op.get_bind()

    # 1. user_orders: revert to SECURITY DEFINER (default)
    if _view_exists(conn, "user_orders"):
        conn.execute(sa.text("SAVEPOINT alter_view_sp"))
        try:
            op.execute("ALTER VIEW user_orders SET (security_invoker = off)")
            conn.execute(sa.text("RELEASE SAVEPOINT alter_view_sp"))
        except Exception:
            conn.execute(sa.text("ROLLBACK TO SAVEPOINT alter_view_sp"))

    # 2. Disable RLS (only on tables we enabled — avoid breaking users, offer_participants, payments)
    for table in _RLS_TABLES:
        if not _table_exists(conn, table):
            continue
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
