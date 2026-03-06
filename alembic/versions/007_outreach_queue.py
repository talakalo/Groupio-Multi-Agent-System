"""Add outreach_queue table for human approval gate.

Revision ID: 007
Revises: 006
Create Date: 2026-03-01

All outreach campaigns must be approved by an admin before being dispatched.
This table holds pending, approved, and rejected messages.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE outreach_queue (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) REFERENCES users(id),
            campaign_type VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            variant VARCHAR(50),
            status VARCHAR(20) DEFAULT 'pending_approval',
            approved_by VARCHAR(36) REFERENCES users(id),
            approved_at TIMESTAMP,
            sent_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX ix_outreach_queue_status ON outreach_queue(status)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_outreach_queue_status")
    op.execute("DROP TABLE IF EXISTS outreach_queue")
