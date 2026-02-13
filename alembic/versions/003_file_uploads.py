"""Add file_uploads table for architecture plans, contractor docs, avatars, invoices.

Revision ID: 003
Revises: 002
Create Date: 2026-02-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_uploads",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("bucket", sa.String(50), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("thumbnail_path", sa.String(500), nullable=True),
        sa.Column(
            "analysis_status",
            sa.String(20),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("analysis_result", postgresql.JSONB(), nullable=True),
        sa.Column(
            "building_id", sa.String(36), sa.ForeignKey("buildings.id"), nullable=True
        ),
        sa.Column("metadata", postgresql.JSONB(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("idx_file_uploads_user", "file_uploads", ["user_id"])
    op.create_index("idx_file_uploads_building", "file_uploads", ["building_id"])
    op.create_index("idx_file_uploads_bucket", "file_uploads", ["bucket"])
    op.create_index(
        "idx_file_uploads_analysis_status", "file_uploads", ["analysis_status"]
    )


def downgrade() -> None:
    op.drop_index("idx_file_uploads_analysis_status", "file_uploads")
    op.drop_index("idx_file_uploads_bucket", "file_uploads")
    op.drop_index("idx_file_uploads_building", "file_uploads")
    op.drop_index("idx_file_uploads_user", "file_uploads")
    op.drop_table("file_uploads")
