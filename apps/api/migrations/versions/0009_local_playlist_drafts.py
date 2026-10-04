"""Add persistent local playlist drafts.

Revision ID: 0009_local_playlist_drafts
Revises: 0008_video_working_language
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_local_playlist_drafts"
down_revision = "0008_video_working_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "local_playlists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("channel_id", sa.Integer(), nullable=False),
        sa.Column("local_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("video_ids", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["channels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel_id", "local_id", name="uq_local_playlist_channel_local_id"),
    )
    op.create_index("ix_local_playlists_channel_id", "local_playlists", ["channel_id"])


def downgrade() -> None:
    op.drop_index("ix_local_playlists_channel_id", table_name="local_playlists")
    op.drop_table("local_playlists")
