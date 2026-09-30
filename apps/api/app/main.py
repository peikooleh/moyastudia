from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import db as database
from .db import get_db
from .models import Channel, Video
from .settings import settings
from . import youtube as yt

app = FastAPI(title="MoyaStudia API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    database.init_engine()
    if database.engine is not None:
        database.Base.metadata.create_all(bind=database.engine)
        with database.engine.begin() as conn:
            for col in ("thumbnail_url", "banner_url", "owner_name", "owner_email", "description", "yt_published_at"):
                conn.execute(text(
                    f"ALTER TABLE channels ADD COLUMN IF NOT EXISTS {col} TEXT DEFAULT ''"
                ))
            conn.execute(text(
                "ALTER TABLE channels ADD COLUMN IF NOT EXISTS subscriber_count INTEGER DEFAULT 0"
            ))


@app.get("/health")
def health():
    db_ok = False
    if database.engine is not None:
        try:
            with database.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False
    return {
        "ok": True,
        "db": db_ok,
        "google_configured": bool(settings.google_client_id),
    }


@app.get("/channels")
def list_channels(db: Session = Depends(get_db)):
    rows = db.query(Channel).order_by(Channel.id.desc()).all()
    return [
        {
            "id": row.id,
            "youtube_channel_id": row.youtube_channel_id,
            "title": row.title,
            "has_token": bool(row.refresh_token),
            "thumbnail_url": getattr(row, "thumbnail_url", "") or "",
            "banner_url": getattr(row, "banner_url", "") or "",
            "owner_name": getattr(row, "owner_name", "") or "",
            "owner_email": getattr(row, "owner_email", "") or "",
            "description": getattr(row, "description", "") or "",
            "yt_published_at": getattr(row, "yt_published_at", "") or "",
            "subscriber_count": int(getattr(row, "subscriber_count", 0) or 0),
        }
        for row in rows
    ]


@app.delete("/channels/{channel_id}")
def detach_channel(channel_id: int, db: Session = Depends(get_db)):
    row = db.query(Channel).filter(Channel.id == channel_id).one_or_none()
    if row is None:
        raise HTTPException(404, "channel not found")
    try:
        db.query(Video).filter(Video.channel_id == channel_id).delete()
    except Exception:
        db.rollback()
        row = db.query(Channel).filter(Channel.id == channel_id).one_or_none()
    if row is not None:
        db.delete(row)
        db.commit()
    return {"ok": True}


def _channel_or_404(db: Session, channel_id: int) -> Channel:
    row = db.query(Channel).filter(Channel.id == channel_id).one_or_none()
    if row is None:
        raise HTTPException(404, "channel not found")
    if not row.refresh_token:
        raise HTTPException(400, "channel has no refresh token — connect again")
    return row


@app.get("/channels/{channel_id}/videos")
def channel_videos(channel_id: int, limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    row = _channel_or_404(db, channel_id)
    try:
        return yt.list_videos(row.refresh_token, limit=limit)
    except Exception as exc:
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc


@app.get("/channels/{channel_id}/playlists")
def channel_playlists(channel_id: int, db: Session = Depends(get_db)):
    row = _channel_or_404(db, channel_id)
    try:
        return yt.list_playlists(row.refresh_token)
    except Exception as exc:
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc


@app.post("/channels/{channel_id}/refresh-profile")
def refresh_profile(channel_id: int, db: Session = Depends(get_db)):
    row = _channel_or_404(db, channel_id)
    try:
        creds = yt.creds_from_refresh(row.refresh_token)
        info = yt.fetch_channel(creds, row.youtube_channel_id)
    except Exception as exc:
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc
    row.title = info.get("title") or row.title
    if info.get("thumbnail_url"):
        row.thumbnail_url = info["thumbnail_url"]
    if info.get("banner_url"):
        row.banner_url = info["banner_url"]
    if info.get("description"):
        row.description = info["description"]
    if info.get("yt_published_at"):
        row.yt_published_at = info["yt_published_at"]
    if info.get("subscriber_count") is not None:
        row.subscriber_count = info["subscriber_count"]
    db.commit()
    return {
        "id": row.id,
        "title": info.get("title") or row.title,
        "thumbnail_url": info.get("thumbnail_url") or row.thumbnail_url or "",
        "banner_url": info.get("banner_url") or getattr(row, "banner_url", "") or "",
        "owner_name": getattr(row, "owner_name", "") or "",
        "owner_email": getattr(row, "owner_email", "") or "",
        "youtube_channel_id": row.youtube_channel_id,
        "has_token": True,
        "description": info.get("description") or "",
        "yt_published_at": info.get("yt_published_at") or "",
        "subscriber_count": int(info.get("subscriber_count") or 0),
        "video_count": int(info.get("video_count") or 0),
        "hidden_subscribers": bool(info.get("hidden_subscribers")),
    }


@app.get("/auth/youtube/login")
def youtube_login():
    if not settings.google_client_id:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not set")
    return RedirectResponse(yt.authorization_url())


@app.get("/auth/youtube/callback")
def youtube_callback(code: str = "", db: Session = Depends(get_db)):
    if not code:
        raise HTTPException(400, "missing code")
    creds = yt.exchange_code(code)
    info = yt.fetch_channel(creds)
    owner = yt.fetch_owner(creds)
    if not info["youtube_channel_id"]:
        raise HTTPException(400, "no YouTube channel on this Google account")

    row = (
        db.query(Channel)
        .filter(Channel.youtube_channel_id == info["youtube_channel_id"])
        .one_or_none()
    )
    if row is None:
        row = Channel(
            youtube_channel_id=info["youtube_channel_id"],
            title=info["title"],
            refresh_token=creds.refresh_token or "",
            thumbnail_url=info.get("thumbnail_url") or "",
            banner_url=info.get("banner_url") or "",
            description=info.get("description") or "",
            yt_published_at=info.get("yt_published_at") or "",
            subscriber_count=info.get("subscriber_count") or 0,
            owner_name=owner.get("owner_name") or "",
            owner_email=owner.get("owner_email") or "",
        )
        db.add(row)
    else:
        row.title = info["title"]
        row.thumbnail_url = info.get("thumbnail_url") or row.thumbnail_url
        row.banner_url = info.get("banner_url") or getattr(row, "banner_url", "")
        if info.get("description"):
            row.description = info["description"]
        if info.get("yt_published_at"):
            row.yt_published_at = info["yt_published_at"]
        if info.get("subscriber_count") is not None:
            row.subscriber_count = info["subscriber_count"]
        if owner.get("owner_name"):
            row.owner_name = owner["owner_name"]
        if owner.get("owner_email"):
            row.owner_email = owner["owner_email"]
        if creds.refresh_token:
            row.refresh_token = creds.refresh_token
    db.commit()
    return RedirectResponse(settings.frontend_origin + "/?connected=1")
