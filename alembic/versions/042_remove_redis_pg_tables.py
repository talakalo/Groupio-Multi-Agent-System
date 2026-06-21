"""Add PostgreSQL replacement tables for all Redis usages.

Revision ID: 042_remove_redis_pg_tables
Revises: 041_notifications_read_at
Create Date: 2026-06-21

Creates the 7 tables and 2 columns needed to replace every Redis dependency
in the Groupio backend so the service runs on Render with only PostgreSQL:

  * users.locked_until (TIMESTAMPTZ NULL) — replaces temporary lockout TTL key
  * users.failed_login_count (INTEGER NOT NULL DEFAULT 0) — replaces login failure counter
  * auth_tokens — replaces refresh/password_reset/email_verify/admin_invite Redis keys
  * revoked_jwts — replaces JWT denylist (logout, suspend)
  * ip_rate_limits — replaces IP rate limiting counter
  * conversation_messages — replaces Redis conversation context (support + WhatsApp bot)
  * response_cache — replaces cache_get/cache_set in BaseAgent, gov integration, orchestration
  * scheduler_locks — replaces SET NX EX distributed lock in scheduler worker
  * ab_test_events — replaces A/B test tracking in outreach agent

All new tables have RLS enabled with a service_role policy; user-scoped
policies are added on auth_tokens and conversation_messages.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "042_remove_redis_pg_tables"
down_revision: Union[str, None] = "041_notifications_read_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Extend the users table with lockout columns                       #
    # ------------------------------------------------------------------ #
    op.add_column(
        "users",
        sa.Column("locked_until", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "failed_login_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    # ------------------------------------------------------------------ #
    # 2. auth_tokens — short-lived token store (refresh, reset, verify)   #
    # ------------------------------------------------------------------ #
    op.create_table(
        "auth_tokens",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("token_type", sa.String(length=30), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_tokens_token_hash", "auth_tokens", ["token_hash"])
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])
    op.create_index("ix_auth_tokens_expires_at", "auth_tokens", ["expires_at"])

    # ------------------------------------------------------------------ #
    # 3. revoked_jwts — JWT denylist (logout, suspend)                    #
    # ------------------------------------------------------------------ #
    op.create_table(
        "revoked_jwts",
        sa.Column("jti", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("jti"),
    )
    op.create_index("ix_revoked_jwts_expires_at", "revoked_jwts", ["expires_at"])

    # ------------------------------------------------------------------ #
    # 4. ip_rate_limits — per-IP per-minute request counter               #
    # ------------------------------------------------------------------ #
    op.create_table(
        "ip_rate_limits",
        sa.Column("ip", sa.String(length=45), nullable=False),
        sa.Column("window_start", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "request_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.PrimaryKeyConstraint("ip", "window_start"),
    )
    op.create_index(
        "ix_ip_rate_limits_window_start", "ip_rate_limits", ["window_start"]
    )

    # ------------------------------------------------------------------ #
    # 5. conversation_messages — replaces Redis conversation context       #
    # ------------------------------------------------------------------ #
    op.create_table(
        "conversation_messages",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", sa.String(length=255), nullable=False),
        # user_id is nullable: WhatsApp bot uses phone number as session_id
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_messages_session_id",
        "conversation_messages",
        ["session_id"],
    )
    op.create_index(
        "ix_conversation_messages_created_at",
        "conversation_messages",
        ["created_at"],
    )

    # ------------------------------------------------------------------ #
    # 6. response_cache — LLM, gov API, and orchestration response cache  #
    # ------------------------------------------------------------------ #
    op.create_table(
        "response_cache",
        sa.Column("cache_key", sa.String(length=512), nullable=False),
        sa.Column("data", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("cache_key"),
    )
    op.create_index("ix_response_cache_expires_at", "response_cache", ["expires_at"])

    # ------------------------------------------------------------------ #
    # 7. scheduler_locks — distributed cron lock (replaces SET NX EX)    #
    # ------------------------------------------------------------------ #
    op.create_table(
        "scheduler_locks",
        sa.Column("task_name", sa.String(length=100), nullable=False),
        sa.Column("locked_until", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("task_name"),
    )

    # ------------------------------------------------------------------ #
    # 8. ab_test_events — A/B test outcome tracking (outreach agent)      #
    # ------------------------------------------------------------------ #
    op.create_table(
        "ab_test_events",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("campaign_id", sa.String(length=100), nullable=False),
        sa.Column("variant", sa.String(length=50), nullable=False),
        sa.Column("outcome", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ab_test_events_campaign_variant",
        "ab_test_events",
        ["campaign_id", "variant"],
    )

    # ------------------------------------------------------------------ #
    # RLS — enable on all 7 new tables                                    #
    # ------------------------------------------------------------------ #

    # auth_tokens: user-scoped + service_role
    op.execute(sa.text("ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            "CREATE POLICY auth_tokens_user_policy ON auth_tokens "
            "USING (user_id = auth.uid())"
        )
    )
    op.execute(
        sa.text(
            "CREATE POLICY auth_tokens_service_policy ON auth_tokens "
            "TO service_role USING (true)"
        )
    )

    # revoked_jwts: service_role only (backend denylist — no user access)
    op.execute(sa.text("ALTER TABLE revoked_jwts ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            "CREATE POLICY revoked_jwts_service_policy ON revoked_jwts "
            "TO service_role USING (true)"
        )
    )

    # ip_rate_limits: service_role only
    op.execute(sa.text("ALTER TABLE ip_rate_limits ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            "CREATE POLICY ip_rate_limits_service_policy ON ip_rate_limits "
            "TO service_role USING (true)"
        )
    )

    # conversation_messages: user-scoped + service_role
    op.execute(
        sa.text("ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY")
    )
    op.execute(
        sa.text(
            "CREATE POLICY conversation_messages_user_policy ON conversation_messages "
            "USING (user_id = auth.uid())"
        )
    )
    op.execute(
        sa.text(
            "CREATE POLICY conversation_messages_service_policy ON conversation_messages "
            "TO service_role USING (true)"
        )
    )

    # response_cache: service_role only
    op.execute(sa.text("ALTER TABLE response_cache ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            "CREATE POLICY response_cache_service_policy ON response_cache "
            "TO service_role USING (true)"
        )
    )

    # scheduler_locks: service_role only
    op.execute(sa.text("ALTER TABLE scheduler_locks ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            "CREATE POLICY scheduler_locks_service_policy ON scheduler_locks "
            "TO service_role USING (true)"
        )
    )

    # ab_test_events: service_role only
    op.execute(sa.text("ALTER TABLE ab_test_events ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            "CREATE POLICY ab_test_events_service_policy ON ab_test_events "
            "TO service_role USING (true)"
        )
    )


def downgrade() -> None:
    # Drop in reverse dependency order (tables first, then user columns)
    op.drop_table("ab_test_events")
    op.drop_table("scheduler_locks")
    op.drop_table("response_cache")
    op.drop_table("conversation_messages")
    op.drop_table("ip_rate_limits")
    op.drop_table("revoked_jwts")
    op.drop_table("auth_tokens")
    op.drop_column("users", "failed_login_count")
    op.drop_column("users", "locked_until")
