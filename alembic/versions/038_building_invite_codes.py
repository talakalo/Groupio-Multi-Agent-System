"""Stored, rotatable invite codes for buildings.

Revision ID: 038_building_invite_codes
Revises: 037_rls_tenant_scoped_app_policies
Create Date: 2026-04-25

Replaces the deterministic ``building_id[:8]``-derived invite code with a
proper column:

  * ``buildings.invite_code TEXT`` — base32-style token (not a UUID prefix)
  * unique partial index so codes never collide
  * existing rows are backfilled from the legacy derivation so deployed
    invitations keep working through the cutover
  * a new ``regenerate-invite`` admin endpoint can rotate the code without
    changing the building id

The migration is reversible — ``downgrade()`` drops the column and the
unique index. The route layer keeps reading ``invite_code`` first and falls
back to the derivation only when the column is NULL (during the deploy
window between migration apply and route restart).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "038_building_invite_codes"
down_revision: Union[str, None] = "037_rls_tenant_scoped_app_policies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Add the column nullable (we'll populate it before flipping NOT NULL
    #    is left optional — a NULL column means "use the legacy derivation").
    has_column = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'buildings' "
            "AND column_name = 'invite_code'"
        )
    ).scalar()
    if not has_column:
        op.add_column(
            "buildings",
            sa.Column("invite_code", sa.String(length=32), nullable=True),
        )

    # 2. Backfill: legacy derivation was building_id.replace('-', '')[:8].upper().
    #    Keep that exact value so existing share links keep resolving.
    op.execute(
        """
        UPDATE buildings
        SET invite_code = UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 8))
        WHERE invite_code IS NULL
        """
    )

    # 3. Unique index — partial so older rows that legitimately remain NULL
    #    (theoretical, since the backfill above runs first) don't collide.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_buildings_invite_code "
        "ON buildings (invite_code) WHERE invite_code IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_buildings_invite_code")
    bind = op.get_bind()
    has_column = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'buildings' "
            "AND column_name = 'invite_code'"
        )
    ).scalar()
    if has_column:
        op.drop_column("buildings", "invite_code")
