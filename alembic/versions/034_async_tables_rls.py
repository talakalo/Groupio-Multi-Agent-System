"""Enable RLS on internal async tables (PostgREST safety).

Revision ID: 034
Revises: 033
Create Date: 2026-03-25

``outbox_events`` and ``crm_external_refs`` are backend-only. Enabling RLS without
policies for ``anon`` / ``authenticated`` denies row access via Supabase PostgREST while
the table owner and ``service_role`` connections used by the API continue to work as before.

No client-facing product paths should read these tables with the anon key.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE crm_external_refs ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("ALTER TABLE crm_external_refs DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE outbox_events DISABLE ROW LEVEL SECURITY")
