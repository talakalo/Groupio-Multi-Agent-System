"""Add municipality enrichment columns to buildings (Phase 2).

Revision ID: 016
Revises: 015
Create Date: 2026-03-10

"""

from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("buildings", sa.Column("municipality_code", sa.String(20), nullable=True))
    op.add_column("buildings", sa.Column("municipality_name", sa.String(200), nullable=True))
    op.add_column("buildings", sa.Column("address_normalized", sa.String(500), nullable=True))
    op.add_column("buildings", sa.Column("enrichment_confidence", sa.Float(), nullable=True))
    op.add_column("buildings", sa.Column("enrichment_source", sa.String(100), nullable=True))
    op.add_column("buildings", sa.Column("enriched_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("buildings", "enriched_at")
    op.drop_column("buildings", "enrichment_source")
    op.drop_column("buildings", "enrichment_confidence")
    op.drop_column("buildings", "address_normalized")
    op.drop_column("buildings", "municipality_name")
    op.drop_column("buildings", "municipality_code")
