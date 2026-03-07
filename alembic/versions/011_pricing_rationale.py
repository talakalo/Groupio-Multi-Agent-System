"""Add pricing_rationale column to offers table (Task 3.4).

Revision ID: 011
Revises: 010
Create Date: 2026-03-06
"""

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS pricing_rationale TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE offers DROP COLUMN IF EXISTS pricing_rationale")
