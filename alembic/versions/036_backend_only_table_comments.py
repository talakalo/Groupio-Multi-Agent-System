"""Document backend-only tables via COMMENT ON TABLE so their access model is explicit.

Revision ID: 036_backend_only_table_comments
Revises: 035_merge_async_and_supabase_rls
Create Date: 2026-04-24

The release audit flagged seven tables that have RLS enabled but no explicit
SELECT/INSERT/UPDATE/DELETE policies for the ``anon`` / ``authenticated``
Supabase roles. PostgreSQL correctly denies access by default — service role
(used by the FastAPI backend) bypasses RLS and continues to work — but the
absence of any named policy makes the intent invisible to future maintainers.

This migration records the intent directly on each table via
``COMMENT ON TABLE``. It performs no schema change. Tables covered:

    - stripe_webhook_events   — webhook idempotency ledger
    - outbox_events           — transactional outbox
    - crm_external_refs       — Groupio ↔ EspoCRM id mapping
    - pending_agent_decisions — autonomy-mode approval queue
    - credit_awards           — influencer reward ledger (admin-approved)
    - outreach_queue          — outreach campaign queue (admin-approved)
    - agent_audit_log         — LLM decision audit trail

If a future migration adds a policy for ``anon``/``authenticated`` on any of
these tables, it MUST update the comment to reflect the new access model.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "036_backend_only_table_comments"
down_revision: Union[str, None] = "035_merge_async_and_supabase_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BACKEND_ONLY_TABLES: dict[str, str] = {
    "stripe_webhook_events": (
        "Backend-only. Stripe webhook idempotency ledger; written by "
        "/api/v1/payments/webhook/stripe, read only for dedup. No anon/"
        "authenticated RLS policy by design."
    ),
    "outbox_events": (
        "Backend-only. Transactional outbox; polled by "
        "src.workers.outbox_dispatcher and published to RabbitMQ. No anon/"
        "authenticated RLS policy by design."
    ),
    "crm_external_refs": (
        "Backend-only. Groupio → EspoCRM id mapping used by "
        "src.integrations.espocrm. No anon/authenticated RLS policy by design."
    ),
    "pending_agent_decisions": (
        "Backend-only. Autonomy-mode approval queue consumed by admin UI via "
        "service-role FastAPI endpoints. No anon/authenticated RLS policy by "
        "design."
    ),
    "credit_awards": (
        "Backend-only. Influencer credit ledger; reads and writes happen "
        "exclusively through admin endpoints (src.api.routes.admin). No "
        "anon/authenticated RLS policy by design."
    ),
    "outreach_queue": (
        "Backend-only. Outreach campaign approval queue; admin-only writes. "
        "No anon/authenticated RLS policy by design."
    ),
    "agent_audit_log": (
        "Backend-only. LLM decision audit trail; admin-only reads via "
        "src.api.routes.admin. No anon/authenticated RLS policy by design."
    ),
}


def _table_exists(conn, table: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ),
            {"t": table},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()
    for table, comment in _BACKEND_ONLY_TABLES.items():
        if not _table_exists(conn, table):
            continue
        # :: parameter style won't work inside COMMENT; build the literal safely.
        op.execute(sa.text(f"COMMENT ON TABLE {table} IS :c").bindparams(c=comment))


def downgrade() -> None:
    conn = op.get_bind()
    for table in _BACKEND_ONLY_TABLES:
        if not _table_exists(conn, table):
            continue
        op.execute(f"COMMENT ON TABLE {table} IS NULL")
