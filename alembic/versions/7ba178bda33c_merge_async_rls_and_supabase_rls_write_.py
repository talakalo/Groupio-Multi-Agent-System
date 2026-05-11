"""merge async RLS and Supabase RLS write branches

Revision ID: 7ba178bda33c
Revises: 034, 034_supabase_rls_writes
Create Date: 2026-03-26 14:40:15.680262

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "7ba178bda33c"
down_revision: str | tuple[str, ...] | None = ("034", "034_supabase_rls_writes")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
