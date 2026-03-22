"""add notification_settings to users

Revision ID: 022_notification_settings
Revises: 021
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024_notification_settings"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "notification_settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default='{"email_offers": true, "email_orders": true, "email_payments": true, "push_offers": true, "push_orders": true, "push_payments": true, "sms_critical": true}',
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notification_settings")
