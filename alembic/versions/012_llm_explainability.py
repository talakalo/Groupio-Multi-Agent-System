"""Extend agent_audit_log with LLM explainability columns (Task 3.6).

Revision ID: 012
Revises: 011
Create Date: 2026-03-06
"""

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS reasoning_chain JSONB"
    )
    op.execute(
        "ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS cited_sources JSONB"
    )
    op.execute(
        "ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS alternatives_considered JSONB"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE agent_audit_log DROP COLUMN IF EXISTS reasoning_chain")
    op.execute("ALTER TABLE agent_audit_log DROP COLUMN IF EXISTS cited_sources")
    op.execute(
        "ALTER TABLE agent_audit_log DROP COLUMN IF EXISTS alternatives_considered"
    )
