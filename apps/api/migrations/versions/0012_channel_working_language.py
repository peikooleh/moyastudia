"""Add persistent channel working language.

Revision ID: 0012_channel_working_language
Revises: 0011_ai_connections
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_channel_working_language"
down_revision = "0011_ai_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "channels",
        sa.Column("working_language", sa.String(length=16), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("channels", "working_language")
