"""Add contractor_verification_metadata table for audit trail of external verification.

Stores verification results from government/open-data sources for contractor license checks.

Revision ID: 015
Revises: 014
Create Date: 2025-03-10

"""

from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contractor_verification_metadata",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("contractor_id", sa.String(36), sa.ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("raw_response", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_contractor_verification_metadata_contractor_id",
        "contractor_verification_metadata",
        ["contractor_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_contractor_verification_metadata_contractor_id", table_name="contractor_verification_metadata")
    op.drop_table("contractor_verification_metadata")
