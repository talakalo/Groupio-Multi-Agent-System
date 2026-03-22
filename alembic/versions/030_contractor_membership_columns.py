"""Add contractor marketplace membership / subscription state columns.

Revision ID: 030
Revises: 029
Create Date: 2026-03-18

Supports enforcement of contractor marketplace visibility and offer creation.
Recurring billing webhooks are not included in this revision.

Chains after 029_payment_provider_column (also used revision 029 on 028).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "contractors",
        sa.Column("membership_status", sa.String(32), nullable=False, server_default="active"),
    )
    op.add_column("contractors", sa.Column("membership_plan", sa.String(64), nullable=True))
    op.add_column("contractors", sa.Column("membership_provider", sa.String(32), nullable=True))
    op.add_column("contractors", sa.Column("provider_customer_id", sa.String(255), nullable=True))
    op.add_column("contractors", sa.Column("provider_subscription_id", sa.String(255), nullable=True))
    op.add_column("contractors", sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contractors", sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contractors", sa.Column("next_billing_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "contractors",
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("contractors", sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "contractors",
        sa.Column("billing_failure_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("contractors", sa.Column("membership_grace_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contractors", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contractors", sa.Column("last_payment_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_contractors_membership_status", "contractors", ["membership_status"])


def downgrade() -> None:
    op.drop_index("ix_contractors_membership_status", table_name="contractors")
    op.drop_column("contractors", "last_payment_at")
    op.drop_column("contractors", "trial_ends_at")
    op.drop_column("contractors", "membership_grace_until")
    op.drop_column("contractors", "billing_failure_count")
    op.drop_column("contractors", "canceled_at")
    op.drop_column("contractors", "cancel_at_period_end")
    op.drop_column("contractors", "next_billing_at")
    op.drop_column("contractors", "current_period_end")
    op.drop_column("contractors", "current_period_start")
    op.drop_column("contractors", "provider_subscription_id")
    op.drop_column("contractors", "provider_customer_id")
    op.drop_column("contractors", "membership_provider")
    op.drop_column("contractors", "membership_plan")
    op.drop_column("contractors", "membership_status")
