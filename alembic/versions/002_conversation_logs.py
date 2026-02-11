"""Add conversation_logs table for chat logging

Revision ID: 002
Revises: 001
Create Date: 2025-02-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversation_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("response", postgresql.JSONB(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), default={}),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_conversation_logs_user_id", "conversation_logs", ["user_id"])
    op.create_index("ix_conversation_logs_created_at", "conversation_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_conversation_logs_created_at", "conversation_logs")
    op.drop_index("ix_conversation_logs_user_id", "conversation_logs")
    op.drop_table("conversation_logs")
