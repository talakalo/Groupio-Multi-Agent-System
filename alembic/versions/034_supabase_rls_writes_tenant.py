"""Supabase RLS: INSERT/UPDATE policies for conversation_logs, payment_splits, invitations.

Revision ID: 034
Revises: 033_supabase_rls_core
Create Date: 2026-03-24

Select policies for these tables were deferred in 033. This revision adds tenant-safe read
rules and scoped writes where PostgREST ``authenticated`` clients could otherwise be fully
blocked (028 enabled RLS without per-table policies) or over-exposed.

Writes are conservative: residents typically mutate through the FastAPI backend (service
role / table owner bypasses RLS). These policies allow legitimate direct-API use cases
without opening cross-tenant updates.

Admin / buildings_manager / super_admin predicates match migration 033.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "034_supabase_rls_writes"
down_revision: str | None = "033_supabase_rls_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_auth_schema() -> bool:
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')")
        ).scalar()
    )


def _staff_predicate() -> str:
    return """EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
        AND u.role IN ('admin', 'super_admin', 'buildings_manager')
    )"""


def upgrade() -> None:
    if not _has_auth_schema():
        return

    staff = _staff_predicate()

    # ------------------------------------------------------------------
    # conversation_logs — append/read own rows; staff see all
    # ------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS conversation_logs_select ON conversation_logs")
    op.execute("DROP POLICY IF EXISTS conversation_logs_insert ON conversation_logs")
    op.execute("DROP POLICY IF EXISTS conversation_logs_update ON conversation_logs")

    op.execute(
        f"""
        CREATE POLICY conversation_logs_select ON conversation_logs
          FOR SELECT USING (user_id = auth.uid()::text OR ({staff}));
        """
    )
    op.execute(
        f"""
        CREATE POLICY conversation_logs_insert ON conversation_logs
          FOR INSERT WITH CHECK (user_id = auth.uid()::text OR ({staff}));
        """
    )
    op.execute(
        f"""
        CREATE POLICY conversation_logs_update ON conversation_logs
          FOR UPDATE USING (user_id = auth.uid()::text OR ({staff}))
          WITH CHECK (user_id = auth.uid()::text OR ({staff}));
        """
    )

    # ------------------------------------------------------------------
    # payment_splits — read if participant or payment owner; writes staff-only
    # ------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS payment_splits_select ON payment_splits")
    op.execute("DROP POLICY IF EXISTS payment_splits_staff_insert ON payment_splits")
    op.execute("DROP POLICY IF EXISTS payment_splits_staff_update ON payment_splits")
    op.execute("DROP POLICY IF EXISTS payment_splits_staff_delete ON payment_splits")

    op.execute(
        f"""
        CREATE POLICY payment_splits_select ON payment_splits
          FOR SELECT USING (
            participant_user_id = auth.uid()::text
            OR (user_id IS NOT NULL AND user_id = auth.uid()::text)
            OR EXISTS (
              SELECT 1 FROM payments p
              WHERE p.id = payment_splits.payment_id
                AND p.user_id = auth.uid()::text
            )
            OR ({staff})
          );
        """
    )
    op.execute(
        f"""
        CREATE POLICY payment_splits_staff_insert ON payment_splits
          FOR INSERT WITH CHECK ({staff});
        """
    )
    op.execute(
        f"""
        CREATE POLICY payment_splits_staff_update ON payment_splits
          FOR UPDATE USING ({staff}) WITH CHECK ({staff});
        """
    )
    op.execute(
        f"""
        CREATE POLICY payment_splits_staff_delete ON payment_splits
          FOR DELETE USING ({staff});
        """
    )

    # ------------------------------------------------------------------
    # invitations — read if inviter, invitee (JWT email), building resident, or staff
    # ------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS invitations_select ON invitations")
    op.execute("DROP POLICY IF EXISTS invitations_insert ON invitations")
    op.execute("DROP POLICY IF EXISTS invitations_update ON invitations")

    op.execute(
        f"""
        CREATE POLICY invitations_select ON invitations
          FOR SELECT USING (
            invited_by = auth.uid()::text
            OR (
              auth.jwt() ->> 'email' IS NOT NULL
              AND lower(btrim(email)) = lower(btrim(auth.jwt() ->> 'email'))
            )
            OR EXISTS (
              SELECT 1 FROM building_residents br
              WHERE br.user_id = auth.uid()::text
                AND br.building_id = invitations.building_id
            )
            OR ({staff})
          );
        """
    )
    op.execute(
        f"""
        CREATE POLICY invitations_insert ON invitations
          FOR INSERT WITH CHECK (
            invited_by = auth.uid()::text
            OR ({staff})
          );
        """
    )
    op.execute(
        f"""
        CREATE POLICY invitations_update ON invitations
          FOR UPDATE USING ({staff})
          WITH CHECK ({staff});
        """
    )


def downgrade() -> None:
    if not _has_auth_schema():
        return

    for pol, tbl in [
        ("invitations_update", "invitations"),
        ("invitations_insert", "invitations"),
        ("invitations_select", "invitations"),
        ("payment_splits_staff_delete", "payment_splits"),
        ("payment_splits_staff_update", "payment_splits"),
        ("payment_splits_staff_insert", "payment_splits"),
        ("payment_splits_select", "payment_splits"),
        ("conversation_logs_update", "conversation_logs"),
        ("conversation_logs_insert", "conversation_logs"),
        ("conversation_logs_select", "conversation_logs"),
    ]:
        op.execute(f"DROP POLICY IF EXISTS {pol} ON {tbl}")
