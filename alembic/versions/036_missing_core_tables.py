"""Add orders, support_tickets, and contractor_documents tables.

Revision ID: 036
Revises: 035
Create Date: 2026-05-05
"""

import sqlalchemy as sa
from alembic import op

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("offer_id", sa.UUID(as_uuid=False), sa.ForeignKey("offers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("building_id", sa.UUID(as_uuid=False), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="ILS"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_orders_offer_id", "orders", ["offer_id"])
    op.create_index("ix_orders_status", "orders", ["status"])

    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", sa.String(255), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("assigned_to", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
    op.create_index("ix_support_tickets_priority", "support_tickets", ["priority"])

    op.create_table(
        "contractor_documents",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("contractor_id", sa.UUID(as_uuid=False), sa.ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doc_type", sa.String(50), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("verified_by", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_contractor_documents_contractor_id", "contractor_documents", ["contractor_id"])
    op.create_index("ix_contractor_documents_doc_type", "contractor_documents", ["doc_type"])

    # Enable RLS on all three tables
    for table in ("orders", "support_tickets", "contractor_documents"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    # RLS: orders — users see their own rows; admins see all
    op.execute("""
        CREATE POLICY orders_select_own ON orders
        FOR SELECT USING (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
            )
        )
    """)
    op.execute("""
        CREATE POLICY orders_insert_own ON orders
        FOR INSERT WITH CHECK (user_id = auth.uid())
    """)

    # RLS: support_tickets — users see their own; admins see all
    op.execute("""
        CREATE POLICY support_tickets_select ON support_tickets
        FOR SELECT USING (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
            )
        )
    """)
    op.execute("""
        CREATE POLICY support_tickets_insert ON support_tickets
        FOR INSERT WITH CHECK (user_id = auth.uid())
    """)

    # RLS: contractor_documents — contractor owner or admin
    op.execute("""
        CREATE POLICY contractor_documents_select ON contractor_documents
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM contractors c WHERE c.id = contractor_id AND c.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
            )
        )
    """)
    op.execute("""
        CREATE POLICY contractor_documents_insert ON contractor_documents
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM contractors c WHERE c.id = contractor_id AND c.user_id = auth.uid()
            )
        )
    """)


def downgrade() -> None:
    for table in ("orders", "support_tickets", "contractor_documents"):
        op.execute(f"DROP POLICY IF EXISTS {table}_select_own ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_insert_own ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_select ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_insert ON {table}")
    op.drop_table("contractor_documents")
    op.drop_table("support_tickets")
    op.drop_table("orders")
