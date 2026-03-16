"""Add remaining FK indexes, updated_at triggers, and counter-sync triggers.

Revision ID: 020
Revises: 019
Create Date: 2026-03-15

Addresses database audit findings:
- 18 foreign-key columns without indexes (causes full-table scans on JOINs)
- No automated updated_at maintenance (application-only, error-prone)
- Denormalized counters (buildings.resident_count, buildings.active_offers)
  drift from actual data because no trigger keeps them in sync
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# FK columns identified in the audit that lack indexes.
# Format: (index_name, table, column)
_MISSING_FK_INDEXES = [
    ("idx_buildings_admin_user_id", "buildings", "admin_user_id"),
    ("idx_contractors_user_id", "contractors", "user_id"),
    ("idx_credit_awards_approved_by", "credit_awards", "approved_by"),
    ("idx_escalation_messages_escalation_id", "escalation_messages", "escalation_id"),
    ("idx_invitations_building_id", "invitations", "building_id"),
    ("idx_invitations_invited_by", "invitations", "invited_by"),
    ("idx_invoices_contractor_id", "invoices", "contractor_id"),
    ("idx_offers_created_by", "offers", "created_by"),
    ("idx_outreach_queue_user_id", "outreach_queue", "user_id"),
    ("idx_outreach_queue_approved_by", "outreach_queue", "approved_by"),
    ("idx_payment_methods_user_id", "payment_methods", "user_id"),
    ("idx_payment_splits_payment_id", "payment_splits", "payment_id"),
    ("idx_payment_splits_participant_user_id", "payment_splits", "participant_user_id"),
    ("idx_payments_invoice_id", "payments", "invoice_id"),
    ("idx_payments_payment_method_id", "payments", "payment_method_id"),
    ("idx_pending_agent_decisions_user_id", "pending_agent_decisions", "user_id"),
    ("idx_pending_agent_decisions_decided_by", "pending_agent_decisions", "decided_by"),
    ("idx_system_settings_updated_by", "system_settings", "updated_by"),
]

# Tables that have an updated_at column and should get the auto-update trigger.
_UPDATED_AT_TABLES = [
    "users",
    "buildings",
    "contractors",
    "escalations",
    "file_uploads",
    "invoices",
    "offers",
    "payments",
    "system_settings",
]


def upgrade() -> None:
    # ── 1. Missing FK indexes ──────────────────────────────────────────────
    for idx_name, table, column in _MISSING_FK_INDEXES:
        op.create_index(idx_name, table, [column])

    # ── 2. updated_at trigger function ─────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)

    for table in _UPDATED_AT_TABLES:
        trigger_name = f"trg_{table}_updated_at"
        op.execute(f"""
            CREATE TRIGGER {trigger_name}
            BEFORE UPDATE ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at()
        """)

    # ── 3. Counter-sync triggers ───────────────────────────────────────────
    # 3a. buildings.resident_count — kept in sync with building_residents rows
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_building_resident_count()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE buildings
                SET resident_count = (
                    SELECT COUNT(*) FROM building_residents
                    WHERE building_id = NEW.building_id
                )
                WHERE id = NEW.building_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE buildings
                SET resident_count = (
                    SELECT COUNT(*) FROM building_residents
                    WHERE building_id = OLD.building_id
                )
                WHERE id = OLD.building_id;
                RETURN OLD;
            ELSIF TG_OP = 'UPDATE' AND OLD.building_id IS DISTINCT FROM NEW.building_id THEN
                UPDATE buildings
                SET resident_count = (
                    SELECT COUNT(*) FROM building_residents
                    WHERE building_id = OLD.building_id
                )
                WHERE id = OLD.building_id;
                UPDATE buildings
                SET resident_count = (
                    SELECT COUNT(*) FROM building_residents
                    WHERE building_id = NEW.building_id
                )
                WHERE id = NEW.building_id;
                RETURN NEW;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_resident_count
        AFTER INSERT OR UPDATE OR DELETE ON building_residents
        FOR EACH ROW
        EXECUTE FUNCTION sync_building_resident_count()
    """)

    # 3b. buildings.active_offers — count of offers with status='pending' or 'active'
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_building_active_offers()
        RETURNS TRIGGER AS $$
        DECLARE
            v_building_id VARCHAR;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                v_building_id := OLD.building_id;
            ELSE
                v_building_id := NEW.building_id;
            END IF;

            UPDATE buildings
            SET active_offers = (
                SELECT COUNT(*) FROM offers
                WHERE building_id = v_building_id
                AND status IN ('pending', 'active')
            )
            WHERE id = v_building_id;

            -- Handle building_id change on UPDATE
            IF TG_OP = 'UPDATE' AND OLD.building_id IS DISTINCT FROM NEW.building_id THEN
                UPDATE buildings
                SET active_offers = (
                    SELECT COUNT(*) FROM offers
                    WHERE building_id = OLD.building_id
                    AND status IN ('pending', 'active')
                )
                WHERE id = OLD.building_id;
            END IF;

            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_active_offers
        AFTER INSERT OR UPDATE OR DELETE ON offers
        FOR EACH ROW
        EXECUTE FUNCTION sync_building_active_offers()
    """)

    # ── 4. Back-fill stale counters ────────────────────────────────────────
    op.execute("""
        UPDATE buildings b
        SET resident_count = (
            SELECT COUNT(*) FROM building_residents br
            WHERE br.building_id = b.id
        )
    """)
    op.execute("""
        UPDATE buildings b
        SET active_offers = (
            SELECT COUNT(*) FROM offers o
            WHERE o.building_id = b.id
            AND o.status IN ('pending', 'active')
        )
    """)


def downgrade() -> None:
    # Counter-sync triggers
    op.execute("DROP TRIGGER IF EXISTS trg_sync_active_offers ON offers")
    op.execute("DROP FUNCTION IF EXISTS sync_building_active_offers()")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_resident_count ON building_residents")
    op.execute("DROP FUNCTION IF EXISTS sync_building_resident_count()")

    # updated_at triggers
    for table in _UPDATED_AT_TABLES:
        trigger_name = f"trg_{table}_updated_at"
        op.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table}")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")

    # FK indexes
    for idx_name, table, _col in _MISSING_FK_INDEXES:
        op.drop_index(idx_name, table)
