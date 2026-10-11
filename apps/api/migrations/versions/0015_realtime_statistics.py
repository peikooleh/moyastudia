"""add realtime statistics snapshots

Revision ID: 0015_realtime_statistics
Revises: 0014_video_content_type_prompts
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_realtime_statistics"
down_revision = "0014_video_content_type_prompts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "realtime_statistics_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("youtube_video_id", sa.String(length=32), nullable=True),
        sa.Column("view_count", sa.BigInteger(), nullable=False),
        sa.Column("like_count", sa.BigInteger(), nullable=True),
        sa.Column("comment_count", sa.BigInteger(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_realtime_statistics_snapshots_channel_id", "realtime_statistics_snapshots", ["channel_id"])
    op.create_index("ix_realtime_statistics_snapshots_captured_at", "realtime_statistics_snapshots", ["captured_at"])
    op.create_index("ix_realtime_stats_channel_scope_captured", "realtime_statistics_snapshots", ["channel_id", "youtube_video_id", "captured_at"])


def downgrade():
    op.drop_index("ix_realtime_stats_channel_scope_captured", table_name="realtime_statistics_snapshots")
    op.drop_index("ix_realtime_statistics_snapshots_captured_at", table_name="realtime_statistics_snapshots")
    op.drop_index("ix_realtime_statistics_snapshots_channel_id", table_name="realtime_statistics_snapshots")
    op.drop_table("realtime_statistics_snapshots")
