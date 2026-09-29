from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import db as database
from .db import get_db
from .models import Channel
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
        }
        for row in rows
    ]


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
        )
        db.add(row)
    else:
        row.title = info["title"]
        if creds.refresh_token:
            row.refresh_token = creds.refresh_token
    db.commit()
    return RedirectResponse(settings.frontend_origin + "/?connected=1")