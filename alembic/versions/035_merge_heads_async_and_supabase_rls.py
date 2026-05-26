"""Merge the two parallel Alembic heads introduced during the async-events + RLS releases.

Revision ID: 035_merge_async_and_supabase_rls
Revises: 034, 034_supabase_rls_writes
Create Date: 2026-04-24

Context
-------
Between revisions 031 and 034, two independent revision chains were introduced:

    Chain A (async events + CRM refs):
        031 -> 032 (outbox_events) -> 033 (crm_external_refs) -> 034 (async_tables_rls)

    Chain B (Supabase RLS hardening):
        031 -> 032_webhook_rpc_rls -> 033_supabase_rls_core -> 034_supabase_rls_writes

Both chains share ``031`` as the common ancestor and both end on separate heads
(``034`` and ``034_supabase_rls_writes``). ``alembic upgrade head`` fails with
"Multiple head revisions are present" in that state.

This is a no-op merge revision — it introduces no DDL of its own. Its sole job
is to declare a single downstream parent so the schema graph becomes linear
again and ``alembic heads`` returns exactly one head.

This revision MUST remain empty (no upgrade/downgrade SQL). If future schema
changes are needed, add them in a new migration that depends on this one.
"""

from __future__ import annotations

from typing import Sequence, Union

# Revision identifiers used by Alembic.
revision: str = "035_merge_async_and_supabase_rls"
down_revision: Union[str, Sequence[str], None] = ("034", "034_supabase_rls_writes")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op merge — both parent chains are already applied at this point."""


def downgrade() -> None:
    """No-op merge — downgrading simply re-exposes both parent heads."""
