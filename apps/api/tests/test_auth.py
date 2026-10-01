import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from oauthlib.oauth2.rfc6749.parameters import parse_token_response

from app import main
from app.models import Channel, GoogleConnection, Identity, User, UserSession
from app.security import create_oauth_state
from app.settings import settings
from app.tokens import decrypt_refresh_token, encrypt_refresh_token
from app.youtube import IDENTITY_SCOPES, YOUTUBE_SCOPES

from conftest import create_account


def test_verify_identity_token_uses_one_second_clock_skew(monkeypatch):
    captured = {}

    def fake_verify_oauth2_token(
        token, request, audience=None, clock_skew_in_seconds=0
    ):
        captured["clock_skew_in_seconds"] = clock_skew_in_seconds
        return {"sub": "fixture-subject"}

    monkeypatch.setattr(
        main.yt.id_token,
        "verify_oauth2_token",
        fake_verify_oauth2_token,
    )

    claims = main.yt.verify_identity_token("fixture-id-token")

    assert claims == {"sub": "fixture-subject"}
    assert captured["clock_skew_in_seconds"] == 1


def test_identity_oauth_scopes_accept_google_set_and_reject_mismatch():
    expected_identity_scopes = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
    assert IDENTITY_SCOPES == expected_identity_scopes
    assert YOUTUBE_SCOPES == [
        "https://www.googleapis.com/auth/youtube.readonly",
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
    ]
    assert "email" not in YOUTUBE_SCOPES
    assert "profile" not in YOUTUBE_SCOPES
    assert "https://www.googleapis.com/auth/youtube.force-ssl" not in YOUTUBE_SCOPES

    token_response = json.dumps(
        {
            "access_token": "test-access-token",
            "token_type": "Bearer",
            "scope": " ".join(expected_identity_scopes),
        }
    )
    parsed = parse_token_response(token_response, scope=expected_identity_scopes)
    assert set(parsed["scope"]) == set(expected_identity_scopes)

    mismatched_response = json.dumps(
        {
            "access_token": "test-access-token",
            "token_type": "Bearer",
            "scope": " ".join([*expected_identity_scopes, "email", "profile"]),
        }
    )
    with pytest.raises(Warning):
        parse_token_response(mismatched_response, scope=expected_identity_scopes)


def test_youtube_authorization_url_does_not_merge_previously_granted_scopes(monkeypatch):
    captured = {}

    class FakeFlow:
        def authorization_url(self, **kwargs):
            captured["authorization_kwargs"] = kwargs
            return "https://accounts.test/youtube", "fixture-state"

    def fake_flow(scopes, redirect_uri):
        captured["scopes"] = scopes
        captured["redirect_uri"] = redirect_uri
        return FakeFlow()

    monkeypatch.setattr(main.yt, "_flow", fake_flow)

    url, state = main.yt.youtube_authorization_url()

    assert url == "https://accounts.test/youtube"
    assert state == "fixture-state"
    assert captured["scopes"] == YOUTUBE_SCOPES
    assert captured["authorization_kwargs"] == {
        "access_type": "offline",
        "prompt": "consent",
    }


def test_google_login_validates_one_time_state_and_issues_secure_cookie(
    client, test_database, monkeypatch
):
    state = "identity-state-once"
    monkeypatch.setattr(main.yt, "identity_authorization_url", lambda: ("https://accounts.test", state))
    monkeypatch.setattr(
        main.yt,
        "exchange_identity_code",
        lambda code, callback_state: SimpleNamespace(id_token="verified-token"),
    )
    monkeypatch.setattr(
        main.yt,
        "verify_identity_token",
        lambda token: {
            "sub": "provider-subject",
            "email": "person@example.test",
            "email_verified": True,
        },
    )
    monkeypatch.setattr(settings, "app_environment", "production")

    login = client.get("/auth/google/login")
    assert login.status_code == 307
    assert login.headers["location"] == "https://accounts.test"

    callback = client.get(
        "/auth/google/callback",
        params={"code": "authorization-code", "state": state},
    )
    assert callback.status_code == 303
    set_cookie = callback.headers["set-cookie"]
    assert "httponly" in set_cookie.lower()
    assert "secure" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()
    session = client.get("/auth/session").json()
    assert session["authenticated"] is True
    assert session["user"]["email"] == "person@example.test"

    replay = client.get(
        "/auth/google/callback",
        params={"code": "authorization-code", "state": state},
    )
    assert replay.status_code == 400


def test_google_oauth_state_cannot_be_reused_from_another_browser(client, monkeypatch):
    state = "browser-bound-identity-state"
    monkeypatch.setattr(main.yt, "identity_authorization_url", lambda: ("https://accounts.test", state))
    initiated = client.get("/auth/google/login")
    assert initiated.status_code == 307

    from fastapi.testclient import TestClient

    with TestClient(main.app, base_url="https://other-browser.test", follow_redirects=False) as other_browser:
        response = other_browser.get(
            "/auth/google/callback",
            params={"code": "attacker-code", "state": state},
        )
    assert response.status_code == 400


def test_google_callback_rejects_unknown_state_without_exchanging_code(client, monkeypatch):
    def fail_exchange(*args):
        raise AssertionError("OAuth code must not be exchanged for an invalid state")

    monkeypatch.setattr(main.yt, "exchange_identity_code", fail_exchange)
    response = client.get(
        "/auth/google/callback",
        params={"code": "authorization-code", "state": "unrecognized"},
    )
    assert response.status_code == 400


@pytest.mark.parametrize("failure_step", ["exchange", "verify"])
def test_google_callback_failures_use_generic_error_without_echoing_credentials(
    client, monkeypatch, failure_step
):
    state = f"identity-failure-state-{failure_step}"
    monkeypatch.setattr(
        main.yt,
        "identity_authorization_url",
        lambda: ("https://accounts.test", state),
    )
    if failure_step == "exchange":
        def fail_exchange(*args):
            raise ValueError(
                "authorization_code=fixture-authorization-code "
                "client_secret=fixture-client-secret access_token=fixture-access-token "
                "refresh_token=fixture-refresh-token id_token=fixture-id-token"
            )

        monkeypatch.setattr(main.yt, "exchange_identity_code", fail_exchange)
    else:
        monkeypatch.setattr(
            main.yt,
            "exchange_identity_code",
            lambda *args: SimpleNamespace(
                id_token="fixture-id-token",
                token="fixture-access-token",
                refresh_token="fixture-refresh-token",
            ),
        )

        def fail_verification(token):
            raise ValueError(
                "authorization_code=fixture-authorization-code "
                "client_secret=fixture-client-secret access_token=fixture-access-token "
                "refresh_token=fixture-refresh-token id_token=fixture-id-token"
            )

        monkeypatch.setattr(main.yt, "verify_identity_token", fail_verification)

    assert client.get("/auth/google/login").status_code == 307
    response = client.get(
        "/auth/google/callback",
        params={"code": "fixture-authorization-code", "state": state},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Google authentication failed"}
    for secret in (
        "fixture-authorization-code",
        "fixture-client-secret",
        "fixture-access-token",
        "fixture-refresh-token",
        "fixture-id-token",
    ):
        assert secret not in response.text


@pytest.mark.parametrize("failure_step", ["exchange", "verify"])
def test_youtube_callback_failures_use_generic_error_without_echoing_credentials(
    client, test_database, monkeypatch, failure_step
):
    _, session_token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, session_token)
    state = f"youtube-failure-state-{failure_step}"
    monkeypatch.setattr(
        main.yt,
        "youtube_authorization_url",
        lambda: ("https://accounts.test/youtube", state),
    )
    if failure_step == "exchange":
        def fail_exchange(*args):
            raise ValueError(
                "authorization_code=fixture-authorization-code "
                "client_secret=fixture-client-secret access_token=fixture-access-token "
                "refresh_token=fixture-refresh-token id_token=fixture-id-token"
            )

        monkeypatch.setattr(main.yt, "exchange_youtube_code", fail_exchange)
    else:
        monkeypatch.setattr(
            main.yt,
            "exchange_youtube_code",
            lambda *args: SimpleNamespace(
                id_token="fixture-id-token",
                token="fixture-access-token",
                refresh_token="fixture-refresh-token",
            ),
        )

        def fail_verification(token):
            raise ValueError(
                "authorization_code=fixture-authorization-code "
                "client_secret=fixture-client-secret access_token=fixture-access-token "
                "refresh_token=fixture-refresh-token id_token=fixture-id-token"
            )

        monkeypatch.setattr(main.yt, "verify_identity_token", fail_verification)

    assert client.get("/auth/youtube/login").status_code == 307
    response = client.get(
        "/auth/youtube/callback",
        params={"code": "fixture-authorization-code", "state": state},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "YouTube connection failed"}
    for secret in (
        "fixture-authorization-code",
        "fixture-client-secret",
        "fixture-access-token",
        "fixture-refresh-token",
        "fixture-id-token",
    ):
        assert secret not in response.text


def test_session_logout_revokes_server_session_and_checks_origin(client, test_database):
    user_id, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    assert client.get("/auth/session").json()["authenticated"] is True

    rejected = client.post("/auth/logout", headers={"Origin": "https://attacker.test"})
    assert rejected.status_code == 403
    response = client.post("/auth/logout", headers={"Origin": settings.frontend_origin})
    assert response.status_code == 200
    assert client.get("/auth/session").json() == {"authenticated": False}


def test_expired_session_is_rejected_for_protected_endpoint(client, test_database):
    _, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    with test_database() as db:
        session = db.query(UserSession).one()
        session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    assert client.get("/channels").status_code == 401


def test_youtube_connection_persists_only_encrypted_token(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    state = "youtube-state-once"
    monkeypatch.setattr(main.yt, "youtube_authorization_url", lambda: ("https://accounts.test/youtube", state))
    monkeypatch.setattr(
        main.yt,
        "exchange_youtube_code",
        lambda code, callback_state: SimpleNamespace(
            id_token="connection-id-token", refresh_token="refresh-token-value"
        ),
    )
    monkeypatch.setattr(
        main.yt,
        "verify_identity_token",
        lambda token: {"sub": "separate-google-account", "email": "channel@example.test"},
    )

    login = client.get("/auth/youtube/login")
    assert login.status_code == 307
    assert "youtube.readonly" in " ".join(YOUTUBE_SCOPES)
    assert not any("force-ssl" in scope for scope in YOUTUBE_SCOPES)
    callback = client.get(
        "/auth/youtube/callback",
        params={"code": "authorization-code", "state": state},
    )
    assert callback.status_code == 303

    with test_database() as db:
        connection = db.query(GoogleConnection).one()
        assert callback.headers["location"].endswith(
            f"/cabinet?select_connection={connection.id}"
        )
        assert connection.user_id == user_id
        assert connection.encrypted_refresh_token != "refresh-token-value"
        assert decrypt_refresh_token(connection.encrypted_refresh_token) == "refresh-token-value"
        assert db.query(Channel).count() == 0


def _add_google_connection(session_factory, user_id, google_subject):
    with session_factory() as db:
        connection = GoogleConnection(
            user_id=user_id,
            google_subject=google_subject,
            email=f"{google_subject}@example.test",
            encrypted_refresh_token=encrypt_refresh_token("refresh-token"),
        )
        db.add(connection)
        db.commit()
        return connection.id


def _available_channel(youtube_channel_id, title):
    return {
        "youtube_channel_id": youtube_channel_id,
        "title": title,
        "thumbnail_url": f"https://images.example.test/{youtube_channel_id}.jpg",
        "banner_url": "",
        "description": "",
        "yt_published_at": "",
        "subscriber_count": 0,
    }


def test_list_available_channels_paginates_all_results(monkeypatch):
    pages = {
        None: {
            "items": [{"id": "channel-one", "snippet": {"title": "One"}}],
            "nextPageToken": "next-page",
        },
        "next-page": {
            "items": [{"id": "channel-two", "snippet": {"title": "Two"}}],
        },
    }
    calls = []

    class FakeChannels:
        def list(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(execute=lambda: pages[kwargs["pageToken"]])

    class FakeService:
        def channels(self):
            return FakeChannels()

    monkeypatch.setattr(main.yt, "build", lambda *args, **kwargs: FakeService())
    channels = main.yt.list_available_channels(SimpleNamespace())

    assert [channel["youtube_channel_id"] for channel in channels] == [
        "channel-one",
        "channel-two",
    ]
    assert [call["pageToken"] for call in calls] == [None, "next-page"]
    assert all(call["mine"] is True and call["maxResults"] == 50 for call in calls)


def test_channel_discovery_returns_empty_list(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    connection_id = _add_google_connection(test_database, user_id, "empty-account")
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda value: SimpleNamespace())
    monkeypatch.setattr(main.yt, "list_available_channels", lambda creds: [])

    response = client.get(
        f"/google-connections/{connection_id}/available-channels"
    )

    assert response.status_code == 200
    assert response.json() == []


def test_channel_selection_saves_only_selected_and_is_idempotent(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    connection_id = _add_google_connection(test_database, user_id, "selection-account")
    client.cookies.set(settings.session_cookie_name, token)
    available = [
        _available_channel("channel-one", "One"),
        _available_channel("channel-two", "Two"),
        _available_channel("channel-three", "Three"),
    ]
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda value: SimpleNamespace())
    monkeypatch.setattr(main.yt, "list_available_channels", lambda creds: available)
    payload = {"youtube_channel_ids": ["channel-one", "channel-three"]}
    headers = {"Origin": settings.frontend_origin}
    endpoint = f"/google-connections/{connection_id}/channels"

    first = client.post(endpoint, json=payload, headers=headers)
    second = client.post(endpoint, json=payload, headers=headers)

    assert first.status_code == second.status_code == 200
    assert [item["youtube_channel_id"] for item in first.json()["channels"]] == [
        "channel-one",
        "channel-three",
    ]
    with test_database() as db:
        assert {
            channel.youtube_channel_id for channel in db.query(Channel).all()
        } == {"channel-one", "channel-three"}


def test_channel_selection_rejects_empty_and_unavailable_ids(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    connection_id = _add_google_connection(test_database, user_id, "validation-account")
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda value: SimpleNamespace())
    monkeypatch.setattr(
        main.yt,
        "list_available_channels",
        lambda creds: [_available_channel("available-channel", "Available")],
    )
    endpoint = f"/google-connections/{connection_id}/channels"
    headers = {"Origin": settings.frontend_origin}

    empty = client.post(endpoint, json={"youtube_channel_ids": []}, headers=headers)
    fake = client.post(
        endpoint,
        json={"youtube_channel_ids": ["not-available"]},
        headers=headers,
    )

    assert empty.status_code == 422
    assert fake.status_code == 422
    with test_database() as db:
        assert db.query(Channel).count() == 0


def test_discovery_and_selection_reject_foreign_connection(
    client, test_database, monkeypatch
):
    owner_id, _ = create_account(test_database, subject="connection-owner")
    other_id, other_token = create_account(test_database, subject="connection-other")
    connection_id = _add_google_connection(test_database, owner_id, "private-account")
    client.cookies.set(settings.session_cookie_name, other_token)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("foreign Google connections must be rejected before YouTube")

    monkeypatch.setattr(main.yt, "creds_from_refresh", fail_if_called)
    discovery = client.get(
        f"/google-connections/{connection_id}/available-channels"
    )
    selection = client.post(
        f"/google-connections/{connection_id}/channels",
        json={"youtube_channel_ids": ["channel-one"]},
        headers={"Origin": settings.frontend_origin},
    )

    assert other_id != owner_id
    assert discovery.status_code == selection.status_code == 404


def test_global_channel_conflict_does_not_transfer_ownership(
    client, test_database, monkeypatch
):
    owner_id, _ = create_account(test_database, subject="channel-owner")
    other_id, other_token = create_account(test_database, subject="channel-other")
    existing_connection_id = _add_google_connection(
        test_database, owner_id, "existing-google-account"
    )
    new_connection_id = _add_google_connection(
        test_database, other_id, "new-google-account"
    )
    with test_database() as db:
        existing = Channel(
            google_connection_id=existing_connection_id,
            youtube_channel_id="already-connected",
            title="Existing channel",
        )
        db.add(existing)
        db.commit()
        existing_id = existing.id

    client.cookies.set(settings.session_cookie_name, other_token)
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda value: SimpleNamespace())
    monkeypatch.setattr(
        main.yt,
        "list_available_channels",
        lambda creds: [_available_channel("already-connected", "Existing channel")],
    )
    response = client.post(
        f"/google-connections/{new_connection_id}/channels",
        json={"youtube_channel_ids": ["already-connected"]},
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 409
    with test_database() as db:
        channel = db.query(Channel).one()
        assert channel.id == existing_id
        assert channel.google_connection_id == existing_connection_id


def test_repeated_youtube_oauth_reuses_connection_and_selected_channel(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    connection_id = _add_google_connection(test_database, user_id, "reconnect-account")
    with test_database() as db:
        db.add(
            Channel(
                google_connection_id=connection_id,
                youtube_channel_id="already-selected",
                title="Selected channel",
            )
        )
        db.commit()
    client.cookies.set(settings.session_cookie_name, token)
    states = iter(["reconnect-state-one", "reconnect-state-two"])
    monkeypatch.setattr(
        main.yt,
        "youtube_authorization_url",
        lambda: ("https://accounts.test/youtube", next(states)),
    )
    monkeypatch.setattr(
        main.yt,
        "exchange_youtube_code",
        lambda code, state: SimpleNamespace(
            id_token="reconnect-id-token", refresh_token=f"refresh-{state}"
        ),
    )
    monkeypatch.setattr(
        main.yt,
        "verify_identity_token",
        lambda value: {"sub": "reconnect-account", "email": "reconnect@example.test"},
    )
    monkeypatch.setattr(
        main.yt,
        "list_available_channels",
        lambda *args: (_ for _ in ()).throw(
            AssertionError("OAuth callback must not run discovery")
        ),
    )

    for state in ("reconnect-state-one", "reconnect-state-two"):
        assert client.get("/auth/youtube/login").status_code == 307
        assert client.get(
            "/auth/youtube/callback",
            params={"code": "authorization-code", "state": state},
        ).status_code == 303

    with test_database() as db:
        connections = db.query(GoogleConnection).all()
        channels = db.query(Channel).all()
        assert len(connections) == len(channels) == 1
        assert connections[0].id == connection_id
        assert decrypt_refresh_token(connections[0].encrypted_refresh_token) == (
            "refresh-reconnect-state-two"
        )


def test_youtube_oauth_state_is_bound_to_authenticated_user(client, test_database, monkeypatch):
    first_user_id, first_token = create_account(test_database, subject="first")
    second_user_id, second_token = create_account(test_database, subject="second")
    state = "state-bound-to-first-user"
    with test_database() as db:
        state, browser_binding = create_oauth_state(
            db, "youtube_connection", first_user_id, state
        )

    client.cookies.set(settings.session_cookie_name, second_token)
    from app.security import oauth_state_cookie_name

    client.cookies.set(oauth_state_cookie_name(state), browser_binding)
    response = client.get(
        "/auth/youtube/callback",
        params={"code": "authorization-code", "state": state},
    )
    assert response.status_code == 400
    assert first_token != second_token


def test_youtube_oauth_cannot_claim_connection_owned_by_another_user(
    client, test_database, monkeypatch
):
    owner_id, _ = create_account(test_database, subject="connection-owner")
    other_id, other_token = create_account(test_database, subject="connection-claimant")
    connection_id = _add_google_connection(test_database, owner_id, "shared-google-subject")
    client.cookies.set(settings.session_cookie_name, other_token)
    monkeypatch.setattr(
        main.yt, "youtube_authorization_url", lambda: ("https://accounts.test/youtube", "collision-state")
    )
    monkeypatch.setattr(
        main.yt,
        "exchange_youtube_code",
        lambda code, state: SimpleNamespace(
            id_token="collision-id-token", refresh_token="claimant-refresh-token"
        ),
    )
    monkeypatch.setattr(
        main.yt,
        "verify_identity_token",
        lambda value: {"sub": "shared-google-subject", "email": "shared@example.test"},
    )

    assert client.get("/auth/youtube/login").status_code == 307
    response = client.get(
        "/auth/youtube/callback",
        params={"code": "authorization-code", "state": "collision-state"},
    )

    assert response.status_code == 409
    with test_database() as db:
        connection = db.get(GoogleConnection, connection_id)
        assert connection.user_id == owner_id
        assert connection.user_id != other_id
        assert decrypt_refresh_token(connection.encrypted_refresh_token) == "refresh-token"
        assert db.query(GoogleConnection).count() == 1


def test_refresh_token_encryption_uses_configured_key(monkeypatch):
    monkeypatch.setattr(settings, "token_encryption_key", "")
    try:
        encrypt_refresh_token("sensitive-value")
    except RuntimeError as error:
        assert "TOKEN_ENCRYPTION_KEY" in str(error)
    else:
        raise AssertionError("encryption without an environment key must fail")


def test_provider_identities_with_same_email_remain_separate(test_database):
    with test_database() as db:
        google_user = User()
        apple_user = User()
        db.add_all([google_user, apple_user])
        db.flush()
        db.add_all(
            [
                Identity(
                    user_id=google_user.id,
                    provider="google",
                    subject="google-subject",
                    email="same@example.test",
                ),
                Identity(
                    user_id=apple_user.id,
                    provider="apple",
                    subject="apple-subject",
                    email="same@example.test",
                ),
            ]
        )
        db.commit()
        assert google_user.id != apple_user.id