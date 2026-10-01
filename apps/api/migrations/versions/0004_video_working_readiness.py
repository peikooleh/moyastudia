"""Add a local readiness marker for catalog videos.

Revision ID: 0004_video_working_readiness
Revises: 0003_video_working_state
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_video_working_readiness"
down_revision = "0003_video_working_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("working_ready", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("videos", "working_ready")