"""Add working video language.

Revision ID: 0008_video_working_language
Revises: 0007_user_write_mode
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_video_working_language"
down_revision = "0007_user_write_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("language", sa.String(length=32), nullable=True))
    op.add_column("videos", sa.Column("working_base_language", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "working_base_language")
    op.drop_column("videos", "language")
