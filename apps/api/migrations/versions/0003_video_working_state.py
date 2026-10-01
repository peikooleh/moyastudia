"""Add local working overrides for catalog video metadata.

Revision ID: 0003_video_working_state
Revises: 0002_video_catalog
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_video_working_state"
down_revision = "0002_video_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("videos") as batch_op:
        batch_op.alter_column(
            "title",
            existing_type=sa.String(length=255),
            nullable=True,
            server_default=None,
        )
        batch_op.alter_column(
            "description",
            existing_type=sa.Text(),
            nullable=True,
            server_default=None,
        )
        batch_op.alter_column(
            "tags",
            existing_type=sa.Text(),
            nullable=True,
            server_default=None,
        )
        batch_op.add_column(sa.Column("working_base_title", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("working_base_description", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("working_base_tags", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("working_revision", sa.Integer(), nullable=False, server_default="0")
        )

    bind = op.get_bind()
    videos = sa.Table("videos", sa.MetaData(), autoload_with=bind)
    rows = bind.execute(
        sa.select(
            videos.c.id,
            videos.c.youtube_video_id,
            videos.c.title,
            videos.c.description,
            videos.c.tags,
            videos.c.youtube_title,
            videos.c.youtube_description,
            videos.c.youtube_tags,
        )
    ).mappings()
    for row in rows:
        if row["youtube_video_id"] is None:
            continue
        values = {}
        for field in ("title", "description", "tags"):
            value = row[field]
            if value == "":
                values[field] = None
            elif value is not None:
                if field == "tags":
                    base = ", ".join(row["youtube_tags"] or [])
                else:
                    base = row[f"youtube_{field}"]
                values[f"working_base_{field}"] = base
        if values:
            bind.execute(videos.update().where(videos.c.id == row["id"]).values(**values))


def downgrade() -> None:
    op.execute(
        "UPDATE videos SET title = COALESCE(title, ''), "
        "description = COALESCE(description, ''), tags = COALESCE(tags, '')"
    )
    with op.batch_alter_table("videos") as batch_op:
        batch_op.drop_column("working_revision")
        batch_op.drop_column("working_base_tags")
        batch_op.drop_column("working_base_description")
        batch_op.drop_column("working_base_title")
        batch_op.alter_column(
            "tags",
            existing_type=sa.Text(),
            nullable=False,
            server_default="",
        )
        batch_op.alter_column(
            "description",
            existing_type=sa.Text(),
            nullable=False,
            server_default="",
        )
        batch_op.alter_column(
            "title",
            existing_type=sa.String(length=255),
            nullable=False,
            server_default="",
        )