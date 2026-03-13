"""Add credit_awards table for influencer reward tracking (Phase 4).

Revision ID: 017
Revises: 016
Create Date: 2026-03-13

"""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_awards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resident_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_approval"),
        sa.Column("approved_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_credit_awards_resident_id", "credit_awards", ["resident_id"])
    op.create_index("ix_credit_awards_status", "credit_awards", ["status"])


def downgrade() -> None:
    op.drop_index("ix_credit_awards_status", "credit_awards")
    op.drop_index("ix_credit_awards_resident_id", "credit_awards")
    op.drop_table("credit_awards")
