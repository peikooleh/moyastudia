"""video content type and shorts prompts

Revision ID: 0014_video_content_type_prompts
Revises: 0013_ai_tags_prompt
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_video_content_type_prompts"
down_revision = "0013_ai_tags_prompt"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("videos", sa.Column("youtube_content_type", sa.String(length=32), nullable=True))
    op.add_column("ai_connections", sa.Column("shorts_title_prompt", sa.Text(), nullable=False, server_default=""))
    op.add_column("ai_connections", sa.Column("shorts_description_prompt", sa.Text(), nullable=False, server_default=""))
    op.add_column("ai_connections", sa.Column("shorts_tags_prompt", sa.Text(), nullable=False, server_default=""))

def downgrade():
    op.drop_column("ai_connections", "shorts_tags_prompt")
    op.drop_column("ai_connections", "shorts_description_prompt")
    op.drop_column("ai_connections", "shorts_title_prompt")
    op.drop_column("videos", "youtube_content_type")
