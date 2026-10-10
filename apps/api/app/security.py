from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from .db import get_db
from .models import OAuthState, User, UserSession
from .settings import settings


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def oauth_state_cookie_name(value: str) -> str:
    return "moya_oauth_" + hash_secret(value)[:16]


def create_oauth_state(
    db: Session,
    purpose: str,
    user_id: str | None = None,
    value: str | None = None,
    browser_binding: str | None = None,
) -> tuple[str, str]:
    value = value or secrets.token_urlsafe(32)
    browser_binding = browser_binding or secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.query(OAuthState).filter(OAuthState.expires_at <= now).delete(
        synchronize_session=False
    )
    db.add(
        OAuthState(
            state_hash=hash_secret(value),
            purpose=purpose,
            browser_binding_hash=hash_secret(browser_binding),
            user_id=user_id,
            expires_at=now + timedelta(seconds=settings.oauth_state_ttl_seconds),
        )
    )
    db.commit()
    return value, browser_binding


def consume_oauth_state(
    db: Session,
    value: str,
    purpose: str,
    browser_binding: str,
    user_id: str | None = None,
) -> bool:
    statement = delete(OAuthState).where(
        OAuthState.state_hash == hash_secret(value),
        OAuthState.purpose == purpose,
        OAuthState.browser_binding_hash == hash_secret(browser_binding),
        OAuthState.user_id == user_id,
        OAuthState.expires_at > datetime.now(timezone.utc),
    )
    consumed = db.execute(statement.returning(OAuthState.state_hash)).first() is not None
    db.commit()
    return consumed


def consume_youtube_oauth_state(
    db: Session,
    value: str,
    browser_binding: str,
    user_id: str,
) -> str | None:
    statement = delete(OAuthState).where(
        OAuthState.state_hash == hash_secret(value),
        OAuthState.browser_binding_hash == hash_secret(browser_binding),
        OAuthState.user_id == user_id,
        OAuthState.expires_at > datetime.now(timezone.utc),
        or_(
            OAuthState.purpose == "youtube_connection",
            OAuthState.purpose.like("youtube_connection_reauthorize:%"),
        ),
    ).returning(OAuthState.purpose)
    purpose = db.execute(statement).scalar_one_or_none()
    db.commit()
    return purpose


def create_session(db: Session, user_id: str) -> str:
    value = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    # A fresh identity login replaces prior browser sessions for this account.
    # This prevents an older captured session from surviving a re-authentication.
    db.query(UserSession).filter(
        or_(UserSession.expires_at <= now, UserSession.user_id == user_id)
    ).delete(synchronize_session=False)
    db.add(
        UserSession(
            token_hash=hash_secret(value),
            user_id=user_id,
            expires_at=now + timedelta(seconds=settings.session_ttl_seconds),
        )
    )
    db.commit()
    return value


def get_optional_user(request: Request, db: Session) -> User | None:
    value = request.cookies.get(settings.session_cookie_name)
    if not value:
        return None
    session = (
        db.query(UserSession)
        .filter(
            UserSession.token_hash == hash_secret(value),
            UserSession.expires_at > datetime.now(timezone.utc),
        )
        .one_or_none()
    )
    return session.user if session else None


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    user = get_optional_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


def require_same_origin(request: Request) -> None:
    origin = request.headers.get("origin", "").rstrip("/")
    expected = settings.frontend_origin.rstrip("/")
    if not origin or origin != expected:
        raise HTTPException(status_code=403, detail="same-origin request required")


def set_session_cookie(response, value: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=value,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.is_production,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.is_production,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def set_oauth_state_cookie(response, state: str, browser_binding: str) -> None:
    response.set_cookie(
        key=oauth_state_cookie_name(state),
        value=browser_binding,
        max_age=settings.oauth_state_ttl_seconds,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/auth",
    )


def clear_oauth_state_cookie(response, state: str) -> None:
    response.delete_cookie(
        key=oauth_state_cookie_name(state),
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/auth",
    )