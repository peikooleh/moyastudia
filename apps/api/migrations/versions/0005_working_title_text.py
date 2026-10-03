"""Allow long local working titles without changing the YouTube snapshot.

Revision ID: 0005_working_title_text
Revises: 0004_video_working_readiness
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_working_title_text"
down_revision = "0004_video_working_readiness"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("videos") as batch_op:
        batch_op.alter_column(
            "title",
            existing_type=sa.String(length=255),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    oversized_titles = bind.execute(
        sa.text("SELECT COUNT(*) FROM videos WHERE length(title) > 255")
    ).scalar_one()
    if oversized_titles:
        raise RuntimeError(
            "Cannot downgrade working titles to VARCHAR(255) while longer titles exist"
        )

    with op.batch_alter_table("videos") as batch_op:
        batch_op.alter_column(
            "title",
            existing_type=sa.Text(),
            type_=sa.String(length=255),
            existing_nullable=True,
        )