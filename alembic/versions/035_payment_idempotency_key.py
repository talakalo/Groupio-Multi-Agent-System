"""Add idempotency_key to payments; fix join_offer_atomic for unique constraint.

Adds payments.idempotency_key so that POST /payments/initiate can detect and
return an existing payment for duplicate client submissions, preventing double
charges.

Also updates the join_offer_atomic stored procedure to use ON CONFLICT DO
NOTHING so a duplicate join request raises a clean error rather than crashing
with a UniqueViolationError 500.

Revision ID: 035
Revises: 034, 034_supabase_rls_writes
Create Date: 2026-05-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "035"
down_revision: Union[tuple, None] = ("034", "034_supabase_rls_writes")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    insp = sa_inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    # ── 1. payments.idempotency_key ─────────────────────────────────────────
    if not _column_exists("payments", "idempotency_key"):
        op.add_column(
            "payments",
            sa.Column("idempotency_key", sa.String(255), nullable=True),
        )
        op.create_index(
            "idx_payments_idempotency_key",
            "payments",
            ["idempotency_key"],
            unique=True,
            postgresql_where=sa.text("idempotency_key IS NOT NULL"),
        )

    # ── 2. join_offer_atomic — handle unique constraint gracefully ──────────
    # DROP first: return type changed from VOID (008) to BOOLEAN, and
    # CREATE OR REPLACE cannot change the return type in PostgreSQL.
    op.execute(
        "DROP FUNCTION IF EXISTS join_offer_atomic(VARCHAR, VARCHAR, VARCHAR, INT)"
    )
    op.execute("""
        CREATE OR REPLACE FUNCTION join_offer_atomic(
            p_id VARCHAR,
            p_offer_id VARCHAR,
            p_user_id VARCHAR,
            p_unit_count INT
        ) RETURNS BOOLEAN AS $$
        DECLARE
            v_inserted INT;
        BEGIN
            INSERT INTO offer_participants (id, offer_id, user_id, unit_count)
            VALUES (p_id, p_offer_id, p_user_id, p_unit_count)
            ON CONFLICT (user_id, offer_id) DO NOTHING;

            GET DIAGNOSTICS v_inserted = ROW_COUNT;

            IF v_inserted = 0 THEN
                -- Already joined — return false so callers can distinguish
                RETURN FALSE;
            END IF;

            UPDATE offers
            SET current_participants = current_participants + p_unit_count
            WHERE id = p_offer_id AND status IN ('pending', 'matching');

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Offer not joinable or does not exist';
            END IF;

            RETURN TRUE;
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
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

    try:
        op.drop_index("idx_payments_idempotency_key", "payments")
    except Exception:
        pass
    try:
        op.drop_column("payments", "idempotency_key")
    except Exception:
        pass
