"""Add missing FK indexes for performance.

Revision ID: 005
Revises: 004
Create Date: 2026-02-27

Missing indexes identified in production-readiness audit:
- building_residents.user_id, building_residents.building_id
- offer_participants.offer_id, offer_participants.user_id
- offers.matched_contractor_id
- escalations.user_id
"""
from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # building_residents — FK columns without indexes
    op.create_index("idx_building_residents_user_id", "building_residents", ["user_id"])
    op.create_index("idx_building_residents_building_id", "building_residents", ["building_id"])

    # offer_participants — FK columns without indexes
    op.create_index("idx_offer_participants_offer_id", "offer_participants", ["offer_id"])
    op.create_index("idx_offer_participants_user_id", "offer_participants", ["user_id"])

    # offers — matched_contractor_id FK without index
    op.create_index("idx_offers_matched_contractor_id", "offers", ["matched_contractor_id"])

    # escalations — user_id FK without index (status/priority/assigned_to already indexed)
    op.create_index("idx_escalations_user_id", "escalations", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_escalations_user_id", "escalations")
    op.drop_index("idx_offers_matched_contractor_id", "offers")
    op.drop_index("idx_offer_participants_user_id", "offer_participants")
    op.drop_index("idx_offer_participants_offer_id", "offer_participants")
    op.drop_index("idx_building_residents_building_id", "building_residents")
    op.drop_index("idx_building_residents_user_id", "building_residents")
