from app import main
from app.models import Channel, GoogleConnection, User, Video
from app.settings import settings
from app.tokens import encrypt_refresh_token

from conftest import create_account


def _video_fixture(test_database, *, write_mode=True):
    user_id, session_token = create_account(test_database, subject="w4-owner")
    with test_database() as db:
        user = db.get(User, user_id)
        user.write_mode_enabled = write_mode
        connection = GoogleConnection(
            user_id=user_id,
            google_subject="w4-google",
            encrypted_refresh_token=encrypt_refresh_token("w4-refresh"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="w4-channel",
            title="W4 channel",
        )
        db.add(channel)
        db.flush()
        video = Video(
            channel_id=channel.id,
            youtube_video_id="youtube-video",
            availability_status="available",
            youtube_title="Old title",
            youtube_description="Old description",
            youtube_tags=["old"],
            youtube_category_id="27",
            youtube_default_language="ru",
            title="New title",
            description="New description",
            tags="new tag, german",
            language="de",
            working_base_title="Old title",
            working_base_description="Old description",
            working_base_tags="old",
            working_base_language="ru",
            working_revision=4,
        )
        db.add(video)
        db.commit()
        return session_token, channel.id, video.id


def test_single_video_publish_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database, write_mode=False)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "update_video_metadata", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/publish-metadata",
        headers={"Origin": settings.frontend_origin},
        json={"revision": 4},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "write_mode_off"


def test_single_video_publish_updates_snapshot_and_clears_working_copy(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    captured = {}

    def fake_update(refresh_token, youtube_video_id, **kwargs):
        captured.update(refresh_token=refresh_token, youtube_video_id=youtube_video_id, **kwargs)
        return {
            "youtube_title": kwargs["title"],
            "youtube_description": kwargs["description"],
            "youtube_tags": kwargs["tags"],
            "youtube_category_id": kwargs["category_id"],
            "youtube_default_language": kwargs["language"],
        }

    monkeypatch.setattr(main.yt, "update_video_metadata", fake_update)
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/publish-metadata",
        headers={"Origin": settings.frontend_origin},
        json={"revision": 4},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["dirty"] is False
    assert body["snapshot"]["title"] == "New title"
    assert body["snapshot"]["language"] == "de"
    assert captured["youtube_video_id"] == "youtube-video"
    assert captured["tags"] == ["new tag", "german"]
    assert captured["category_id"] == "27"
    assert captured["language"] == "de"
    with test_database() as db:
        video = db.get(Video, video_id)
        assert video.title is None
        assert video.language is None
        assert video.youtube_default_language == "de"


def test_single_video_publish_rejects_stale_revision(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "update_video_metadata", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/publish-metadata",
        headers={"Origin": settings.frontend_origin},
        json={"revision": 3},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "stale_revision"


def test_single_video_publish_requires_same_origin(client, test_database):
    token, channel_id, video_id = _video_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/publish-metadata",
        json={"revision": 4},
    )
    assert response.status_code == 403
