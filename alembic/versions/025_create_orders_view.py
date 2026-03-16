"""create user_orders view

Revision ID: 023_orders_view
Revises: 022_notification_settings
Create Date: 2026-03-16
"""

from alembic import op

revision = "025_orders_view"
down_revision = "024_notification_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE VIEW user_orders AS
        SELECT
            op.id AS participation_id,
            op.user_id,
            op.offer_id,
            o.title AS offer_title,
            o.category,
            o.status AS offer_status,
            op.status AS participation_status,
            op.joined_at,
            o.contractor_id,
            u.full_name AS contractor_name,
            COALESCE(i.amount, o.current_price) AS amount,
            COALESCE(i.status, 'pending') AS payment_status,
            i.id AS invoice_id,
            p.id AS payment_id,
            p.stripe_payment_intent_id,
            p.paid_at
        FROM offer_participants op
        JOIN offers o ON o.id = op.offer_id
        LEFT JOIN users u ON u.id = o.contractor_id
        LEFT JOIN invoices i ON i.offer_participant_id = op.id
        LEFT JOIN payments p ON p.invoice_id = i.id
        ORDER BY op.joined_at DESC
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS user_orders")
