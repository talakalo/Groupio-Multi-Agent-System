"""Initial database schema

Revision ID: 001
Revises: None
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(100), nullable=False),
        sa.Column('phone', sa.String(20), unique=True, nullable=False),
        sa.Column('role', sa.String(20), nullable=False, default='resident'),
        sa.Column('preferred_language', sa.String(5), default='he'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_verified', sa.Boolean(), default=False),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('building_id', sa.String(36), nullable=True),
        sa.Column('contractor_id', sa.String(36), nullable=True),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_index('ix_users_phone', 'users', ['phone'])

    # Buildings table
    op.create_table(
        'buildings',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('address', sa.String(500), nullable=False),
        sa.Column('city', sa.String(100), nullable=False),
        sa.Column('region', sa.String(50), nullable=False),
        sa.Column('total_units', sa.Integer(), nullable=False),
        sa.Column('floors', sa.Integer(), nullable=False),
        sa.Column('year_built', sa.Integer(), nullable=True),
        sa.Column('admin_user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('resident_count', sa.Integer(), default=0),
        sa.Column('active_offers', sa.Integer(), default=0),
        sa.Column('completed_offers', sa.Integer(), default=0),
        sa.Column('total_savings', sa.Float(), default=0),
        sa.Column('whatsapp_group_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_buildings_city', 'buildings', ['city'])
    op.create_index('ix_buildings_region', 'buildings', ['region'])

    # Building residents junction table
    op.create_table(
        'building_residents',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('building_id', sa.String(36), sa.ForeignKey('buildings.id'), nullable=False),
        sa.Column('unit_number', sa.String(20), nullable=False),
        sa.Column('floor', sa.Integer(), nullable=False),
        sa.Column('is_owner', sa.Boolean(), default=True),
        sa.Column('joined_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('building_id', 'unit_number', name='uq_building_unit'),
    )

    # Contractors table
    op.create_table(
        'contractors',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('business_name', sa.String(200), nullable=False),
        sa.Column('contact_name', sa.String(100), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('categories', postgresql.ARRAY(sa.String(50)), nullable=False),
        sa.Column('regions', postgresql.ARRAY(sa.String(50)), nullable=False),
        sa.Column('years_experience', sa.Integer(), nullable=False),
        sa.Column('employee_count', sa.Integer(), nullable=False),
        sa.Column('website', sa.String(500), nullable=True),
        sa.Column('verification_status', sa.String(20), default='pending'),
        sa.Column('trust_score', sa.Float(), default=0),
        sa.Column('trust_score_breakdown', postgresql.JSONB(), nullable=True),
        sa.Column('license_number', sa.String(50), nullable=True),
        sa.Column('license_verified', sa.Boolean(), default=False),
        sa.Column('insurance_expiry', sa.DateTime(), nullable=True),
        sa.Column('insurance_verified', sa.Boolean(), default=False),
        sa.Column('certifications', postgresql.ARRAY(sa.String(100)), default=[]),
        sa.Column('average_rating', sa.Float(), default=0),
        sa.Column('total_reviews', sa.Integer(), default=0),
        sa.Column('completed_projects', sa.Integer(), default=0),
        sa.Column('response_rate', sa.Float(), default=0),
        sa.Column('average_response_time_hours', sa.Float(), default=0),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_contractors_verification_status', 'contractors', ['verification_status'])
    op.create_index('ix_contractors_trust_score', 'contractors', ['trust_score'])

    # Offers table
    op.create_table(
        'offers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('base_price', sa.Float(), nullable=False),
        sa.Column('min_participants', sa.Integer(), default=5),
        sa.Column('max_participants', sa.Integer(), default=50),
        sa.Column('deadline', sa.DateTime(), nullable=True),
        sa.Column('building_id', sa.String(36), sa.ForeignKey('buildings.id'), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(20), default='draft'),
        sa.Column('current_participants', sa.Integer(), default=0),
        sa.Column('matched_contractor_id', sa.String(36), sa.ForeignKey('contractors.id'), nullable=True),
        sa.Column('pricing_tiers', postgresql.JSONB(), default=[]),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_offers_building_id', 'offers', ['building_id'])
    op.create_index('ix_offers_status', 'offers', ['status'])
    op.create_index('ix_offers_category', 'offers', ['category'])

    # Offer participants junction table
    op.create_table(
        'offer_participants',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('offer_id', sa.String(36), sa.ForeignKey('offers.id'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('unit_count', sa.Integer(), default=1),
        sa.Column('joined_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('offer_id', 'user_id', name='uq_offer_participant'),
    )

    # Contractor reviews table
    op.create_table(
        'contractor_reviews',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('contractor_id', sa.String(36), sa.ForeignKey('contractors.id'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('offer_id', sa.String(36), sa.ForeignKey('offers.id'), nullable=False),
        sa.Column('rating', sa.Float(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('contractor_id', 'user_id', 'offer_id', name='uq_contractor_review'),
    )

    # Escalations table
    op.create_table(
        'escalations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('conversation_id', sa.String(36), nullable=False),
        sa.Column('source_agent', sa.String(50), nullable=False),
        sa.Column('reason', sa.String(50), nullable=False),
        sa.Column('priority', sa.String(20), default='medium'),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), default='open'),
        sa.Column('assigned_to', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('context', postgresql.JSONB(), default={}),
        sa.Column('agent_reasoning', sa.Text(), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_escalations_status', 'escalations', ['status'])
    op.create_index('ix_escalations_priority', 'escalations', ['priority'])
    op.create_index('ix_escalations_assigned_to', 'escalations', ['assigned_to'])

    # Escalation messages table
    op.create_table(
        'escalation_messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('escalation_id', sa.String(36), sa.ForeignKey('escalations.id'), nullable=False),
        sa.Column('sender_type', sa.String(20), nullable=False),
        sa.Column('sender_id', sa.String(36), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Chat messages table (for conversation history)
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('conversation_id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('sender_type', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(), default={}),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_chat_messages_conversation_id', 'chat_messages', ['conversation_id'])
    op.create_index('ix_chat_messages_user_id', 'chat_messages', ['user_id'])

    # Agent metrics table
    op.create_table(
        'agent_metrics',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('agent_name', sa.String(50), nullable=False),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(), default={}),
        sa.Column('recorded_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_agent_metrics_agent_name', 'agent_metrics', ['agent_name'])
    op.create_index('ix_agent_metrics_recorded_at', 'agent_metrics', ['recorded_at'])

    # Invitations table
    op.create_table(
        'invitations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('building_id', sa.String(36), sa.ForeignKey('buildings.id'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('invited_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('invitations')
    op.drop_table('agent_metrics')
    op.drop_table('chat_messages')
    op.drop_table('escalation_messages')
    op.drop_table('escalations')
    op.drop_table('contractor_reviews')
    op.drop_table('offer_participants')
    op.drop_table('offers')
    op.drop_table('contractors')
    op.drop_table('building_residents')
    op.drop_table('buildings')
    op.drop_table('users')
