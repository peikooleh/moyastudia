"""Add per-model AI connections.

Revision ID: 0011_ai_connections
Revises: 0010_video_working_settings
Create Date: 2026-10-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_ai_connections"
down_revision = "0010_video_working_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("title_prompt", sa.Text(), nullable=False),
        sa.Column("description_prompt", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", "model", name="uq_ai_connection_user_provider_model"),
    )
    op.create_index("ix_ai_connections_user_id", "ai_connections", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_connections_user_id", table_name="ai_connections")
    op.drop_table("ai_connections")
