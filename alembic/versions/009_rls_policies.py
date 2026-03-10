"""Row-Level Security policies for multi-tenant data isolation.

Revision ID: 009
Revises: 008
Create Date: 2026-03-01

Enables RLS on users, offer_participants, and payments so that
direct Supabase client connections are scoped to the authenticated
user. The backend's asyncpg service-role connection bypasses RLS.

On plain PostgreSQL (local dev / Docker) the auth schema does not
exist, so the auth.uid()-based policies are skipped — RLS is still
enabled but no restrictive policy is added, meaning the service
connection (used by FastAPI) works without changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_auth_schema() -> bool:
    """Return True when running against Supabase (auth schema present)."""
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text(
                "SELECT EXISTS ("
                "  SELECT 1 FROM information_schema.schemata"
                "  WHERE schema_name = 'auth'"
                ")"
            )
        ).scalar()
    )


def upgrade() -> None:
    # Enable RLS on affected tables — safe on any PostgreSQL.
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE offer_participants ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE payments ENABLE ROW LEVEL SECURITY")

    if not _has_auth_schema():
        # Plain PostgreSQL (local dev / Docker): auth.uid() does not exist.
        # RLS is enabled above so the setting is recorded, but no
        # user-scoped policies are created.  The FastAPI backend connects
        # as the owner role and is therefore not subject to RLS anyway.
        return

    # --- Supabase only below this line ---

    # Users: can read own row; admins can read all
    op.execute("""
        CREATE POLICY users_self_read ON users
          FOR SELECT USING (
            auth.uid() = id::uuid
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
              AND u.role IN ('admin', 'super_admin')
            )
          )
    """)

    # offer_participants: can read own rows; admins can read all
    op.execute("""
        CREATE POLICY offer_participants_building ON offer_participants
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
              AND u.role IN ('admin', 'super_admin')
            )
          )
    """)

    # payments: can read own rows; admins can read all
    op.execute("""
        CREATE POLICY payments_owner ON payments
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
              AND u.role IN ('admin', 'super_admin')
            )
          )
    """)

    # Service role bypass for backend asyncpg connection
    op.execute(
        "CREATE POLICY service_role_all ON users FOR ALL TO service_role USING (true)"
    )
    op.execute(
        "CREATE POLICY service_role_all ON offer_participants FOR ALL TO service_role USING (true)"
    )
    op.execute(
        "CREATE POLICY service_role_all ON payments FOR ALL TO service_role USING (true)"
    )


def downgrade() -> None:
    if _has_auth_schema():
        op.execute("DROP POLICY IF EXISTS service_role_all ON users")
        op.execute("DROP POLICY IF EXISTS service_role_all ON offer_participants")
        op.execute("DROP POLICY IF EXISTS service_role_all ON payments")

        op.execute("DROP POLICY IF EXISTS payments_owner ON payments")
        op.execute(
            "DROP POLICY IF EXISTS offer_participants_building ON offer_participants"
        )
        op.execute("DROP POLICY IF EXISTS users_self_read ON users")

    op.execute("ALTER TABLE payments DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE offer_participants DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
