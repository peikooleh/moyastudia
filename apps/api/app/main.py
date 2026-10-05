import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, case, func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import db as database
from .db import get_db
from .models import (
    Channel,
    ChannelCatalogSync,
    GoogleConnection,
    Identity,
    LocalPlaylist,
    User,
    UserSession,
    Video,
)
from .security import (
    clear_session_cookie,
    consume_oauth_state,
    consume_youtube_oauth_state,
    create_oauth_state,
    create_session,
    get_current_user,
    get_optional_user,
    hash_secret,
    oauth_state_cookie_name,
    require_same_origin,
    clear_oauth_state_cookie,
    set_session_cookie,
    set_oauth_state_cookie,
)
from .settings import settings
from .tokens import (
    TokenEncryptionError,
    decrypt_refresh_token,
    encrypt_refresh_token,
    validate_encryption_key,
)
from . import quota as quota_service
from . import youtube as yt

app = FastAPI(title="MoyaStudia API")


class ChannelSelection(BaseModel):
    youtube_channel_ids: list[str]


class WriteModeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    confirmation: Literal["enable_youtube_writes"] | None = None


class LocalPlaylistCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    local_id: str = Field(min_length=1, max_length=64, pattern=r"^local-[A-Za-z0-9_-]+$")
    title: str = Field(min_length=1, max_length=150)


class LocalPlaylistMembershipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    video_ids: list[str] = Field(default_factory=list, max_length=500)


class VideoPublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0)


class CatalogSyncRequest(BaseModel):
    mode: Literal["initial", "incremental", "reconcile"]


class VideoWorkingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0)
    title: str | None = None
    description: str | None = None
    tags: str | None = None
    language: str | None = Field(default=None, max_length=32, pattern=r"^$|^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    category: str | None = Field(default=None, max_length=32)
    madeForKids: bool | None = None
    ready: bool = False
    conflict_resolution: Literal["keep_local", "use_snapshot"] | None = None


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    database.init_engine()


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


def _require_google_configuration() -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(503, "Google OAuth is not configured")


def _oauth_status_redirect(path: str, parameter: str, status: str, state: str = ""):
    query = urlencode({parameter: status})
    response = RedirectResponse(
        f"{settings.frontend_origin}{path}?{query}", status_code=303
    )
    if state:
        clear_oauth_state_cookie(response, state)
    return response


@app.get("/write-mode")
def get_write_mode(user: User = Depends(get_current_user)):
    return {"enabled": bool(user.write_mode_enabled), "youtube_writes_available": True}


@app.put("/write-mode", dependencies=[Depends(require_same_origin)])
def set_write_mode(
    update: WriteModeUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if update.enabled and update.confirmation != "enable_youtube_writes":
        raise HTTPException(422, "Explicit Write Mode confirmation is required")
    user.write_mode_enabled = update.enabled
    db.commit()
    return {"enabled": bool(user.write_mode_enabled), "youtube_writes_available": True}


@app.get("/quota/today")
def quota_today(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return quota_service.quota_summary(db)


@app.get("/auth/session")
def auth_session(request: Request, db: Session = Depends(get_db)):
    user = get_optional_user(request, db)
    if user is None:
        return {"authenticated": False}
    identity = (
        db.query(Identity)
        .filter(Identity.user_id == user.id, Identity.provider == "google")
        .order_by(Identity.created_at)
        .first()
    )
    youtube_connected = (
        db.query(GoogleConnection.id)
        .filter(
            GoogleConnection.user_id == user.id,
            GoogleConnection.is_active.is_(True),
            GoogleConnection.encrypted_refresh_token != "",
        )
        .first()
        is not None
    )
    return {
        "authenticated": True,
        "user": {
            "id": user.id,
            "email": identity.email if identity else None,
            "youtube_connected": youtube_connected,
        },
    }


@app.get("/auth/google/login")
def google_login(db: Session = Depends(get_db)):
    try:
        _require_google_configuration()
    except HTTPException:
        return _oauth_status_redirect("/", "auth_error", "provider_unavailable")
    url, state = yt.identity_authorization_url()
    _, browser_binding = create_oauth_state(db, "google_identity", value=state)
    response = RedirectResponse(url)
    set_oauth_state_cookie(response, state, browser_binding)
    return response


@app.get("/auth/google/callback")
def google_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    browser_binding = request.cookies.get(oauth_state_cookie_name(state), "") if state else ""
    if not state or not browser_binding or not consume_oauth_state(
        db, state, "google_identity", browser_binding
    ):
        return _oauth_status_redirect("/", "auth_error", "invalid_state", state)
    if error:
        status = "cancelled" if error == "access_denied" else "provider_failed"
        return _oauth_status_redirect("/", "auth_error", status, state)
    if not code:
        return _oauth_status_redirect("/", "auth_error", "invalid_state", state)
    try:
        credentials = yt.exchange_identity_code(code, state)
        claims = yt.verify_identity_token(credentials.id_token or "")
    except Exception:
        return _oauth_status_redirect("/", "auth_error", "identity_failed", state)

    subject = claims.get("sub")
    if not subject:
        return _oauth_status_redirect("/", "auth_error", "identity_failed", state)
    identity = (
        db.query(Identity)
        .filter(Identity.provider == "google", Identity.subject == subject)
        .one_or_none()
    )
    if identity is None:
        user = User()
        db.add(user)
        db.flush()
        identity = Identity(
            user_id=user.id,
            provider="google",
            subject=subject,
            email=claims.get("email"),
            email_verified=bool(claims.get("email_verified")),
        )
        db.add(identity)
    else:
        user = identity.user
        identity.email = claims.get("email")
        identity.email_verified = bool(claims.get("email_verified"))
    db.commit()

    session_value = create_session(db, user.id)
    response = RedirectResponse(settings.frontend_origin + "/", status_code=303)
    set_session_cookie(response, session_value)
    clear_oauth_state_cookie(response, state)
    return response


@app.post("/auth/logout", dependencies=[Depends(require_same_origin)])
def logout(
    request: Request,
    db: Session = Depends(get_db),
):
    value = request.cookies.get(settings.session_cookie_name, "")
    session = (
        db.query(UserSession)
        .filter(UserSession.token_hash == hash_secret(value))
        .one_or_none()
        if value
        else None
    )
    if session is not None:
        db.delete(session)
        db.commit()
    response = JSONResponse({"ok": True})
    clear_session_cookie(response)
    return response


@app.get("/auth/youtube/login")
def youtube_login(
    request: Request,
    consent_required: bool = Query(False),
    reconnect_connection_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    user = get_optional_user(request, db)
    if user is None:
        return _oauth_status_redirect("/", "auth_error", "session_expired")
    try:
        _require_google_configuration()
    except HTTPException:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "provider_unavailable"
        )
    try:
        validate_encryption_key()
    except TokenEncryptionError:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "token_configuration"
        )
    reconnect_connection = None
    state_purpose = "youtube_connection"
    if reconnect_connection_id is not None:
        reconnect_connection = (
            db.query(GoogleConnection)
            .filter(
                GoogleConnection.id == reconnect_connection_id,
                GoogleConnection.user_id == user.id,
            )
            .one_or_none()
        )
        if reconnect_connection is None:
            return _oauth_status_redirect(
                "/cabinet", "connection_error", "connection_unavailable"
            )
        state_purpose = f"youtube_connection_reauthorize:{reconnect_connection.id}"
    has_usable_connection = (
        db.query(GoogleConnection.id)
        .filter(
            GoogleConnection.user_id == user.id,
            GoogleConnection.is_active.is_(True),
            GoogleConnection.encrypted_refresh_token != "",
        )
        .first()
        is not None
    )
    force_consent = bool(
        consent_required or reconnect_connection is not None or not has_usable_connection
    )
    url, state = yt.youtube_authorization_url(force_consent=force_consent)
    _, browser_binding = create_oauth_state(db, state_purpose, user.id, state)
    response = RedirectResponse(url)
    set_oauth_state_cookie(response, state, browser_binding)
    return response


@app.get("/auth/youtube/callback")
def youtube_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    user = get_optional_user(request, db)
    if user is None:
        return _oauth_status_redirect("/", "auth_error", "session_expired", state)
    browser_binding = request.cookies.get(oauth_state_cookie_name(state), "") if state else ""
    oauth_purpose = (
        consume_youtube_oauth_state(db, state, browser_binding, user.id)
        if state and browser_binding
        else None
    )
    if oauth_purpose is None:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "invalid_state", state
        )
    reconnect_connection = None
    if oauth_purpose.startswith("youtube_connection_reauthorize:"):
        connection_id_text = oauth_purpose.partition(":")[2]
        if not connection_id_text.isdigit():
            return _oauth_status_redirect(
                "/cabinet", "connection_error", "invalid_state", state
            )
        reconnect_connection = (
            db.query(GoogleConnection)
            .filter(
                GoogleConnection.id == int(connection_id_text),
                GoogleConnection.user_id == user.id,
            )
            .one_or_none()
        )
        if reconnect_connection is None:
            return _oauth_status_redirect(
                "/cabinet", "connection_error", "connection_unavailable", state
            )
    if error:
        status = "cancelled" if error == "access_denied" else "provider_failed"
        return _oauth_status_redirect(
            "/cabinet", "connection_error", status, state
        )
    if not code:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "invalid_state", state
        )
    try:
        credentials = yt.exchange_youtube_code(code, state)
        claims = yt.verify_identity_token(credentials.id_token or "")
    except Exception:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "connection_failed", state
        )

    google_subject = claims.get("sub")
    if not google_subject:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "connection_failed", state
        )
    if reconnect_connection and google_subject != reconnect_connection.google_subject:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "reauthorize_account_mismatch", state
        )
    connection = (
        db.query(GoogleConnection)
        .filter(GoogleConnection.google_subject == google_subject)
        .one_or_none()
    )
    if connection is not None and connection.user_id != user.id:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "connection_conflict", state
        )
    if connection is None:
        if not credentials.refresh_token:
            return _oauth_status_redirect(
                "/cabinet", "connection_error", "consent_required", state
            )
        connection = GoogleConnection(
            user_id=user.id,
            google_subject=google_subject,
            email=claims.get("email"),
            encrypted_refresh_token="",
        )
        db.add(connection)
        db.flush()
    if credentials.refresh_token:
        try:
            connection.encrypted_refresh_token = encrypt_refresh_token(credentials.refresh_token)
        except TokenEncryptionError:
            return _oauth_status_redirect(
                "/cabinet", "connection_error", "token_configuration", state
            )
    elif not connection.encrypted_refresh_token:
        return _oauth_status_redirect(
            "/cabinet", "connection_error", "consent_required", state
        )
    connection.email = claims.get("email") or connection.email
    connection.is_active = True

    db.commit()
    response = RedirectResponse(
        settings.frontend_origin
        + f"/cabinet?{urlencode({'select_connection': connection.id, 'connection_status': 'connected'})}",
        status_code=303,
    )
    clear_oauth_state_cookie(response, state)
    return response


@app.get("/channels")
def list_channels(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Channel)
        .join(GoogleConnection)
        .filter(GoogleConnection.user_id == user.id)
        .order_by(Channel.id.desc())
        .all()
    )
    catalog_video_counts = (
        dict(
            db.query(Video.channel_id, func.count(Video.id))
            .filter(
                Video.channel_id.in_([row.id for row in rows]),
                Video.youtube_video_id.is_not(None),
            )
            .group_by(Video.channel_id)
            .all()
        )
        if rows
        else {}
    )
    return [
        {
            "id": row.id,
            "youtube_channel_id": row.youtube_channel_id,
            "title": row.title,
            "has_token": bool(row.google_connection.encrypted_refresh_token),
            "thumbnail_url": getattr(row, "thumbnail_url", "") or "",
            "banner_url": getattr(row, "banner_url", "") or "",
            "owner_email": row.google_connection.email or "",
            "description": getattr(row, "description", "") or "",
            "yt_published_at": getattr(row, "yt_published_at", "") or "",
            "subscriber_count": int(getattr(row, "subscriber_count", 0) or 0),
            "catalog_video_count": catalog_video_counts.get(row.id, 0),
            "hidden_subscribers": None,
        }
        for row in rows
    ]


@app.get("/google-connections")
def list_google_connections(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    connections = (
        db.query(GoogleConnection)
        .options(selectinload(GoogleConnection.channels))
        .filter(GoogleConnection.user_id == user.id)
        .order_by(GoogleConnection.id.desc())
        .all()
    )
    return [
        {
            "id": connection.id,
            "email": connection.email or "",
            "status": (
                "connected"
                if connection.is_active and connection.encrypted_refresh_token
                else "reauthorization_required"
            ),
            "channel_count": len(connection.channels),
            "channels": [
                {
                    "id": channel.id,
                    "youtube_channel_id": channel.youtube_channel_id,
                    "title": channel.title,
                    "thumbnail_url": channel.thumbnail_url or "",
                }
                for channel in connection.channels
            ],
        }
        for connection in connections
    ]


def _google_connection_or_404(
    db: Session, user: User, connection_id: int
) -> GoogleConnection:
    connection = (
        db.query(GoogleConnection)
        .filter(
            GoogleConnection.id == connection_id,
            GoogleConnection.user_id == user.id,
        )
        .one_or_none()
    )
    if connection is None:
        raise HTTPException(404, "Google connection not found")
    if not connection.is_active or not connection.encrypted_refresh_token:
        raise HTTPException(400, "Google connection is inactive")
    return connection


def _quota_recorder(
    db: Session,
    user: User,
    connection: GoogleConnection | None = None,
    channel: Channel | None = None,
):
    bind = db.get_bind()
    user_id = user.id
    connection_id = connection.id if connection else None
    channel_id = channel.id if channel else None

    def record(operation: str, outcome: str) -> None:
        quota_service.record_usage_isolated(
            bind,
            user_id=user_id,
            google_connection_id=connection_id,
            channel_id=channel_id,
            operation=operation,
            outcome=outcome,
        )
    return record


def _available_youtube_channels(
    connection: GoogleConnection, db: Session, user: User
) -> list[dict]:
    try:
        token = decrypt_refresh_token(connection.encrypted_refresh_token)
        credentials = yt.creds_from_refresh(token)
        with yt.quota_recording(_quota_recorder(db, user, connection)):
            return yt.list_available_channels(credentials)
    except TokenEncryptionError as exc:
        raise HTTPException(503, "Google token encryption configuration is invalid") from exc
    except Exception as exc:
        raise HTTPException(502, "YouTube channel discovery failed") from exc


@app.get("/google-connections/{connection_id}/available-channels")
def available_channels(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = _google_connection_or_404(db, user, connection_id)
    return [
        {
            "youtube_channel_id": item["youtube_channel_id"],
            "title": item["title"],
            "thumbnail_url": item["thumbnail_url"],
        }
        for item in _available_youtube_channels(connection, db, user)
    ]


@app.post(
    "/google-connections/{connection_id}/channels",
    dependencies=[Depends(require_same_origin)],
)
def save_channel_selection(
    connection_id: int,
    selection: ChannelSelection = Body(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = _google_connection_or_404(db, user, connection_id)
    if not selection.youtube_channel_ids or any(
        not channel_id.strip() for channel_id in selection.youtube_channel_ids
    ):
        raise HTTPException(422, "Select at least one available YouTube channel")

    selected_ids = list(dict.fromkeys(selection.youtube_channel_ids))
    available = _available_youtube_channels(connection, db, user)
    available_by_id = {item["youtube_channel_id"]: item for item in available}
    if any(channel_id not in available_by_id for channel_id in selected_ids):
        raise HTTPException(422, "One or more selected channels are not available")

    existing = (
        db.query(Channel)
        .filter(Channel.youtube_channel_id.in_(selected_ids))
        .all()
    )
    existing_by_youtube_id = {channel.youtube_channel_id: channel for channel in existing}
    if any(channel.google_connection_id != connection.id for channel in existing):
        raise HTTPException(
            409,
            "One or more selected channels are already connected through another Google account",
        )

    selected_channels = []
    for youtube_channel_id in selected_ids:
        info = available_by_id[youtube_channel_id]
        channel = existing_by_youtube_id.get(youtube_channel_id)
        if channel is None:
            channel = Channel(
                google_connection_id=connection.id,
                youtube_channel_id=youtube_channel_id,
            )
            db.add(channel)
        channel.title = info["title"]
        channel.thumbnail_url = info["thumbnail_url"]
        channel.banner_url = info["banner_url"]
        channel.description = info["description"]
        channel.yt_published_at = info["yt_published_at"]
        channel.subscriber_count = info["subscriber_count"]
        selected_channels.append(channel)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        persisted = (
            db.query(Channel)
            .filter(Channel.youtube_channel_id.in_(selected_ids))
            .all()
        )
        if len(persisted) == len(selected_ids) and all(
            channel.google_connection_id == connection.id for channel in persisted
        ):
            selected_channels = persisted
        elif any(channel.youtube_channel_id in selected_ids for channel in persisted):
            raise HTTPException(
                409,
                "One or more selected channels are already connected through another Google account",
            ) from exc
        else:
            raise

    return {
        "channels": [
            {
                "id": channel.id,
                "youtube_channel_id": channel.youtube_channel_id,
                "title": channel.title,
                "thumbnail_url": channel.thumbnail_url or "",
            }
            for channel in selected_channels
        ]
    }


@app.delete("/channels/{channel_id}", dependencies=[Depends(require_same_origin)])
def detach_channel(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    db.delete(channel)
    db.commit()
    return {"ok": True}


def _channel_or_404(
    db: Session, user: User, channel_id: int, require_token: bool = True
) -> Channel:
    row = (
        db.query(Channel)
        .join(GoogleConnection)
        .filter(Channel.id == channel_id, GoogleConnection.user_id == user.id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(404, "channel not found")
    if require_token and (
        not row.google_connection.is_active
        or not row.google_connection.encrypted_refresh_token
    ):
        raise HTTPException(400, "Google connection is inactive")
    return row


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_youtube_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _catalog_row(db: Session, channel: Channel) -> ChannelCatalogSync | None:
    return db.query(ChannelCatalogSync).filter_by(channel_id=channel.id).one_or_none()


def _catalog_status(db: Session, channel: Channel) -> dict:
    sync = _catalog_row(db, channel)
    video_count = (
        db.query(func.count(Video.id))
        .filter(Video.channel_id == channel.id, Video.youtube_video_id.is_not(None))
        .scalar()
        or 0
    )
    if sync is None:
        state = "NOT_IMPORTED"
        return {
            "state": state,
            "mode": None,
            "video_count": video_count,
            "scanned_count": 0,
            "last_success_at": None,
            "last_error_code": None,
            "can_continue": False,
        }

    state = sync.state
    if state in ("COMPLETE", "EMPTY") and sync.last_success_at is not None:
        last_success = sync.last_success_at
        if last_success.tzinfo is None:
            last_success = last_success.replace(tzinfo=timezone.utc)
        if _utcnow() - last_success > timedelta(minutes=15):
            state = "STALE"
    if state == "EMPTY" and video_count > 0:
        state = "COMPLETE"
    if state == "ERROR" and video_count > 0:
        state = "STALE"

    return {
        "state": state,
        "mode": sync.mode,
        "video_count": video_count,
        "scanned_count": sync.scanned_count,
        "last_success_at": sync.last_success_at.isoformat() if sync.last_success_at else None,
        "last_error_code": sync.last_error_code,
        "can_continue": state in ("LOADING", "PARTIAL", "STALE", "ERROR"),
    }


def _encode_video_cursor(
    channel_id: int,
    sort: str,
    query_text: str,
    visibility: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    video: Video,
) -> str:
    if sort == "date":
        displayed_date = video.youtube_scheduled_at or video.youtube_published_at
        value = displayed_date.isoformat() if displayed_date else None
    elif sort == "title":
        effective_title = video.title if video.title is not None else video.youtube_title
        value = (effective_title or "").lower()
    else:
        value = "scheduled" if video.youtube_scheduled_at else (video.youtube_visibility or "unknown")
    payload = {
        "channel_id": channel_id,
        "sort": sort,
        "query": query_text,
        "visibility": visibility,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "value": value,
        "id": video.id,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_video_cursor(
    cursor: str,
    channel_id: int,
    sort: str,
    query_text: str,
    visibility: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        if (
            payload.get("channel_id") != channel_id
            or payload.get("sort") != sort
            or payload.get("query") != query_text
            or payload.get("visibility") != visibility
            or payload.get("date_from") != (date_from.isoformat() if date_from else None)
            or payload.get("date_to") != (date_to.isoformat() if date_to else None)
            or not isinstance(payload.get("id"), int)
        ):
            raise ValueError
        return payload
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(400, "invalid catalog cursor") from exc


def _youtube_error_code(error: Exception) -> str:
    if isinstance(error, TokenEncryptionError):
        return "token_configuration_error"
    if isinstance(error, LookupError):
        return "selected_channel_unavailable"
    response = getattr(error, "resp", None)
    status = getattr(response, "status", None)
    reasons = {
        detail.get("reason")
        for detail in (getattr(error, "error_details", None) or [])
        if isinstance(detail, dict)
    }
    if status == 401:
        return "authorization_required"
    if status == 403 and reasons.intersection({"quotaExceeded", "rateLimitExceeded"}):
        return "quota_exceeded"
    if status and status >= 500:
        return "youtube_unavailable"
    return "youtube_api_error"


def _ensure_catalog_sync(db: Session, channel: Channel) -> ChannelCatalogSync:
    sync = _catalog_row(db, channel)
    if sync is not None:
        return sync
    sync = ChannelCatalogSync(channel_id=channel.id)
    db.add(sync)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        sync = _catalog_row(db, channel)
        if sync is None:
            raise
    return sync


def _catalog_sync_locked(sync: ChannelCatalogSync) -> bool:
    if sync.lease_expires_at is None:
        return False
    expires_at = sync.lease_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > _utcnow()


def _claim_catalog_page(db: Session, channel_id: int) -> str:
    now = _utcnow()
    lease_token = str(uuid4())
    claimed = (
        db.query(ChannelCatalogSync)
        .filter(
            ChannelCatalogSync.channel_id == channel_id,
            or_(
                ChannelCatalogSync.lease_expires_at.is_(None),
                ChannelCatalogSync.lease_expires_at <= now,
            ),
        )
        .update(
            {
                ChannelCatalogSync.lease_token: lease_token,
                ChannelCatalogSync.lease_expires_at: now + timedelta(minutes=5),
            },
            synchronize_session=False,
        )
    )
    if not claimed:
        db.rollback()
        raise HTTPException(409, "catalog sync page is already running")
    db.commit()
    return lease_token


def _video_catalog_item(video: Video) -> dict:
    scheduled_at = video.youtube_scheduled_at
    published_at = video.youtube_published_at
    snapshot = _working_video_snapshot(video)
    working = {field: getattr(video, field) for field in ("title", "description", "tags", "language", "category", "madeForKids")}
    dirty_fields = _working_dirty_fields(snapshot, working)
    return {
        "id": video.id,
        "youtubeId": video.youtube_video_id,
        "title": video.youtube_title or "",
        "effectiveTitle": video.title if video.title is not None else video.youtube_title or "",
        "description": video.youtube_description or "",
        "tags": ", ".join(video.youtube_tags or []),
        "category": video.youtube_category_id or "",
        "playlist": "",
        "language": video.youtube_default_language
        or video.youtube_default_audio_language
        or "",
        "privacy": video.youtube_visibility or "",
        "slot": scheduled_at.isoformat(timespec="minutes") if scheduled_at else "",
        "status": (
            "remote_missing"
            if video.availability_status == "remote_missing"
            else
            "unavailable"
            if video.availability_status == "unavailable"
            else "scheduled"
            if scheduled_at
            else video.youtube_visibility or "unknown"
        ),
        "availability": video.availability_status,
        "remoteMissing": video.availability_status == "remote_missing",
        "dirty": any(dirty_fields.values()),
        "dirtyFields": dirty_fields,
        "thumb": video.youtube_thumbnail_url or "",
        "publishedAt": published_at.isoformat(timespec="minutes") if published_at else "",
        "duration": video.youtube_duration or "",
        "views": video.youtube_view_count,
        "likes": video.youtube_like_count,
        "comments": video.youtube_comment_count,
        "captions": video.youtube_captions_available,
        "madeForKids": video.youtube_made_for_kids,
    }


def _working_video_snapshot(video: Video) -> dict[str, str | None]:
    return {
        "title": video.youtube_title,
        "description": video.youtube_description,
        "tags": None if video.youtube_tags is None else ", ".join(video.youtube_tags),
        "language": video.youtube_default_language or video.youtube_default_audio_language or "",
        "category": video.youtube_category_id or "",
        "madeForKids": video.youtube_made_for_kids,
    }


def _working_dirty_fields(
    snapshot: dict[str, str | None], working: dict[str, str | None]
) -> dict[str, bool]:
    return {
        field: working[field] is not None and working[field] != snapshot[field]
        for field in ("title", "description", "tags", "language", "category", "madeForKids")
    }


def _video_working_item(video: Video) -> dict:
    snapshot = _working_video_snapshot(video)
    working = {
        "title": video.title,
        "description": video.description,
        "tags": video.tags,
        "language": video.language,
        "category": video.category,
        "madeForKids": video.made_for_kids,
        "ready": video.working_ready,
    }
    base = {
        "title": video.working_base_title,
        "description": video.working_base_description,
        "tags": video.working_base_tags,
        "language": video.working_base_language,
        "category": video.working_base_category,
        "madeForKids": video.working_base_made_for_kids,
    }
    effective = {
        field: working[field] if working[field] is not None else snapshot[field]
        for field in ("title", "description", "tags", "language", "category", "madeForKids")
    }
    dirty_fields = _working_dirty_fields(snapshot, working)
    conflict_fields = {
        field: (
            working[field] is not None
            and base[field] != snapshot[field]
            and working[field] != snapshot[field]
        )
        for field in ("title", "description", "tags", "language", "category", "madeForKids")
    }
    return {
        "id": video.id,
        "youtubeId": video.youtube_video_id,
        "snapshot": snapshot,
        "working": working,
        "effective": effective,
        "base": base,
        "dirtyFields": dirty_fields,
        "conflictFields": conflict_fields,
        "dirty": any(dirty_fields.values()),
        "conflict": any(conflict_fields.values()),
        "revision": video.working_revision,
        "availabilityStatus": video.availability_status,
        "remoteMissing": video.availability_status == "remote_missing",
    }


def _catalog_video_or_404(
    db: Session,
    user: User,
    channel_id: int,
    video_id: int,
    *,
    for_update: bool = False,
) -> Video:
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    query = db.query(Video).filter(
        Video.id == video_id,
        Video.channel_id == channel.id,
        Video.youtube_video_id.is_not(None),
    )
    if for_update:
        query = query.with_for_update()
    video = query.one_or_none()
    if video is None:
        raise HTTPException(404, "video not found")
    return video


@app.get("/channels/{channel_id}/videos")
def channel_videos(
    channel_id: int,
    limit: int = Query(50, ge=1, le=50),
    cursor: str | None = None,
    q: str = Query("", max_length=200),
    visibility: Literal[
        "public", "private", "unlisted", "scheduled", "unavailable", "remote_missing"
    ] | None = None,
    sort: Literal["date", "title", "status"] = "date",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    query = db.query(Video).filter(
        Video.channel_id == channel.id,
        Video.youtube_video_id.is_not(None),
    )
    if q:
        effective_title = func.coalesce(Video.title, Video.youtube_title)
        effective_description = func.coalesce(Video.description, Video.youtube_description)
        query = query.filter(
            or_(
                effective_title.ilike(f"%{q}%"),
                effective_description.ilike(f"%{q}%"),
            )
        )
    displayed_date = func.coalesce(Video.youtube_scheduled_at, Video.youtube_published_at)
    if date_from is not None:
        query = query.filter(displayed_date >= date_from)
    if date_to is not None:
        query = query.filter(displayed_date < date_to)
    if visibility == "scheduled":
        query = query.filter(
            Video.availability_status == "available",
            Video.youtube_scheduled_at.is_not(None),
        )
    elif visibility == "unavailable":
        query = query.filter(Video.availability_status == "unavailable")
    elif visibility == "remote_missing":
        query = query.filter(Video.availability_status == "remote_missing")
    elif visibility is not None:
        query = query.filter(
            Video.availability_status == "available",
            Video.youtube_visibility == visibility,
        )

    total = query.count()
    status_expression = case(
        (Video.availability_status == "unavailable", "unavailable"),
        (Video.availability_status == "remote_missing", "remote_missing"),
        (Video.youtube_scheduled_at.is_not(None), "scheduled"),
        else_=func.coalesce(Video.youtube_visibility, Video.availability_status, "unknown"),
    )
    counts = (
        db.query(status_expression, func.count(Video.id))
        .filter(Video.channel_id == channel.id, Video.youtube_video_id.is_not(None))
        .group_by(status_expression)
        .all()
    )
    upcoming = (
        db.query(Video)
        .filter(
            Video.channel_id == channel.id,
            Video.youtube_video_id.is_not(None),
            Video.availability_status == "available",
            Video.youtube_scheduled_at > _utcnow(),
        )
        .order_by(Video.youtube_scheduled_at.asc(), Video.id.asc())
        .first()
    )
    latest = (
        db.query(Video)
        .filter(
            Video.channel_id == channel.id,
            Video.youtube_video_id.is_not(None),
            Video.availability_status == "available",
            Video.youtube_scheduled_at.is_(None),
            Video.youtube_published_at.is_not(None),
        )
        .order_by(Video.youtube_published_at.desc(), Video.id.desc())
        .first()
    )
    if sort == "title":
        sort_expression = func.lower(func.coalesce(Video.title, Video.youtube_title, ""))
        query = query.order_by(sort_expression.asc(), Video.id.asc())
    elif sort == "status":
        sort_expression = func.lower(status_expression)
        query = query.order_by(sort_expression.asc(), Video.id.asc())
    else:
        sort_expression = displayed_date
        query = query.order_by(displayed_date.is_(None).asc())
        query = query.order_by(displayed_date.desc(), Video.id.desc())

    if cursor:
        payload = _decode_video_cursor(
            cursor, channel.id, sort, q, visibility, date_from, date_to
        )
        last_id = payload["id"]
        value = payload.get("value")
        if sort == "date":
            if value is None:
                query = query.filter(
                    displayed_date.is_(None), Video.id < last_id
                )
            else:
                last_date = _parse_youtube_datetime(value)
                if last_date is None:
                    raise HTTPException(400, "invalid catalog cursor")
                query = query.filter(
                    or_(
                        displayed_date < last_date,
                        and_(displayed_date == last_date, Video.id < last_id),
                        displayed_date.is_(None),
                    )
                )
        else:
            query = query.filter(
                or_(
                    sort_expression > value,
                    and_(sort_expression == value, Video.id > last_id),
                )
            )

    rows = query.limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        _encode_video_cursor(
            channel.id, sort, q, visibility, date_from, date_to, rows[-1]
        )
        if has_more and rows
        else None
    )
    return {
        "items": [_video_catalog_item(video) for video in rows],
        "next_cursor": next_cursor,
        "total": total,
        "status_counts": {str(key): count for key, count in counts},
        "summary": {
            "upcoming": _video_catalog_item(upcoming) if upcoming else None,
            "latest": _video_catalog_item(latest) if latest else None,
        },
    }


@app.get("/channels/{channel_id}/videos/{video_id}")
def channel_video_detail(
    channel_id: int,
    video_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _catalog_video_or_404(db, user, channel_id, video_id)
    return _video_working_item(video)


@app.patch(
    "/channels/{channel_id}/videos/{video_id}/working",
    dependencies=[Depends(require_same_origin)],
)
def patch_channel_video_working(
    channel_id: int,
    video_id: int,
    patch: VideoWorkingPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _catalog_video_or_404(db, user, channel_id, video_id)
    if video.working_revision != patch.revision:
        raise HTTPException(
            409,
            detail={"code": "stale_revision", "current": _video_working_item(video)},
        )

    snapshot = _working_video_snapshot(video)
    values = {}
    changed_fields = patch.model_fields_set - {"revision", "conflict_resolution"}
    if patch.conflict_resolution:
        if changed_fields:
            raise HTTPException(422, "conflict resolution cannot include working fields")
        current = _video_working_item(video)
        conflicted_fields = [
            field for field, has_conflict in current["conflictFields"].items() if has_conflict
        ]
        if not conflicted_fields:
            raise HTTPException(409, "video has no conflicts to resolve")
        for field in conflicted_fields:
            if patch.conflict_resolution == "use_snapshot":
                values[field] = None
                values[f"working_base_{field}"] = None
            else:
                values[f"working_base_{field}"] = snapshot[field]
    else:
        if not changed_fields:
            raise HTTPException(422, "provide at least one working field")
        for field in changed_fields:
            value = getattr(patch, field)
            if field == "ready":
                values["working_ready"] = value
                continue
            model_field = "made_for_kids" if field == "madeForKids" else field
            values[model_field] = value
            base_field = f"working_base_{model_field}"
            if value is None:
                values[base_field] = None
            elif getattr(video, model_field) is None:
                values[base_field] = snapshot[field]

    values["working_revision"] = Video.working_revision + 1
    updated = (
        db.query(Video)
        .filter(
            Video.id == video.id,
            Video.channel_id == video.channel_id,
            Video.working_revision == patch.revision,
        )
        .update(values, synchronize_session=False)
    )
    if updated != 1:
        db.rollback()
        current = _catalog_video_or_404(db, user, channel_id, video_id)
        raise HTTPException(
            409,
            detail={"code": "stale_revision", "current": _video_working_item(current)},
        )

    db.commit()
    db.refresh(video)
    return _video_working_item(video)


@app.post(
    "/channels/{channel_id}/videos/{video_id}/publish-metadata",
    dependencies=[Depends(require_same_origin)],
)
def publish_channel_video_metadata(
    channel_id: int,
    video_id: int,
    request: VideoPublishRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.write_mode_enabled:
        raise HTTPException(403, detail={"code": "write_mode_off"})
    # Serialize publishes for this video so two requests cannot send the same revision twice.
    video = _catalog_video_or_404(db, user, channel_id, video_id, for_update=True)
    if video.working_revision != request.revision:
        raise HTTPException(409, detail={"code": "stale_revision", "current": _video_working_item(video)})
    current = _video_working_item(video)
    if current["conflict"]:
        raise HTTPException(409, detail={"code": "working_conflict", "current": current})
    if video.availability_status != "available":
        raise HTTPException(409, detail={"code": "video_unavailable"})
    if not current["dirty"]:
        raise HTTPException(409, detail={"code": "nothing_to_publish"})
    if not video.youtube_video_id or not category_id or made_for_kids is None:
        raise HTTPException(422, detail={"code": "incomplete_youtube_snapshot"})

    title = current["effective"]["title"] or ""
    description = current["effective"]["description"] or ""
    tags_text = current["effective"]["tags"] or ""
    language = (current["effective"]["language"] or "").strip() or None
    category_id = (current["effective"]["category"] or "").strip()
    made_for_kids = current["effective"]["madeForKids"]
    tags = [tag.strip() for tag in tags_text.split(",") if tag.strip()]
    tags_cost = sum(len(tag) + (2 if " " in tag else 0) + (1 if index else 0) for index, tag in enumerate(tags))
    if tags_cost > 500:
        raise HTTPException(422, detail={"code": "invalid_tags"})
    if not title or len(title) > 100 or "<" in title or ">" in title:
        raise HTTPException(422, detail={"code": "invalid_title"})
    if len(description.encode("utf-8")) > 5000 or "<" in description or ">" in description:
        raise HTTPException(422, detail={"code": "invalid_description"})
    quota = quota_service.quota_summary(db)
    if quota["buckets"]["general"]["estimated_remaining"] < quota_service.operation_cost("videos.update")[1]:
        raise HTTPException(429, detail={"code": "quota_preflight_failed"})

    channel = _channel_or_404(db, user, channel_id)
    try:
        refresh_token = decrypt_refresh_token(channel.google_connection.encrypted_refresh_token)
        with yt.quota_recording(_quota_recorder(db, user, channel.google_connection, channel)):
            remote = yt.update_video_metadata(
                refresh_token,
                video.youtube_video_id,
                title=title,
                description=description,
                tags=tags,
                category_id=category_id,
                language=language,
                made_for_kids=made_for_kids,
            )
    except TokenEncryptionError as exc:
        raise HTTPException(500, detail={"code": "stored_credentials_unavailable"}) from exc
    except Exception as exc:
        message = str(exc).lower()
        if "insufficient" in message or "permission" in message or "scope" in message:
            raise HTTPException(409, detail={"code": "youtube_reauthorization_required"}) from exc
        raise HTTPException(502, detail={"code": "youtube_update_failed"}) from exc

    video.youtube_title = remote["youtube_title"]
    video.youtube_description = remote["youtube_description"]
    video.youtube_tags = remote["youtube_tags"]
    video.youtube_category_id = remote["youtube_category_id"]
    video.youtube_default_language = remote["youtube_default_language"]
    video.youtube_made_for_kids = remote["youtube_made_for_kids"]
    video.title = None
    video.description = None
    video.tags = None
    video.language = None
    video.category = None
    video.made_for_kids = None
    video.working_base_title = None
    video.working_base_description = None
    video.working_base_tags = None
    video.working_base_language = None
    video.working_base_category = None
    video.working_base_made_for_kids = None
    video.working_ready = False
    video.working_revision += 1
    db.commit()
    db.refresh(video)
    return _video_working_item(video)


@app.get("/channels/{channel_id}/analytics/summary")
def channel_analytics_summary(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id)
    try:
        token = decrypt_refresh_token(channel.google_connection.encrypted_refresh_token)
        start_date = (channel.yt_published_at or "2005-02-14")[:10]
        end_date = _utcnow().date().isoformat()
        return yt.channel_analytics_summary(token, start_date, end_date)
    except TokenEncryptionError as exc:
        raise HTTPException(500, "Stored YouTube credentials are unavailable") from exc
    except Exception as exc:
        raise HTTPException(502, "YouTube Analytics is unavailable") from exc


@app.get("/channels/{channel_id}/catalog/status")
def catalog_status(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    return _catalog_status(db, channel)


@app.post(
    "/channels/{channel_id}/catalog/sync",
    dependencies=[Depends(require_same_origin)],
)
def start_catalog_sync(
    channel_id: int,
    request: CatalogSyncRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id)
    sync = _ensure_catalog_sync(db, channel)
    if _catalog_sync_locked(sync):
        raise HTTPException(409, "catalog sync page is already running")
    if sync.state in ("LOADING", "PARTIAL"):
        if sync.mode != request.mode:
            raise HTTPException(409, "another catalog sync mode is in progress")
        return _catalog_status(db, channel)
    if request.mode == "initial" and sync.state in ("COMPLETE", "EMPTY"):
        return _catalog_status(db, channel)

    resume = sync.state in ("ERROR", "STALE") and sync.mode == request.mode
    sync.mode = request.mode
    sync.state = "LOADING"
    sync.last_started_at = _utcnow()
    sync.last_finished_at = None
    sync.last_error_code = None
    sync.scanned_count = 0 if not resume else sync.scanned_count
    if not resume:
        sync.next_page_token = None
        if request.mode == "initial":
            sync.uploads_playlist_id = None
        if request.mode in ("initial", "reconcile"):
            sync.generation += 1
    db.commit()
    return _catalog_status(db, channel)


@app.post(
    "/channels/{channel_id}/catalog/sync/continue",
    dependencies=[Depends(require_same_origin)],
)
def continue_catalog_sync(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id)
    sync = _catalog_row(db, channel)
    if sync is None or sync.mode is None or sync.state not in (
        "LOADING",
        "PARTIAL",
        "STALE",
        "ERROR",
    ):
        raise HTTPException(409, "catalog sync has not been started")
    lease_token = _claim_catalog_page(db, channel.id)
    sync = _catalog_row(db, channel)
    try:
        refresh_token = decrypt_refresh_token(channel.google_connection.encrypted_refresh_token)
        with yt.quota_recording(
            _quota_recorder(db, user, channel.google_connection, channel)
        ):
            page = yt.list_videos(
                refresh_token,
                channel.youtube_channel_id,
                page_token=sync.next_page_token,
                uploads_playlist_id=sync.uploads_playlist_id,
                limit=50,
            )
        if page["next_page_token"] and page["next_page_token"] == sync.next_page_token:
            raise RuntimeError("YouTube returned a non-advancing page token")

        video_ids = page["video_ids"]
        existing_rows = (
            db.query(Video)
            .filter(
                Video.channel_id == channel.id,
                Video.youtube_video_id.in_(video_ids),
            )
            .all()
            if video_ids
            else []
        )
        existing_ids = {video.youtube_video_id for video in existing_rows}
        videos_by_id = {video["youtube_video_id"]: video for video in page["videos"]}
        rows_by_id = {video.youtube_video_id: video for video in existing_rows}
        now = _utcnow()

        for youtube_video_id in video_ids:
            video = rows_by_id.get(youtube_video_id)
            if video is None:
                video = Video(
                    channel_id=channel.id,
                    youtube_video_id=youtube_video_id,
                    internal_status=None,
                )
                db.add(video)
                rows_by_id[youtube_video_id] = video
            remote = videos_by_id.get(youtube_video_id)
            if remote is None:
                video.availability_status = "unavailable"
            else:
                video.availability_status = "available"
                for field in (
                    "youtube_title",
                    "youtube_description",
                    "youtube_tags",
                    "youtube_thumbnail_url",
                    "youtube_category_id",
                    "youtube_default_language",
                    "youtube_default_audio_language",
                    "youtube_duration",
                    "youtube_visibility",
                    "youtube_upload_status",
                    "youtube_view_count",
                    "youtube_like_count",
                    "youtube_comment_count",
                    "youtube_captions_available",
                    "youtube_made_for_kids",
                ):
                    setattr(video, field, remote[field])
                video.youtube_published_at = _parse_youtube_datetime(
                    remote["youtube_published_at"]
                )
                video.youtube_scheduled_at = _parse_youtube_datetime(
                    remote["youtube_scheduled_at"]
                )
            video.last_synced_at = now
            if sync.mode in ("initial", "reconcile"):
                video.last_seen_generation = sync.generation

        incremental_overlap = sync.mode == "incremental" and bool(
            existing_ids.intersection(video_ids)
        )
        sync.uploads_playlist_id = page["uploads_playlist_id"]
        sync.scanned_count += len(video_ids)
        sync.next_page_token = page["next_page_token"]
        if incremental_overlap or not sync.next_page_token:
            if sync.mode == "reconcile":
                db.flush()
                missing = db.query(Video).filter(
                    Video.channel_id == channel.id,
                    Video.youtube_video_id.is_not(None),
                    or_(
                        Video.last_seen_generation.is_(None),
                        Video.last_seen_generation != sync.generation,
                    ),
                )
                has_work = or_(
                    Video.title.is_not(None),
                    Video.description.is_not(None),
                    Video.tags.is_not(None),
                )
                missing.filter(has_work).update(
                    {Video.availability_status: "remote_missing"},
                    synchronize_session=False,
                )
                missing.filter(
                    and_(
                        Video.title.is_(None),
                        Video.description.is_(None),
                        Video.tags.is_(None),
                    )
                ).delete(synchronize_session=False)
            sync.state = "EMPTY" if sync.scanned_count == 0 else "COMPLETE"
            sync.next_page_token = None
            sync.last_finished_at = now
            sync.last_success_at = now
        else:
            sync.state = "PARTIAL"
        sync.last_error_code = None
        sync.lease_token = None
        sync.lease_expires_at = None
        db.commit()
    except Exception as exc:
        error_code = _youtube_error_code(exc)
        db.rollback()
        sync = _catalog_row(db, channel)
        if sync is not None and sync.lease_token == lease_token:
            cached_count = (
                db.query(func.count(Video.id))
                .filter(Video.channel_id == channel.id, Video.youtube_video_id.is_not(None))
                .scalar()
                or 0
            )
            sync.state = "STALE" if cached_count else "ERROR"
            sync.last_error_code = error_code
            sync.last_finished_at = _utcnow()
            sync.lease_token = None
            sync.lease_expires_at = None
            db.commit()
        raise HTTPException(502, "YouTube catalog sync failed") from exc

    return _catalog_status(db, channel)


@app.get("/channels/{channel_id}/local-playlists")
def channel_local_playlists(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    rows = db.query(LocalPlaylist).filter(LocalPlaylist.channel_id == channel.id).order_by(LocalPlaylist.created_at).all()
    return [{"id": row.local_id, "title": row.title, "videoIds": row.video_ids or []} for row in rows]


@app.post("/channels/{channel_id}/local-playlists", dependencies=[Depends(require_same_origin)])
def create_local_playlist(
    channel_id: int,
    payload: LocalPlaylistCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    row = LocalPlaylist(channel_id=channel.id, local_id=payload.local_id, title=payload.title.strip(), video_ids=[])
    if not row.title:
        raise HTTPException(422, "playlist title is required")
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "local playlist already exists") from exc
    return {"id": row.local_id, "title": row.title, "videoIds": []}


@app.put("/channels/{channel_id}/local-playlists/{local_id}/membership", dependencies=[Depends(require_same_origin)])
def update_local_playlist_membership(
    channel_id: int,
    local_id: str,
    payload: LocalPlaylistMembershipUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    row = db.query(LocalPlaylist).filter(LocalPlaylist.channel_id == channel.id, LocalPlaylist.local_id == local_id).one_or_none()
    if row is None:
        raise HTTPException(404, "local playlist not found")
    row.video_ids = list(dict.fromkeys(video_id for video_id in payload.video_ids if video_id))
    db.commit()
    return {"id": row.local_id, "title": row.title, "videoIds": row.video_ids}


@app.delete("/channels/{channel_id}/local-playlists/{local_id}", dependencies=[Depends(require_same_origin)])
def delete_local_playlist(
    channel_id: int,
    local_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id, require_token=False)
    row = db.query(LocalPlaylist).filter(
        LocalPlaylist.channel_id == channel.id,
        LocalPlaylist.local_id == local_id,
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "local playlist not found")
    db.delete(row)
    db.commit()
    return {"deleted": True, "id": local_id}


@app.get("/channels/{channel_id}/playlists")
def channel_playlists(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _channel_or_404(db, user, channel_id)
    try:
        token = decrypt_refresh_token(row.google_connection.encrypted_refresh_token)
        with yt.quota_recording(_quota_recorder(db, user, row.google_connection, row)):
            return yt.list_playlists(token, row.youtube_channel_id)
    except TokenEncryptionError as exc:
        raise HTTPException(503, "Google token encryption configuration is invalid") from exc
    except Exception as exc:
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc


@app.get("/channels/{channel_id}/playlists/{playlist_id}/items")
def channel_playlist_items(
    channel_id: int,
    playlist_id: str,
    page_token: str | None = None,
    limit: int = Query(50, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id)
    try:
        token = decrypt_refresh_token(channel.google_connection.encrypted_refresh_token)
        with yt.quota_recording(
            _quota_recorder(db, user, channel.google_connection, channel)
        ):
            result = yt.list_playlist_items(
                token, channel.youtube_channel_id, playlist_id, page_token, limit
            )
    except LookupError as exc:
        raise HTTPException(404, "playlist not found for selected channel") from exc
    except TokenEncryptionError as exc:
        raise HTTPException(503, "Google token encryption configuration is invalid") from exc
    except Exception as exc:
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc

    video_ids = [item["videoId"] for item in result["items"]]
    catalog_items = {}
    if video_ids:
        cached_videos = (
            db.query(Video)
            .filter(
                Video.channel_id == channel.id,
                Video.youtube_video_id.in_(video_ids),
            )
            .all()
        )
        catalog_items = {
            video.youtube_video_id: _video_catalog_item(video) for video in cached_videos
        }
    return {
        **result,
        "items": [
            {**item, "catalogVideo": catalog_items.get(item["videoId"])}
            for item in result["items"]
        ],
    }


@app.get("/channels/{channel_id}/playlist-memberships")
def channel_playlist_memberships(
    channel_id: int,
    video_id: list[str] = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = _channel_or_404(db, user, channel_id)
    video_ids = list(dict.fromkeys(value for value in video_id if value))[:50]
    if not video_ids:
        return {"memberships": {}}
    try:
        token = decrypt_refresh_token(channel.google_connection.encrypted_refresh_token)
        with yt.quota_recording(
            _quota_recorder(db, user, channel.google_connection, channel)
        ):
            playlists = yt.list_playlists(token, channel.youtube_channel_id)
            playlist_ids = [playlist["id"] for playlist in playlists]
            memberships = yt.list_playlist_memberships(
                token,
                channel.youtube_channel_id,
                playlist_ids,
                video_ids,
            )
    except TokenEncryptionError as exc:
        raise HTTPException(503, "Google token encryption configuration is invalid") from exc
    except Exception as exc:
        raise HTTPException(502, f"{type(exc).__name__}: {exc}") from exc
    return {"memberships": memberships}


@app.post(
    "/channels/{channel_id}/refresh-profile",
    dependencies=[Depends(require_same_origin)],
)
def refresh_profile(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _channel_or_404(db, user, channel_id)
    try:
        token = decrypt_refresh_token(row.google_connection.encrypted_refresh_token)
        creds = yt.creds_from_refresh(token)
        with yt.quota_recording(_quota_recorder(db, user, row.google_connection, row)):
            info = yt.fetch_channel(creds, row.youtube_channel_id)
    except TokenEncryptionError as exc:
        raise HTTPException(503, "Google token encryption configuration is invalid") from exc
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
        "owner_email": row.google_connection.email or "",
        "youtube_channel_id": row.youtube_channel_id,
        "has_token": True,
        "description": info.get("description") or "",
        "yt_published_at": info.get("yt_published_at") or "",
        "subscriber_count": int(info.get("subscriber_count") or 0),
        "video_count": int(info.get("video_count") or 0),
        "hidden_subscribers": bool(info.get("hidden_subscribers")),
    }
