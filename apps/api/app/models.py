from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    identities: Mapped[list["Identity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    google_connections: Mapped[list["GoogleConnection"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    write_mode_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    ai_connections: Mapped[list["AIConnection"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AIConnection(Base):
    __tablename__ = "ai_connections"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", "model", name="uq_ai_connection_user_provider_model"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(128))
    encrypted_api_key: Mapped[str] = mapped_column(Text)
    title_prompt: Mapped[str] = mapped_column(Text, default="")
    description_prompt: Mapped[str] = mapped_column(Text, default="")
    tags_prompt: Mapped[str] = mapped_column(Text, default="")\n    shorts_title_prompt: Mapped[str] = mapped_column(Text, default="")\n    shorts_description_prompt: Mapped[str] = mapped_column(Text, default="")\n    shorts_tags_prompt: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="ai_connections")


class Identity(Base):
    __tablename__ = "identities"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_identity_provider_subject"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="identities")


class GoogleConnection(Base):
    __tablename__ = "google_connections"
    __table_args__ = (UniqueConstraint("google_subject", name="uq_google_connection_subject"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    google_subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="google_connections")
    channels: Mapped[list["Channel"]] = relationship(
        back_populates="google_connection", cascade="all, delete-orphan"
    )


class Channel(Base):
    __tablename__ = "channels"
    __table_args__ = (
        UniqueConstraint("youtube_channel_id", name="uq_channels_youtube_channel_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    google_connection_id: Mapped[int] = mapped_column(
        ForeignKey("google_connections.id", ondelete="CASCADE"), index=True
    )
    youtube_channel_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    thumbnail_url: Mapped[str] = mapped_column(Text, default="")
    banner_url: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    working_language: Mapped[str] = mapped_column(String(16), default="", server_default="")
    yt_published_at: Mapped[str] = mapped_column(String(32), default="")
    subscriber_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    google_connection: Mapped[GoogleConnection] = relationship(back_populates="channels")
    videos: Mapped[list["Video"]] = relationship(
        back_populates="channel", cascade="all, delete-orphan"
    )
    local_playlists: Mapped[list["LocalPlaylist"]] = relationship(back_populates="channel", cascade="all, delete-orphan")
    catalog_sync: Mapped["ChannelCatalogSync | None"] = relationship(
        back_populates="channel", cascade="all, delete-orphan", uselist=False
    )


class Video(Base):
    __tablename__ = "videos"
    __table_args__ = (
        UniqueConstraint("channel_id", "youtube_video_id", name="uq_video_channel_youtube_id"),
        Index("ix_videos_channel_published", "channel_id", "youtube_published_at", "id"),
        Index("ix_videos_channel_visibility", "channel_id", "youtube_visibility"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    youtube_video_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    internal_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    youtube_visibility: Mapped[str | None] = mapped_column(String(32), nullable=True)
    youtube_upload_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    working_base_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    working_base_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    working_base_tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    working_base_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    working_base_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    made_for_kids: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    working_base_made_for_kids: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    working_ready: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    working_revision: Mapped[int] = mapped_column(default=0, server_default="0")
    youtube_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    youtube_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    youtube_tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    youtube_thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    youtube_category_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    youtube_default_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    youtube_default_audio_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    youtube_duration: Mapped[str | None] = mapped_column(String(32), nullable=True)\n    youtube_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    youtube_published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    youtube_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    youtube_view_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    youtube_like_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    youtube_comment_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    youtube_captions_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    youtube_made_for_kids: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    availability_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_generation: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    channel: Mapped[Channel] = relationship(back_populates="videos")


class LocalPlaylist(Base):
    __tablename__ = "local_playlists"
    __table_args__ = (UniqueConstraint("channel_id", "local_id", name="uq_local_playlist_channel_local_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    local_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(150))
    video_ids: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    channel: Mapped[Channel] = relationship(back_populates="local_playlists")


class ChannelCatalogSync(Base):
    __tablename__ = "channel_catalog_syncs"

    channel_id: Mapped[int] = mapped_column(
        ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True
    )
    state: Mapped[str] = mapped_column(String(16), default="NOT_IMPORTED")
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    uploads_playlist_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    next_page_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    generation: Mapped[int] = mapped_column(default=0, server_default="0")
    scanned_count: Mapped[int] = mapped_column(default=0, server_default="0")
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    channel: Mapped[Channel] = relationship(back_populates="catalog_sync")


class YouTubeQuotaUsage(Base):
    __tablename__ = "youtube_quota_usage"
    __table_args__ = (
        Index("ix_youtube_quota_usage_user_occurred", "user_id", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    google_connection_id: Mapped[int | None] = mapped_column(
        ForeignKey("google_connections.id", ondelete="SET NULL"), nullable=True, index=True
    )
    channel_id: Mapped[int | None] = mapped_column(
        ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    operation: Mapped[str] = mapped_column(String(64))
    bucket: Mapped[str] = mapped_column(String(32), default="general")
    units: Mapped[int] = mapped_column(default=1)
    request_count: Mapped[int] = mapped_column(default=1)
    outcome: Mapped[str] = mapped_column(String(32))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class OAuthState(Base):
    __tablename__ = "oauth_states"

    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(32), index=True)
    browser_binding_hash: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
