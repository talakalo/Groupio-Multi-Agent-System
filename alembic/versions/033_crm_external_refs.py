"""CRM external id mapping (Groupio ↔ EspoCRM).

Revision ID: 033
Revises: 032
Create Date: 2026-03-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crm_external_refs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("groupio_id", sa.String(64), nullable=False),
        sa.Column("crm_entity_type", sa.String(100), nullable=False),
        sa.Column("crm_id", sa.String(128), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "uq_crm_external_refs_entity_groupio",
        "crm_external_refs",
        ["entity_type", "groupio_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_crm_external_refs_entity_groupio", table_name="crm_external_refs")
    op.drop_table("crm_external_refs")
