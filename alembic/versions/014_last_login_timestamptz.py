"""Change last_login to TIMESTAMPTZ for timezone-aware datetime support.

asyncpg fails with "can't subtract offset-naive and offset-aware datetimes"
when passing datetime.now(UTC) to a TIMESTAMP (naive) column.
Using TIMESTAMPTZ fixes this.

Revision ID: 014
Revises: 013
Create Date: 2026-03-10

"""

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ALTER COLUMN last_login TYPE TIMESTAMP WITH TIME ZONE USING last_login AT TIME ZONE 'UTC'"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE users ALTER COLUMN last_login TYPE TIMESTAMP WITHOUT TIME ZONE USING last_login AT TIME ZONE 'UTC'"
    )
