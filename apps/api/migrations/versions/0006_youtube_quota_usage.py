"""Add server-side YouTube quota usage ledger.

Revision ID: 0006_youtube_quota_usage
Revises: 0005_working_title_text
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_youtube_quota_usage"
down_revision = "0005_working_title_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "youtube_quota_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("google_connection_id", sa.Integer(), nullable=True),
        sa.Column("channel_id", sa.Integer(), nullable=True),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("bucket", sa.String(length=32), nullable=False, server_default="general"),
        sa.Column("units", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["google_connection_id"], ["google_connections.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["channel_id"], ["channels.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_youtube_quota_usage_user_id", "youtube_quota_usage", ["user_id"])
    op.create_index("ix_youtube_quota_usage_google_connection_id", "youtube_quota_usage", ["google_connection_id"])
    op.create_index("ix_youtube_quota_usage_channel_id", "youtube_quota_usage", ["channel_id"])
    op.create_index("ix_youtube_quota_usage_occurred_at", "youtube_quota_usage", ["occurred_at"])
    op.create_index(
        "ix_youtube_quota_usage_user_occurred",
        "youtube_quota_usage",
        ["user_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_table("youtube_quota_usage")
