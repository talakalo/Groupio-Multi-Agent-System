"""Fix RLS infinite recursion in users/offer_participants/payments policies.

Revision ID: 027
Revises: 026_notifications
Create Date: 2026-03-17

The 009 policies checked admin role via SELECT FROM users, which re-triggered
the same RLS policy, causing infinite recursion. Use a SECURITY DEFINER function
to break the cycle.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "027"
down_revision: Union[str, None] = "026_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_auth_schema(conn) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')"
            )
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_auth_schema(conn):
        return

    # SECURITY DEFINER function bypasses RLS when checking users — breaks recursion
    op.execute("""
        CREATE OR REPLACE FUNCTION public.is_admin()
        RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()::text
            AND role IN ('admin', 'super_admin')
          );
        $$;
    """)

    # Drop and recreate users policy
    op.execute("DROP POLICY IF EXISTS users_self_read ON users")
    op.execute("""
        CREATE POLICY users_self_read ON users
        FOR SELECT USING (
          auth.uid()::text = id OR public.is_admin()
        )
    """)

    # Drop and recreate offer_participants policy
    op.execute("DROP POLICY IF EXISTS offer_participants_building ON offer_participants")
    op.execute("""
        CREATE POLICY offer_participants_building ON offer_participants
        FOR SELECT USING (
          user_id = auth.uid()::text OR public.is_admin()
        )
    """)

    # Drop and recreate payments policy
    op.execute("DROP POLICY IF EXISTS payments_owner ON payments")
    op.execute("""
        CREATE POLICY payments_owner ON payments
        FOR SELECT USING (
          user_id = auth.uid()::text OR public.is_admin()
        )
    """)


def downgrade() -> None:
    conn = op.get_bind()
    if not _has_auth_schema(conn):
        return

    # Restore original policies (will recurse again, but downgrade is rarely used)
    op.execute("DROP POLICY IF EXISTS payments_owner ON payments")
    op.execute("DROP POLICY IF EXISTS offer_participants_building ON offer_participants")
    op.execute("DROP POLICY IF EXISTS users_self_read ON users")

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

    op.execute("DROP FUNCTION IF EXISTS public.is_admin()")
