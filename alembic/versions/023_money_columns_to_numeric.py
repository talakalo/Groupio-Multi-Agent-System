"""Convert Float money columns to Numeric(12,2) for precise monetary values (P3-20).

Revision ID: 023
Revises: 022
Create Date: 2026-03-16

Float→Numeric is always safe without data loss.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # invoices: subtotal, tax_amount, total, platform_fee, tax, amount
    for col in ("subtotal", "tax_amount", "total", "platform_fee", "tax", "amount"):
        op.execute(
            f'ALTER TABLE invoices ALTER COLUMN {col} TYPE NUMERIC(12,2) USING {col}::NUMERIC(12,2)'
        )

    # payments: amount, subtotal, tax_amount
    for col in ("amount", "subtotal", "tax_amount"):
        op.execute(
            f'ALTER TABLE payments ALTER COLUMN {col} TYPE NUMERIC(12,2) USING {col}::NUMERIC(12,2)'
        )

    # payment_splits: amount
    op.execute(
        'ALTER TABLE payment_splits ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2)'
    )

    # offers: base_price (price_per_unit is in pricing_tiers JSONB, not a column)
    op.execute(
        'ALTER TABLE offers ALTER COLUMN base_price TYPE NUMERIC(12,2) USING base_price::NUMERIC(12,2)'
    )


def downgrade() -> None:
    # Revert to Float
    for col in ("subtotal", "tax_amount", "total", "platform_fee", "tax", "amount"):
        op.execute(f'ALTER TABLE invoices ALTER COLUMN {col} TYPE DOUBLE PRECISION USING {col}::DOUBLE PRECISION')

    for col in ("amount", "subtotal", "tax_amount"):
        op.execute(f'ALTER TABLE payments ALTER COLUMN {col} TYPE DOUBLE PRECISION USING {col}::DOUBLE PRECISION')

    op.execute(
        'ALTER TABLE payment_splits ALTER COLUMN amount TYPE DOUBLE PRECISION USING amount::DOUBLE PRECISION'
    )

    op.execute(
        'ALTER TABLE offers ALTER COLUMN base_price TYPE DOUBLE PRECISION USING base_price::DOUBLE PRECISION'
    )
