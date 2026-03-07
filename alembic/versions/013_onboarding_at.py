"""Add onboarded_at column to users table.

Tracks when a user completed the onboarding flow (resident or contractor).
NULL means the user has not yet finished onboarding.
Existing rows are left NULL, which is the correct initial state.

Revision ID: 013
Revises: 012
Create Date: 2026-03-06
"""

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS onboarded_at")
