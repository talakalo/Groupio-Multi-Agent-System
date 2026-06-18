"""Add read_at column to notifications table.

Revision ID: 041_notifications_read_at
Revises: 040_fix_offer_fk_constraints
Create Date: 2026-05-27
"""

import sqlalchemy as sa
from alembic import op

revision = "041_notifications_read_at"
down_revision = "040_fix_offer_fk_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column(
            "read_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    # Back-fill: set read_at = created_at for rows already marked read
    op.execute(
        "UPDATE notifications SET read_at = created_at WHERE read = TRUE AND read_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("notifications", "read_at")
