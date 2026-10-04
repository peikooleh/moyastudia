"""Add server-authoritative user Write Mode.

Revision ID: 0007_user_write_mode
Revises: 0006_youtube_quota_usage
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_user_write_mode"
down_revision = "0006_youtube_quota_usage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("write_mode_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "write_mode_enabled")
