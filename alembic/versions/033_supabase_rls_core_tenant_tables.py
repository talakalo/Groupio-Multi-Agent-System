"""Expand Supabase RLS for core tenant tables; fix offers contractor column in policy.

Revision ID: 033
Revises: 032_webhook_rpc_rls
Create Date: 2026-03-24

Context
-------
Migration 028 enables RLS on many public tables for Supabase linter compliance, but
without per-table policies authenticated PostgREST users may be fully blocked.
032 added SELECT policies for notifications, offers, and contractors.

Fix
---
The offers policy in 032 referenced ``offers.contractor_id``, which does not exist in
the canonical schema (column is ``matched_contractor_id``). This revision replaces
that policy and adds SELECT policies for other high-value tenant tables.

Policies use ``auth.uid()::text`` aligned with ``public.users.id`` (same pattern as 032).

Deferred (intentional)
----------------------
- ``payment_splits``, ``invitations``, ``conversation_logs``: join logic is more
  nuanced; backend service role bypasses RLS for primary API paths.
- INSERT/UPDATE/UPDATE policies: app traffic uses FastAPI + service role / table owner;
  these policies focus on restricting direct PostgREST reads.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "033_supabase_rls_core"
down_revision: str | None = "032_webhook_rpc_rls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_auth_schema() -> bool:
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')")
        ).scalar()
    )


def _admin_predicate() -> str:
    """SQL fragment: current user is admin / super_admin / buildings_manager."""
    return """EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
        AND u.role IN ('admin', 'super_admin', 'buildings_manager')
    )"""


def upgrade() -> None:
    if not _has_auth_schema():
        return

    adm = _admin_predicate()

    # --- Fix offers SELECT (use matched_contractor_id) ---
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
                AND u.contractor_id = offers.matched_contractor_id
            )
            OR """
        + adm
        + """
          );
        """
    )

    # --- buildings: residents of the building or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS buildings_resident_or_staff_read ON buildings;
        CREATE POLICY buildings_resident_or_staff_read ON buildings
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM building_residents br
              WHERE br.user_id = auth.uid()::text
                AND br.building_id = buildings.id
            )
            OR {adm}
          );
        """
    )

    # --- building_residents: own row or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS building_residents_self_or_staff_read ON building_residents;
        CREATE POLICY building_residents_self_or_staff_read ON building_residents
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR {adm}
          );
        """
    )

    # --- contractor_reviews: author, reviewed contractor, or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS contractor_reviews_tenant_read ON contractor_reviews;
        CREATE POLICY contractor_reviews_tenant_read ON contractor_reviews
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
                AND u.contractor_id IS NOT NULL
                AND u.contractor_id = contractor_reviews.contractor_id
            )
            OR {adm}
          );
        """
    )

    # --- escalations: reporter, assignee, or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS escalations_participant_or_staff_read ON escalations;
        CREATE POLICY escalations_participant_or_staff_read ON escalations
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR assigned_to = auth.uid()::text
            OR {adm}
          );
        """
    )

    # --- escalation_messages: visible if user can read parent escalation ---
    op.execute(
        """
        DROP POLICY IF EXISTS escalation_messages_via_escalation_read ON escalation_messages;
        CREATE POLICY escalation_messages_via_escalation_read ON escalation_messages
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM escalations e
              WHERE e.id = escalation_messages.escalation_id
                AND (
                  e.user_id = auth.uid()::text
                  OR e.assigned_to = auth.uid()::text
                  OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.id = auth.uid()::text
                      AND u.role IN ('admin', 'super_admin', 'buildings_manager')
                  )
                )
            )
          );
        """
    )

    # --- chat_messages: author or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS chat_messages_author_or_staff_read ON chat_messages;
        CREATE POLICY chat_messages_author_or_staff_read ON chat_messages
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR {adm}
          );
        """
    )

    # --- invoices: participant on offer, invoice contractor, or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS invoices_offer_participant_read ON invoices;
        CREATE POLICY invoices_offer_participant_read ON invoices
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM offer_participants op
              WHERE op.offer_id = invoices.offer_id
                AND op.user_id = auth.uid()::text
            )
            OR (
              invoices.contractor_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = auth.uid()::text
                  AND u.contractor_id IS NOT NULL
                  AND u.contractor_id = invoices.contractor_id
              )
            )
            OR {adm}
          );
        """
    )

    # --- file_uploads: owner, same-building resident, or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS file_uploads_owner_building_or_staff_read ON file_uploads;
        CREATE POLICY file_uploads_owner_building_or_staff_read ON file_uploads
          FOR SELECT USING (
            user_id = auth.uid()::text
            OR (
              building_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM building_residents br
                WHERE br.user_id = auth.uid()::text
                  AND br.building_id = file_uploads.building_id
              )
            )
            OR {adm}
          );
        """
    )

    # --- contractor_verification_metadata: contractor owner or staff ---
    op.execute(
        f"""
        DROP POLICY IF EXISTS contractor_verification_metadata_tenant_read
          ON contractor_verification_metadata;
        CREATE POLICY contractor_verification_metadata_tenant_read
          ON contractor_verification_metadata
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = auth.uid()::text
                AND u.contractor_id IS NOT NULL
                AND u.contractor_id = contractor_verification_metadata.contractor_id
            )
            OR {adm}
          );
        """
    )


def downgrade() -> None:
    if not _has_auth_schema():
        return

    op.execute("DROP POLICY IF EXISTS contractor_verification_metadata_tenant_read ON contractor_verification_metadata")
    op.execute("DROP POLICY IF EXISTS file_uploads_owner_building_or_staff_read ON file_uploads")
    op.execute("DROP POLICY IF EXISTS invoices_offer_participant_read ON invoices")
    op.execute("DROP POLICY IF EXISTS chat_messages_author_or_staff_read ON chat_messages")
    op.execute("DROP POLICY IF EXISTS escalation_messages_via_escalation_read ON escalation_messages")
    op.execute("DROP POLICY IF EXISTS escalations_participant_or_staff_read ON escalations")
    op.execute("DROP POLICY IF EXISTS contractor_reviews_tenant_read ON contractor_reviews")
    op.execute("DROP POLICY IF EXISTS building_residents_self_or_staff_read ON building_residents")
    op.execute("DROP POLICY IF EXISTS buildings_resident_or_staff_read ON buildings")

    # Restore 032 offers policy text (legacy column name) for strict downgrade chain
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
