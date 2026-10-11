import logging
import threading
from datetime import datetime, timedelta, timezone

from . import db as database
from .models import Channel, GoogleConnection, RealtimeStatisticsSnapshot, Video
from .tokens import TokenEncryptionError, decrypt_refresh_token
from . import youtube as yt

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 300
_SNAPSHOT_INTERVAL = timedelta(minutes=4)
_stop_event = threading.Event()
_thread = None


def _utcnow():
    return datetime.now(timezone.utc)


def _aware(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _should_store(latest, views, now):
    """Persist regular samples; deltas are derived later from adjacent samples."""
    if latest is None:
        return True
    return now - _aware(latest.captured_at) >= _SNAPSHOT_INTERVAL


def _store_if_needed(db, channel_id, youtube_video_id, counters, now):
    views = counters.get("views")
    if views is None:
        return False
    latest = (
        db.query(RealtimeStatisticsSnapshot)
        .filter(
            RealtimeStatisticsSnapshot.channel_id == channel_id,
            RealtimeStatisticsSnapshot.youtube_video_id == youtube_video_id,
        )
        .order_by(RealtimeStatisticsSnapshot.captured_at.desc())
        .first()
    )
    if not _should_store(latest, views, now):
        return False
    db.add(RealtimeStatisticsSnapshot(
        channel_id=channel_id,
        youtube_video_id=youtube_video_id,
        view_count=int(views),
        like_count=counters.get("likes"),
        comment_count=counters.get("comments"),
        captured_at=now,
    ))
    return True


def collect_once():
    """Collect channel and video counters without requiring the Statistics page to be open."""
    if database.SessionLocal is None:
        return 0
    stored = 0
    with database.SessionLocal() as db:
        channels = (
            db.query(Channel)
            .join(GoogleConnection)
            .filter(
                GoogleConnection.is_active.is_(True),
                GoogleConnection.encrypted_refresh_token != "",
            )
            .all()
        )
        for channel in channels:
            try:
                refresh_token = decrypt_refresh_token(channel.google_connection.encrypted_refresh_token)
                current = yt.verified_analytics_channel(refresh_token, channel.youtube_channel_id)
                now = _utcnow()
                stored += int(_store_if_needed(db, channel.id, None, {
                    "views": current.get("view_count"), "likes": None, "comments": None,
                }, now))

                videos = (
                    db.query(Video)
                    .filter(
                        Video.channel_id == channel.id,
                        Video.youtube_video_id.is_not(None),
                        Video.availability_status == "available",
                    )
                    .all()
                )
                ids = [video.youtube_video_id for video in videos if video.youtube_video_id]
                counters_by_id = yt.video_current_statistics_many(refresh_token, ids)
                for video in videos:
                    counters = counters_by_id.get(video.youtube_video_id)
                    if counters:
                        stored += int(_store_if_needed(db, channel.id, video.youtube_video_id, counters, now))
                db.commit()
            except (TokenEncryptionError, LookupError):
                db.rollback()
                logger.warning("Realtime statistics skipped for channel %s", channel.id)
            except Exception:
                db.rollback()
                logger.exception("Realtime statistics collection failed for channel %s", channel.id)
    return stored


def _run():
    while not _stop_event.is_set():
        try:
            collect_once()
        except Exception:
            logger.exception("Realtime statistics background cycle failed")
        _stop_event.wait(_INTERVAL_SECONDS)


def start_background_collector():
    global _thread
    if database.SessionLocal is None or (_thread is not None and _thread.is_alive()):
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_run, name="realtime-statistics", daemon=True)
    _thread.start()


def stop_background_collector():
    global _thread
    _stop_event.set()
    if _thread is not None and _thread.is_alive():
        _thread.join(timeout=2)
    _thread = None
