"""Add agent_audit_log table for AI decision persistence.

Revision ID: 010
Revises: 009
Create Date: 2026-03-01

Every LLM invocation by any agent is persisted to this table,
providing a durable audit trail that survives app restarts.
Matching, Pricing, and Vetting decisions are flagged for human review.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE agent_audit_log (
            id VARCHAR(36) PRIMARY KEY,
            session_id VARCHAR(36),
            user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
            agent_name VARCHAR(50) NOT NULL,
            action VARCHAR(100) NOT NULL,
            input_summary TEXT,
            output_summary TEXT,
            model_used VARCHAR(50),
            tokens_used INTEGER,
            latency_ms INTEGER,
            confidence_score FLOAT,
            requires_human_review BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX ix_agent_audit_user ON agent_audit_log(user_id)"
    )
    op.execute(
        "CREATE INDEX ix_agent_audit_agent ON agent_audit_log(agent_name, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_agent_audit_agent")
    op.execute("DROP INDEX IF EXISTS ix_agent_audit_user")
    op.execute("DROP TABLE IF EXISTS agent_audit_log")
