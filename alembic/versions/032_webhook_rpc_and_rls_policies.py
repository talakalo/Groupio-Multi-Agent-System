"""Atomic webhook payment+invoice RPC; selective RLS policies (Supabase).

Revision ID: 032
Revises: 031
Create Date: 2026-03-24

1) ``apply_webhook_payment_invoice_update``: single SECURITY DEFINER function so
   Supabase/PostgREST callers using the service role can update payment + invoice
   in one round-trip (Postgres transaction inside the function).

2) RLS policies (only when ``auth`` schema exists — Supabase): notifications
   self-read; offers visible to residents of the building, owning contractor, or
   admins; contractors row visible to linked user or admins.

Backend asyncpg connections bypass RLS as table owner; service_role bypasses RLS
on Supabase. Policies protect direct authenticated PostgREST access.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "032_webhook_rpc_rls"
down_revision: str | None = "031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_auth_schema() -> bool:
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text("SELECT EXISTS (  SELECT 1 FROM information_schema.schemata  WHERE schema_name = 'auth')")
        ).scalar()
    )


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.apply_webhook_payment_invoice_update(
            p_payment_id text,
            p_payment_status text,
            p_invoice_id text DEFAULT NULL,
            p_invoice_status text DEFAULT NULL
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        BEGIN
            UPDATE payments SET status = p_payment_status WHERE id = p_payment_id;
            IF p_invoice_id IS NOT NULL AND btrim(p_invoice_id) <> ''
               AND p_invoice_status IS NOT NULL AND btrim(p_invoice_status) <> '' THEN
                UPDATE invoices SET status = p_invoice_status WHERE id = p_invoice_id;
            END IF;
        END;
        $$;
        """
    )
    op.execute(
        "COMMENT ON FUNCTION public.apply_webhook_payment_invoice_update IS "
        "'Atomically apply webhook-driven payment status and optional invoice status; "
        "used by API when PostgREST cannot run a client-side transaction.'"
    )

    if not _has_auth_schema():
        return

    # --- Supabase only: tighten SELECT for common tenant tables ---
    op.execute(
        """
        DROP POLICY IF EXISTS notifications_user_read_own ON notifications;
        CREATE POLICY notifications_user_read_own ON notifications
          FOR SELECT USING (user_id = auth.uid()::text);
        """
    )

    op.execute(
        """
        DROP POLICY IF EXISTS offers_resident_contractor_admin_read ON offers;
        CREATE POLICY offers_resident_contractor_admin_read ON offers
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM building_residents br
              WHERE br.user_id = auth.uid()::text
                AND br.building_id = offers.building_id
            )
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
                AND u.contractor_id IS NOT NULL
                AND u.contractor_id = offers.contractor_id
            )
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
                AND u.role IN ('admin', 'super_admin', 'buildings_manager')
            )
          );
        """
    )

    op.execute(
        """
        DROP POLICY IF EXISTS contractors_self_or_admin_read ON contractors;
        CREATE POLICY contractors_self_or_admin_read ON contractors
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
                AND u.role IN ('admin', 'super_admin', 'buildings_manager')
            )
          );
        """
    )


def downgrade() -> None:
    if _has_auth_schema():
        op.execute("DROP POLICY IF EXISTS notifications_user_read_own ON notifications")
        op.execute("DROP POLICY IF EXISTS offers_resident_contractor_admin_read ON offers")
        op.execute("DROP POLICY IF EXISTS contractors_self_or_admin_read ON contractors")

    op.execute("DROP FUNCTION IF EXISTS public.apply_webhook_payment_invoice_update(text, text, text, text)")
