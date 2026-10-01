"""Create the Stage 1 identity and ownership foundation.

Revision ID: 0001_foundation
Revises:
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0001_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(inspect(op.get_bind()).get_table_names())
    if "videos" in existing:
        op.drop_table("videos")
    if "channels" in existing:
        op.drop_table("channels")

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "identities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "subject", name="uq_identity_provider_subject"),
    )
    op.create_index("ix_identities_user_id", "identities", ["user_id"])

    op.create_table(
        "google_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("google_subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("google_subject", name="uq_google_connection_subject"),
    )
    op.create_index("ix_google_connections_user_id", "google_connections", ["user_id"])

    op.create_table(
        "channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("google_connection_id", sa.Integer(), sa.ForeignKey("google_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("youtube_channel_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("thumbnail_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("banner_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("yt_published_at", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("subscriber_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("youtube_channel_id", name="uq_channels_youtube_channel_id"),
    )
    op.create_index("ix_channels_google_connection_id", "channels", ["google_connection_id"])
    op.create_index("ix_channels_youtube_channel_id", "channels", ["youtube_channel_id"])

    op.create_table(
        "videos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("youtube_video_id", sa.String(length=32), nullable=True),
        sa.Column("internal_status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("youtube_visibility", sa.String(length=32), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("tags", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("channel_id", "youtube_video_id", name="uq_video_channel_youtube_id"),
    )
    op.create_index("ix_videos_channel_id", "videos", ["channel_id"])

    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])

    op.create_table(
        "oauth_states",
        sa.Column("state_hash", sa.String(length=64), primary_key=True),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("browser_binding_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_oauth_states_purpose", "oauth_states", ["purpose"])
    op.create_index("ix_oauth_states_user_id", "oauth_states", ["user_id"])
    op.create_index("ix_oauth_states_expires_at", "oauth_states", ["expires_at"])


def downgrade() -> None:
    op.drop_table("oauth_states")
    op.drop_table("user_sessions")
    op.drop_table("videos")
    op.drop_table("channels")
    op.drop_table("google_connections")
    op.drop_table("identities")
    op.drop_table("users")