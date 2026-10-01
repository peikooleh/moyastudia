"""Add the YouTube video snapshot cache and resumable per-channel sync state.

Revision ID: 0002_video_catalog
Revises: 0001_foundation
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_video_catalog"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("videos") as batch_op:
        batch_op.alter_column(
            "internal_status",
            existing_type=sa.String(length=32),
            nullable=True,
            server_default=None,
        )
        batch_op.add_column(sa.Column("youtube_upload_status", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("youtube_title", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("youtube_description", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("youtube_tags", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("youtube_thumbnail_url", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("youtube_category_id", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("youtube_default_language", sa.String(length=32), nullable=True))
        batch_op.add_column(
            sa.Column("youtube_default_audio_language", sa.String(length=32), nullable=True)
        )
        batch_op.add_column(sa.Column("youtube_duration", sa.String(length=32), nullable=True))
        batch_op.add_column(
            sa.Column("youtube_published_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("youtube_scheduled_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(sa.Column("youtube_view_count", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("youtube_like_count", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("youtube_comment_count", sa.BigInteger(), nullable=True))
        batch_op.add_column(
            sa.Column("youtube_captions_available", sa.Boolean(), nullable=True)
        )
        batch_op.add_column(sa.Column("youtube_made_for_kids", sa.Boolean(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "availability_status",
                sa.String(length=16),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_seen_generation", sa.Integer(), nullable=True))

    op.create_index(
        "ix_videos_channel_published",
        "videos",
        ["channel_id", "youtube_published_at", "id"],
    )
    op.create_index(
        "ix_videos_channel_visibility", "videos", ["channel_id", "youtube_visibility"]
    )
    op.create_table(
        "channel_catalog_syncs",
        sa.Column(
            "channel_id",
            sa.Integer(),
            sa.ForeignKey("channels.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("state", sa.String(length=16), nullable=False, server_default="NOT_IMPORTED"),
        sa.Column("mode", sa.String(length=16), nullable=True),
        sa.Column("uploads_playlist_id", sa.String(length=128), nullable=True),
        sa.Column("next_page_token", sa.Text(), nullable=True),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scanned_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("lease_token", sa.String(length=36), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("channel_catalog_syncs")
    op.drop_index("ix_videos_channel_visibility", table_name="videos")
    op.drop_index("ix_videos_channel_published", table_name="videos")
    op.execute("UPDATE videos SET internal_status = 'DRAFT' WHERE internal_status IS NULL")
    with op.batch_alter_table("videos") as batch_op:
        batch_op.drop_column("last_seen_generation")
        batch_op.drop_column("last_synced_at")
        batch_op.drop_column("availability_status")
        batch_op.drop_column("youtube_made_for_kids")
        batch_op.drop_column("youtube_captions_available")
        batch_op.drop_column("youtube_comment_count")
        batch_op.drop_column("youtube_like_count")
        batch_op.drop_column("youtube_view_count")
        batch_op.drop_column("youtube_scheduled_at")
        batch_op.drop_column("youtube_published_at")
        batch_op.drop_column("youtube_duration")
        batch_op.drop_column("youtube_default_audio_language")
        batch_op.drop_column("youtube_default_language")
        batch_op.drop_column("youtube_category_id")
        batch_op.drop_column("youtube_thumbnail_url")
        batch_op.drop_column("youtube_tags")
        batch_op.drop_column("youtube_description")
        batch_op.drop_column("youtube_title")
        batch_op.drop_column("youtube_upload_status")
        batch_op.alter_column(
            "internal_status",
            existing_type=sa.String(length=32),
            nullable=False,
            server_default="DRAFT",
        )