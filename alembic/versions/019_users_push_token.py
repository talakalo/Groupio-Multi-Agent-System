"""Add push_token column to users for FCM push notifications (Phase 5).

Revision ID: 019
Revises: 018
Create Date: 2026-03-13

"""

from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("push_token", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "push_token")
