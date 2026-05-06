"""Merge 036_missing_core_tables and 038_building_invite_codes heads.

Revision ID: 039_merge_heads
Revises: 036, 038_building_invite_codes
Create Date: 2026-05-06 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "039_merge_heads"
down_revision: Union[str, Sequence[str], None] = ("036", "038_building_invite_codes")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
