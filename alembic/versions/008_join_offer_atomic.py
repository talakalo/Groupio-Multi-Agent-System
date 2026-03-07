"""Add join_offer_atomic Postgres function for race-free offer joining.

Revision ID: 008
Revises: 007
Create Date: 2026-03-01

Replaces the read-modify-write pattern in join_offer with a single atomic
stored procedure that uses an implicit transaction.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION join_offer_atomic(
            p_id VARCHAR,
            p_offer_id VARCHAR,
            p_user_id VARCHAR,
            p_unit_count INT
        ) RETURNS VOID AS $$
        BEGIN
            INSERT INTO offer_participants (id, offer_id, user_id, unit_count)
            VALUES (p_id, p_offer_id, p_user_id, p_unit_count);

            UPDATE offers
            SET current_participants = current_participants + p_unit_count
            WHERE id = p_offer_id AND status IN ('pending', 'matching');

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Offer not joinable or does not exist';
            END IF;
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS join_offer_atomic(VARCHAR, VARCHAR, VARCHAR, INT)")
