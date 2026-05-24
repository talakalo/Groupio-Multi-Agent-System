"""Add ON DELETE CASCADE to offer_participants and contractor_reviews offer FKs.

Revision ID: 040_fix_offer_fk_constraints
Revises: 039_merge_heads
Create Date: 2026-05-24
"""

from alembic import op

revision = "040_fix_offer_fk_constraints"
down_revision = "039_merge_heads"
branch_labels = None
depends_on = None

_TABLES = ("offer_participants", "contractor_reviews")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"""
            ALTER TABLE {table}
            DROP CONSTRAINT IF EXISTS {table}_offer_id_fkey
            """
        )
        op.execute(
            f"""
            ALTER TABLE {table}
            ADD CONSTRAINT {table}_offer_id_fkey
            FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
            """
        )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"""
            ALTER TABLE {table}
            DROP CONSTRAINT IF EXISTS {table}_offer_id_fkey
            """
        )
        op.execute(
            f"""
            ALTER TABLE {table}
            ADD CONSTRAINT {table}_offer_id_fkey
            FOREIGN KEY (offer_id) REFERENCES offers(id)
            """
        )
