"""Add tag prompt to AI connections.

Revision ID: 0012_ai_tags_prompt
Revises: 0011_ai_connections
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_ai_tags_prompt"
down_revision = "0011_ai_connections"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("ai_connections", sa.Column("tags_prompt", sa.Text(), nullable=False, server_default=""))

def downgrade():
    op.drop_column("ai_connections", "tags_prompt")
