"""Add working video category and audience.

Revision ID: 0010_video_working_settings
Revises: 0009_local_playlist_drafts
Create Date: 2026-10-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_video_working_settings"
down_revision = "0009_local_playlist_drafts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("category", sa.String(length=32), nullable=True))
    op.add_column("videos", sa.Column("working_base_category", sa.String(length=32), nullable=True))
    op.add_column("videos", sa.Column("made_for_kids", sa.Boolean(), nullable=True))
    op.add_column("videos", sa.Column("working_base_made_for_kids", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "working_base_made_for_kids")
    op.drop_column("videos", "made_for_kids")
    op.drop_column("videos", "working_base_category")
    op.drop_column("videos", "category")
