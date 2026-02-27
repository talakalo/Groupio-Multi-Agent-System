"""Add chat message retention policy (90-day archive).

Revision ID: 006
Revises: 005
Create Date: 2026-02-27

Implements a lightweight retention strategy for chat_messages:
  1. Moves messages older than 90 days into chat_messages_archive.
  2. Adds a partial index on created_at to speed up the nightly cleanup query.

The archive table schema mirrors the live table so rows can be restored if
needed (e.g. for legal hold). A cron / pg_cron job should run the cleanup
monthly — this migration only creates the structure.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RETENTION_DAYS = 90


def upgrade() -> None:
    # 1. Archive table — mirrors chat_messages; no FK constraints so rows are
    #    self-contained and can survive the deletion of the source conversation.
    op.create_table(
        "chat_messages_archive",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("sender_type", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("archived_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_chat_archive_conversation_id",
        "chat_messages_archive",
        ["conversation_id"],
    )
    op.create_index(
        "idx_chat_archive_created_at",
        "chat_messages_archive",
        ["created_at"],
    )

    # 2. Partial index on chat_messages.created_at for old-row queries.
    #    The predicate skips recent rows so the index stays small.
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS idx_chat_messages_old_rows
            ON chat_messages (created_at)
            WHERE created_at < NOW() - INTERVAL '{_RETENTION_DAYS} days'
        """
    )

    # 3. Immediately archive any existing messages older than 90 days.
    op.execute(
        f"""
        WITH moved AS (
            DELETE FROM chat_messages
            WHERE created_at < NOW() - INTERVAL '{_RETENTION_DAYS} days'
            RETURNING id, conversation_id, user_id, sender_type, content,
                      metadata, created_at
        )
        INSERT INTO chat_messages_archive
            (id, conversation_id, user_id, sender_type, content,
             metadata, created_at)
        SELECT id, conversation_id, user_id, sender_type, content,
               metadata, created_at
        FROM moved
        """
    )

    # 4. Create a SQL function for recurring cleanup (call from pg_cron or app).
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION archive_old_chat_messages()
        RETURNS INTEGER
        LANGUAGE plpgsql
        AS $$
        DECLARE
            archived_count INTEGER;
        BEGIN
            WITH moved AS (
                DELETE FROM chat_messages
                WHERE created_at < NOW() - INTERVAL '{_RETENTION_DAYS} days'
                RETURNING id, conversation_id, user_id, sender_type, content,
                          metadata, created_at
            )
            INSERT INTO chat_messages_archive
                (id, conversation_id, user_id, sender_type, content,
                 metadata, created_at)
            SELECT id, conversation_id, user_id, sender_type, content,
                   metadata, created_at
            FROM moved;

            GET DIAGNOSTICS archived_count = ROW_COUNT;
            RETURN archived_count;
        END;
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS archive_old_chat_messages()")
    op.execute("DROP INDEX IF EXISTS idx_chat_messages_old_rows")
    op.drop_table("chat_messages_archive")
