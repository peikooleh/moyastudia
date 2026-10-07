from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .models import YouTubeQuotaUsage

PACIFIC = ZoneInfo("America/Los_Angeles")
GENERAL_DAILY_LIMIT = 10_000
SEARCH_DAILY_LIMIT = 100
VIDEO_UPLOAD_DAILY_LIMIT = 100

# Verified against the official YouTube Data API quota calculator on 2026-10-04.
# Keep this mapping small and re-verify before adding/changing operations.
OPERATION_QUOTA = {
    "channels.list": ("general", 1),
    "playlists.list": ("general", 1),
    "playlistItems.list": ("general", 1),
    "videos.list": ("general", 1),
    "videos.update": ("general", 50),
    "videos.delete": ("general", 50),
    "channels.update": ("general", 50),
    "captions.list": ("general", 50),
    "captions.insert": ("general", 400),
    "captions.update": ("general", 450),
    "captions.delete": ("general", 50),
    "thumbnails.set": ("general", 50),
    "playlistItems.insert": ("general", 50),
    "playlistItems.update": ("general", 50),
    "playlistItems.delete": ("general", 50),
    "playlists.insert": ("general", 50),
    "playlists.update": ("general", 50),
    "playlists.delete": ("general", 50),
    "playlistImages.list": ("general", 1),
    "playlistImages.insert": ("general", 50),
    "playlistImages.update": ("general", 50),
    "playlistImages.delete": ("general", 50),
    "search.list": ("search", 1),
    "videos.insert": ("video_upload", 1),
}
BUCKET_LIMITS = {
    "general": GENERAL_DAILY_LIMIT,
    "search": SEARCH_DAILY_LIMIT,
    "video_upload": VIDEO_UPLOAD_DAILY_LIMIT,
}


def quota_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    pacific_now = current.astimezone(PACIFIC)
    start_local = pacific_now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def operation_cost(operation: str) -> tuple[str, int]:
    return OPERATION_QUOTA.get(operation, ("general", 1))


def record_usage(
    db: Session,
    *,
    user_id: str,
    operation: str,
    outcome: str,
    google_connection_id: int | None = None,
    channel_id: int | None = None,
) -> None:
    bucket, units = operation_cost(operation)
    db.add(
        YouTubeQuotaUsage(
            user_id=user_id,
            google_connection_id=google_connection_id,
            channel_id=channel_id,
            operation=operation,
            bucket=bucket,
            units=units,
            request_count=1,
            outcome=outcome,
        )
    )
    # Quota attempts must survive a later domain-operation failure.
    db.commit()


def record_usage_isolated(
    bind: Engine,
    *,
    user_id: str,
    operation: str,
    outcome: str,
    google_connection_id: int | None = None,
    channel_id: int | None = None,
) -> None:
    """Persist quota telemetry in its own transaction.

    YouTube requests may happen while the caller has pending domain changes.
    Keeping quota accounting in a separate Session prevents telemetry commits
    from accidentally committing or rolling back the caller's transaction.
    """
    with Session(bind=bind) as quota_db:
        record_usage(
            quota_db,
            user_id=user_id,
            operation=operation,
            outcome=outcome,
            google_connection_id=google_connection_id,
            channel_id=channel_id,
        )


def quota_summary(db: Session, *, user_id: str, now: datetime | None = None) -> dict:
    start, end = quota_window(now)
    rows = (
        db.query(
            YouTubeQuotaUsage.bucket,
            func.coalesce(func.sum(YouTubeQuotaUsage.units), 0),
            func.coalesce(func.sum(YouTubeQuotaUsage.request_count), 0),
            func.max(YouTubeQuotaUsage.occurred_at),
        )
        .filter(
            YouTubeQuotaUsage.user_id == user_id,
            YouTubeQuotaUsage.occurred_at >= start,
            YouTubeQuotaUsage.occurred_at < end,
        )
        .group_by(YouTubeQuotaUsage.bucket)
        .all()
    )
    values = {bucket: (int(units), int(requests), last) for bucket, units, requests, last in rows}
    buckets = {}
    for bucket, limit in BUCKET_LIMITS.items():
        units, requests, last = values.get(bucket, (0, 0, None))
        buckets[bucket] = {
            "used": units,
            "limit": limit,
            "estimated_remaining": max(0, limit - units),
            "requests": requests,
            "last_recorded_at": last.isoformat() if last else None,
        }
    return {
        "source": "moyastudia_tracked",
        "authoritative_google_balance": False,
        "window_start": start.isoformat(),
        "reset_at": end.isoformat(),
        "buckets": buckets,
    }
