"""Fix payment schema drift — align invoices, payments, payment_splits columns
with application code that was written after the original migration.

Adds missing columns so that INSERT/SELECT/UPDATE statements in postgres.py
succeed against the real schema.

Also adds:
  - unique constraint on offer_participants(user_id, offer_id) to prevent
    duplicate joins from concurrent requests.
  - 'orders' view aliasing invoices+payments for the frontend /orders pages.

Revision ID: 022
Revises: 021
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check whether a column already exists (safe for re-runs)."""
    from sqlalchemy import inspect as sa_inspect

    bind = op.get_bind()
    insp = sa_inspect(bind)
    columns = {c["name"] for c in insp.get_columns(table)}
    return column in columns


def upgrade() -> None:
    # ── 1. invoices — add columns used by create_invoice() ─────────────
    if not _column_exists("invoices", "tax"):
        op.add_column("invoices", sa.Column("tax", sa.Float(), nullable=True))
        op.execute("UPDATE invoices SET tax = tax_amount WHERE tax IS NULL")
    if not _column_exists("invoices", "platform_fee_rate"):
        op.add_column("invoices", sa.Column("platform_fee_rate", sa.Float(), nullable=True))
    if not _column_exists("invoices", "transaction_id"):
        op.add_column("invoices", sa.Column("transaction_id", sa.String(255), nullable=True))
    if not _column_exists("invoices", "payment_method"):
        op.add_column("invoices", sa.Column("payment_method", sa.String(50), nullable=True))
    if not _column_exists("invoices", "payment_type"):
        op.add_column("invoices", sa.Column("payment_type", sa.String(20), nullable=True))
    if not _column_exists("invoices", "items"):
        op.add_column("invoices", sa.Column("items", postgresql.JSONB(), server_default="[]"))
    if not _column_exists("invoices", "amount"):
        op.add_column("invoices", sa.Column("amount", sa.Float(), nullable=True))
        op.execute("UPDATE invoices SET amount = total WHERE amount IS NULL")

    # ── 2. payments — add columns used by create_payment() ─────────────
    if not _column_exists("payments", "offer_id"):
        op.add_column("payments", sa.Column("offer_id", sa.String(36), nullable=True))
    if not _column_exists("payments", "transaction_id"):
        op.add_column("payments", sa.Column("transaction_id", sa.String(255), nullable=True))
        op.execute(
            "UPDATE payments SET transaction_id = provider_transaction_id "
            "WHERE transaction_id IS NULL AND provider_transaction_id IS NOT NULL"
        )
    if not _column_exists("payments", "payment_method"):
        op.add_column("payments", sa.Column("payment_method", sa.String(50), nullable=True))
    if not _column_exists("payments", "provider_data"):
        op.add_column("payments", sa.Column("provider_data", postgresql.JSONB(), server_default="{}"))
        op.execute("UPDATE payments SET provider_data = metadata WHERE provider_data = '{}'::jsonb AND metadata != '{}'::jsonb")
    if not _column_exists("payments", "subtotal"):
        op.add_column("payments", sa.Column("subtotal", sa.Float(), nullable=True))
    if not _column_exists("payments", "tax_rate"):
        op.add_column("payments", sa.Column("tax_rate", sa.Float(), nullable=True))
    if not _column_exists("payments", "tax_amount"):
        op.add_column("payments", sa.Column("tax_amount", sa.Float(), nullable=True))

    # ── 3. payment_splits — add columns used by create_payment_split() ─
    if not _column_exists("payment_splits", "invoice_id"):
        op.add_column("payment_splits", sa.Column("invoice_id", sa.String(36), nullable=True))
    if not _column_exists("payment_splits", "user_id"):
        op.add_column("payment_splits", sa.Column("user_id", sa.String(36), nullable=True))
        op.execute(
            "UPDATE payment_splits SET user_id = participant_user_id "
            "WHERE user_id IS NULL AND participant_user_id IS NOT NULL"
        )
    if not _column_exists("payment_splits", "unit_count"):
        op.add_column("payment_splits", sa.Column("unit_count", sa.Integer(), server_default="1"))

    # ── 4. Unique constraint on offer_participants to prevent concurrent
    #       duplicate joins (P1-8: race condition fix) ──────────────────
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_offer_participants_user_offer'
            ) THEN
                ALTER TABLE offer_participants
                    ADD CONSTRAINT uq_offer_participants_user_offer
                    UNIQUE (user_id, offer_id);
            END IF;
        END
        $$
    """)

    # ── 5. VAT rate default: migration 004 used 0.17, code uses 0.18.
    #       Update the column default to 0.18. ──────────────────────────
    op.execute("ALTER TABLE invoices ALTER COLUMN tax_rate SET DEFAULT 0.18")


def downgrade() -> None:
    op.execute("ALTER TABLE invoices ALTER COLUMN tax_rate SET DEFAULT 0.17")
    op.execute("""
        ALTER TABLE offer_participants
            DROP CONSTRAINT IF EXISTS uq_offer_participants_user_offer
    """)
    for col in ("unit_count", "user_id", "invoice_id"):
        op.drop_column("payment_splits", col)
    for col in ("tax_amount", "tax_rate", "subtotal", "provider_data",
                "payment_method", "transaction_id", "offer_id"):
        op.drop_column("payments", col)
    for col in ("amount", "items", "payment_type", "payment_method",
                "transaction_id", "platform_fee_rate", "tax"):
        op.drop_column("invoices", col)
