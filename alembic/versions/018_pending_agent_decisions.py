"""Add pending_agent_decisions table for autonomy mode approval workflow (Phase 3).

Revision ID: 018
Revises: 017
Create Date: 2026-03-13

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pending_agent_decisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("agent_name", sa.String(50), nullable=False),
        sa.Column("conversation_id", sa.String(36), nullable=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("escalation_reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("decided_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_pending_agent_decisions_status", "pending_agent_decisions", ["status"])
    op.create_index("ix_pending_agent_decisions_agent_name", "pending_agent_decisions", ["agent_name"])
    op.create_index("ix_pending_agent_decisions_created_at", "pending_agent_decisions", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_pending_agent_decisions_created_at", "pending_agent_decisions")
    op.drop_index("ix_pending_agent_decisions_agent_name", "pending_agent_decisions")
    op.drop_index("ix_pending_agent_decisions_status", "pending_agent_decisions")
    op.drop_table("pending_agent_decisions")
