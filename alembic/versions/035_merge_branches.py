"""Merge numeric and Supabase-RLS migration branches into a single head.

Revision ID: 035
Revises: 034, 034_supabase_rls_writes
Create Date: 2026-04-04

Context
-------
Two parallel migration branches were created starting at revision 031:

Branch A — functional tables (numeric):
  031 → 032 (outbox_events)
      → 033 (crm_external_refs)
      → 034 (async_tables_rls)

Branch B — Supabase RLS policies (named):
  031 → 032_webhook_rpc_rls
      → 033_supabase_rls_core
      → 034_supabase_rls_writes

This merge migration combines both heads so that `alembic upgrade head`
produces a deterministic result on any environment and keeps the revision
history as a single linear chain going forward.

No schema changes are made here — this is a bookkeeping revision only.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "035"
down_revision: Union[str, tuple] = ("034", "034_supabase_rls_writes")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No schema changes — merge point only."""
    pass


def downgrade() -> None:
    """No schema changes — merge point only."""
    pass
