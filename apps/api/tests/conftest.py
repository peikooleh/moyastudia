import os

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

for name in (
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
):
    os.environ[name] = ""

from app.db import Base, get_db
from app import db as database
from app.main import app
from app.models import Identity, User
from app.security import create_session
from app.settings import settings


@pytest.fixture
def test_database(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(database, "engine", None)
    monkeypatch.setattr(database, "SessionLocal", None)
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(settings, "app_environment", "development")
    monkeypatch.setattr(settings, "frontend_origin", "http://localhost:3000")
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")
    monkeypatch.setattr(
        settings, "token_encryption_key", Fernet.generate_key().decode("ascii")
    )
    yield session_factory
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def client(test_database):
    with TestClient(app, base_url="https://testserver", follow_redirects=False) as test_client:
        yield test_client


def create_account(session_factory, email="user@example.test", subject="google-user"):
    with session_factory() as db:
        user = User()
        db.add(user)
        db.flush()
        db.add(
            Identity(
                user_id=user.id,
                provider="google",
                subject=subject,
                email=email,
                email_verified=True,
            )
        )
        db.commit()
        session_value = create_session(db, user.id)
        return user.id, session_value