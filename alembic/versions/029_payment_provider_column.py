"""Add explicit provider_name column to payments and invoices tables.

This migration adds:
  - payments.provider_name  — the payment provider used (stripe | bit | paybox | mock)
  - payments.provider_ref   — the provider-specific reference/charge ID (aliases
                              provider_transaction_id for new providers)
  - invoices.provider_name  — mirrors the provider on the invoice for reporting

These columns enable multi-provider support and are required for:
  1. Clear audit trail of which provider processed each payment
  2. Reconciliation between Groupio records and provider dashboards
  3. Provider-specific webhook routing (bit / PayBox callbacks)

Note: existing rows will default to NULL (unknown provider) — a data backfill
is provided below to set `provider_name = 'stripe'` for any payment that has
a Stripe-style transaction_id (starting with 'pi_' or 'ch_').

Revision ID: 029
Revises: 028
Create Date: 2026-03-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    insp = sa_inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    # ── 1. payments.provider_name ────────────────────────────────────────────
    if not _column_exists("payments", "provider_name"):
        op.add_column(
            "payments",
            sa.Column("provider_name", sa.String(20), nullable=True),
        )
        # Best-effort backfill: Stripe PaymentIntents start with 'pi_',
        # Stripe charges with 'ch_'.  Mock IDs start with 'txn_'.
        op.execute("""
            UPDATE payments
            SET provider_name = CASE
                WHEN transaction_id ILIKE 'pi_%' THEN 'stripe'
                WHEN transaction_id ILIKE 'ch_%' THEN 'stripe'
                WHEN transaction_id ILIKE 'txn_%' THEN 'mock'
                ELSE NULL
            END
            WHERE provider_name IS NULL AND transaction_id IS NOT NULL
        """)
        op.create_index("idx_payments_provider_name", "payments", ["provider_name"])

    # ── 2. payments.provider_ref ─────────────────────────────────────────────
    # A normalised column that stores the provider's own reference for the
    # charge (separate from our internal transaction_id).  Populated from
    # provider_transaction_id for legacy rows.
    if not _column_exists("payments", "provider_ref"):
        op.add_column(
            "payments",
            sa.Column("provider_ref", sa.String(255), nullable=True),
        )
        op.execute("""
            UPDATE payments
            SET provider_ref = provider_transaction_id
            WHERE provider_ref IS NULL AND provider_transaction_id IS NOT NULL
        """)

    # ── 3. invoices.provider_name ────────────────────────────────────────────
    if not _column_exists("invoices", "provider_name"):
        op.add_column(
            "invoices",
            sa.Column("provider_name", sa.String(20), nullable=True),
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_payments_provider_name")
    for col in ("provider_ref", "provider_name"):
        try:
            op.drop_column("payments", col)
        except Exception:
            pass
    try:
        op.drop_column("invoices", "provider_name")
    except Exception:
        pass
