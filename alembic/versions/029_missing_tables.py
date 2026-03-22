"""Add missing tables: contractor_documents and support_tickets.

Revision ID: 029
Revises: 028
Create Date: 2026-03-22

Audit finding: Three Supabase-only code paths reference tables that were never
created by a migration:

  1. get_user_orders()        → .table("orders")           — FIXED in 029 via alias view
  2. create_support_ticket()  → .table("support_tickets")  — FIXED here
  3. get_contractor_documents() → .table("contractor_documents") — FIXED here

Notes:
- contractor_documents stores uploaded verification files for contractors.
  The existing file_uploads table stores the binary metadata; this table holds
  the contractor-specific mapping with document_type and verification_status.
- support_tickets is used by the SupportAgent to record human-escalation
  requests that require a customer-service agent to follow up. It is separate
  from the escalations table (which tracks in-product escalation flows).
- An "orders" view alias is added so legacy code calling .table("orders")
  continues to work. get_user_orders() is also fixed to use user_orders directly.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that may not exist in Supabase-hosted projects (created by app, not
# Supabase Dashboard).  Use IF NOT EXISTS / DO NOTHING patterns throughout.

SUPABASE_ONLY = False  # Set True if running against Supabase; False for local PG


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. contractor_documents
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS contractor_documents (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            contractor_id   TEXT NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
            file_upload_id  TEXT REFERENCES file_uploads(id) ON DELETE SET NULL,
            document_type   TEXT NOT NULL
                                CHECK (document_type IN (
                                    'business_license', 'insurance', 'certification',
                                    'id_document', 'portfolio', 'other'
                                )),
            file_name       TEXT,
            file_url        TEXT,
            verification_status TEXT NOT NULL DEFAULT 'pending'
                                CHECK (verification_status IN (
                                    'pending', 'approved', 'rejected', 'expired'
                                )),
            verified_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
            verified_at     TIMESTAMPTZ,
            notes           TEXT,
            expires_at      TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_contractor_documents_contractor_id
            ON contractor_documents(contractor_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_contractor_documents_status
            ON contractor_documents(verification_status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_contractor_documents_type
            ON contractor_documents(document_type)
    """)

    # Auto-update trigger for updated_at
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contractor_documents_updated_at'
            ) THEN
                CREATE TRIGGER trg_contractor_documents_updated_at
                    BEFORE UPDATE ON contractor_documents
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
            END IF;
        END $$
    """)

    # ------------------------------------------------------------------
    # 2. support_tickets
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS support_tickets (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
            escalation_id   TEXT REFERENCES escalations(id) ON DELETE SET NULL,
            subject         TEXT,
            description     TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
            priority        TEXT NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
            assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
            source_agent    TEXT,
            context         JSONB,
            resolution_notes TEXT,
            resolved_at     TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
            ON support_tickets(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_support_tickets_status
            ON support_tickets(status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_support_tickets_priority
            ON support_tickets(priority)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
            ON support_tickets(assigned_to)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
            ON support_tickets(created_at)
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_support_tickets_updated_at'
            ) THEN
                CREATE TRIGGER trg_support_tickets_updated_at
                    BEFORE UPDATE ON support_tickets
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
            END IF;
        END $$
    """)

    # ------------------------------------------------------------------
    # 3. "orders" view alias so legacy code calling .table("orders") works.
    #    The canonical view is user_orders (created in migration 025).
    #    This alias exposes the same columns under the name "orders".
    #    NOTE: get_user_orders() in postgres.py is also patched (P0-3) to
    #    use the correct user_orders view directly.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE OR REPLACE VIEW orders AS
        SELECT * FROM user_orders
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS orders")
    op.execute("DROP TABLE IF EXISTS support_tickets")
    op.execute("DROP TABLE IF EXISTS contractor_documents")
