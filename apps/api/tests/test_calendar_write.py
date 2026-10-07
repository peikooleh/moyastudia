from app import main
from app.models import Channel, GoogleConnection, User, Video
from app.settings import settings
from app.tokens import encrypt_refresh_token

from conftest import create_account


def _calendar_fixture(test_database, *, write_mode=True):
    user_id, session_token = create_account(test_database, subject="calendar-owner")
    with test_database() as db:
        user = db.get(User, user_id)
        user.write_mode_enabled = write_mode
        connection = GoogleConnection(
            user_id=user_id,
            google_subject="calendar-google",
            encrypted_refresh_token=encrypt_refresh_token("calendar-refresh"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="calendar-channel",
            title="Calendar channel",
        )
        db.add(channel)
        db.flush()
        video = Video(
            channel_id=channel.id,
            youtube_video_id="calendar-video",
            availability_status="available",
            youtube_title="Calendar video",
            youtube_visibility="private",
        )
        db.add(video)
        db.commit()
        return session_token, channel.id, video.id


def test_calendar_write_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database, write_mode=False)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "update_video_calendar_status", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "private", "publishAt": "2099-01-02T15:30:00Z"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "write_mode_off"


def test_calendar_schedule_requires_private(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "update_video_calendar_status", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "public", "publishAt": "2099-01-02T15:30:00Z"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "scheduled_video_must_be_private"


def test_calendar_schedule_requires_timezone(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "update_video_calendar_status", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "private", "publishAt": "2099-01-02T15:30:00"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "schedule_timezone_required"


def test_calendar_write_updates_local_snapshot(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    captured = {}

    def fake_update(refresh_token, youtube_video_id, **kwargs):
        captured.update(refresh_token=refresh_token, youtube_video_id=youtube_video_id, **kwargs)
        return {"privacy": kwargs["privacy_status"], "publishAt": kwargs["publish_at"]}

    monkeypatch.setattr(main.yt, "update_video_calendar_status", fake_update)
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "private", "publishAt": "2099-01-02T15:30:00+00:00"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "scheduled"
    assert response.json()["slot"].startswith("2099-01-02T15:30")
    assert captured["youtube_video_id"] == "calendar-video"
    assert captured["privacy_status"] == "private"
    assert captured["publish_at"] == "2099-01-02T15:30:00Z"
    with test_database() as db:
        video = db.get(Video, video_id)
        assert video.youtube_visibility == "private"
        assert video.youtube_scheduled_at is not None
        assert video.youtube_scheduled_at.year == 2099
        assert video.youtube_scheduled_at.month == 1
        assert video.youtube_scheduled_at.day == 2
        assert video.youtube_scheduled_at.hour == 15
        assert video.youtube_scheduled_at.minute == 30


def test_calendar_unschedule_clears_publish_at(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)

    def fake_update(refresh_token, youtube_video_id, **kwargs):
        return {"privacy": kwargs["privacy_status"], "publishAt": None}

    monkeypatch.setattr(main.yt, "update_video_calendar_status", fake_update)
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "private", "publishAt": None},
    )
    assert response.status_code == 200
    assert response.json()["privacy"] == "private"
    assert response.json()["slot"] == ""


def test_calendar_write_requires_same_origin(client, test_database):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        json={"privacy": "private", "publishAt": None},
    )
    assert response.status_code == 403



def test_calendar_write_classifies_provider_403_without_leaking_text(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)

    class ProviderError(Exception):
        resp = type("Response", (), {"status": 403})()
        error_details = []

    monkeypatch.setattr(main.yt, "update_video_calendar_status", lambda *args, **kwargs: (_ for _ in ()).throw(ProviderError("private provider detail")))
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "public", "publishAt": None},
    )
    assert response.status_code == 403
    assert response.json() == {"detail": {"code": "youtube_status_change_rejected"}}
    assert "private provider detail" not in response.text


def test_calendar_unchanged_schedule_short_circuits_before_youtube(client, test_database, monkeypatch):
    token, channel_id, video_id = _calendar_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    with test_database() as db:
        video = db.get(Video, video_id)
        video.youtube_scheduled_at = main._parse_youtube_datetime("2099-01-02T15:30:00Z")
        db.commit()

    monkeypatch.setattr(
        main.yt,
        "update_video_calendar_status",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("unchanged schedule must not call YouTube")),
    )
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/calendar-status",
        headers={"Origin": settings.frontend_origin},
        json={"privacy": "private", "publishAt": "2099-01-02T15:30:00+00:00"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "scheduled"
    assert response.json()["slot"].startswith("2099-01-02T15:30")
