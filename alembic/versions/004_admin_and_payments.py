"""Add admin features (audit_logs, system_settings) and payment tables.

Revision ID: 004
Revises: 003
Create Date: 2026-02-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- audit_logs ----
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(36), nullable=True),
        sa.Column("details", postgresql.JSONB(), server_default="{}"),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("idx_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("idx_audit_logs_action", "audit_logs", ["action"])

    # ---- system_settings ----
    op.create_table(
        "system_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(100), unique=True, nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column(
            "updated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("idx_system_settings_key", "system_settings", ["key"])

    # ---- payment_methods ----
    op.create_table(
        "payment_methods",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("provider_token", sa.String(255), nullable=True),
        sa.Column("last_four", sa.String(4), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # ---- invoices ----
    op.create_table(
        "invoices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "offer_id", sa.String(36), sa.ForeignKey("offers.id"), nullable=False
        ),
        sa.Column(
            "contractor_id",
            sa.String(36),
            sa.ForeignKey("contractors.id"),
            nullable=True,
        ),
        sa.Column("invoice_number", sa.String(50), unique=True, nullable=True),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("subtotal", sa.Float(), nullable=False),
        sa.Column("tax_rate", sa.Float(), server_default="0.17"),
        sa.Column("tax", sa.Float(), server_default="0"),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("platform_fee_rate", sa.Float(), server_default="0.05"),
        sa.Column("platform_fee", sa.Float(), server_default="0"),
        sa.Column("currency", sa.String(3), server_default="'ILS'"),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("transaction_id", sa.String(255), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("pdf_path", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("idx_invoices_offer_id", "invoices", ["offer_id"])
    op.create_index("idx_invoices_status", "invoices", ["status"])

    # ---- payments ----
    op.create_table(
        "payments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "invoice_id", sa.String(36), sa.ForeignKey("invoices.id"), nullable=True
        ),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "offer_id", sa.String(36), sa.ForeignKey("offers.id"), nullable=True
        ),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="'ILS'"),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("transaction_id", sa.String(255), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column(
            "payment_method_id",
            sa.String(36),
            sa.ForeignKey("payment_methods.id"),
            nullable=True,
        ),
        sa.Column("provider_data", postgresql.JSONB(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("idx_payments_user_id", "payments", ["user_id"])
    op.create_index("idx_payments_status", "payments", ["status"])
    op.create_index("idx_payments_transaction_id", "payments", ["transaction_id"])

    # ---- payment_splits ----
    op.create_table(
        "payment_splits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "invoice_id", sa.String(36), sa.ForeignKey("invoices.id"), nullable=False
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("unit_count", sa.Integer(), server_default="1"),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # ---- ALTER users: add totp_secret ----
    op.add_column("users", sa.Column("totp_secret", sa.String(255), nullable=True))


def downgrade() -> None:
    # Drop column first
    op.drop_column("users", "totp_secret")

    # Drop tables in reverse order
    op.drop_table("payment_splits")

    op.drop_index("idx_payments_transaction_id", "payments")
    op.drop_index("idx_payments_status", "payments")
    op.drop_index("idx_payments_user_id", "payments")
    op.drop_table("payments")

    op.drop_index("idx_invoices_status", "invoices")
    op.drop_index("idx_invoices_offer_id", "invoices")
    op.drop_table("invoices")

    op.drop_table("payment_methods")

    op.drop_index("idx_system_settings_key", "system_settings")
    op.drop_table("system_settings")

    op.drop_index("idx_audit_logs_action", "audit_logs")
    op.drop_index("idx_audit_logs_created_at", "audit_logs")
    op.drop_index("idx_audit_logs_user_id", "audit_logs")
    op.drop_table("audit_logs")
