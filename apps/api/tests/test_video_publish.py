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
            youtube_made_for_kids=False,
            title="New title",
            description="New description",
            tags="new tag, german",
            language="de",
            category="22",
            made_for_kids=True,
            working_base_title="Old title",
            working_base_description="Old description",
            working_base_tags="old",
            working_base_language="ru",
            working_base_category="27",
            working_base_made_for_kids=False,
            working_revision=4,
        )
        db.add(video)
        db.commit()
        return session_token, channel.id, video.id


def test_video_settings_patch_tracks_category_and_audience(client, test_database):
    token, channel_id, video_id = _video_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    response = client.patch(
        f"/channels/{channel_id}/videos/{video_id}/working",
        headers={"Origin": settings.frontend_origin},
        json={"revision": 4, "category": "24", "madeForKids": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["effective"]["category"] == "24"
    assert body["effective"]["madeForKids"] is False
    assert body["dirtyFields"]["category"] is True
    assert body["dirtyFields"]["madeForKids"] is False


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
            "youtube_made_for_kids": kwargs["made_for_kids"],
        }

    monkeypatch.setattr(main.yt, "update_video_metadata", fake_update)
    monkeypatch.setattr(main.quota_service, "quota_summary", lambda db: {"buckets": {"general": {"estimated_remaining": 10_000}}})
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
    assert body["snapshot"]["category"] == "22"
    assert body["snapshot"]["madeForKids"] is True
    assert captured["youtube_video_id"] == "youtube-video"
    assert captured["tags"] == ["new tag", "german"]
    assert captured["category_id"] == "22"
    assert captured["language"] == "de"
    assert captured["made_for_kids"] is True
    with test_database() as db:
        video = db.get(Video, video_id)
        assert video.title is None
        assert video.language is None
        assert video.category is None
        assert video.made_for_kids is None
        assert video.youtube_default_language == "de"
        assert video.youtube_category_id == "22"
        assert video.youtube_made_for_kids is True


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


def test_video_thumbnail_write_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database, write_mode=False)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "set_video_thumbnail", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/thumbnail",
        headers={"Origin": settings.frontend_origin, "Content-Type": "image/png"},
        content=b"png-bytes",
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "write_mode_off"


def test_video_thumbnail_write_forwards_bytes_and_updates_snapshot(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    captured = {}

    def fake_thumbnail(refresh_token, youtube_video_id, data, content_type, recorder=None):
        captured.update(
            refresh_token=refresh_token,
            youtube_video_id=youtube_video_id,
            data=data,
            content_type=content_type,
        )
        return "https://img.example/new-thumbnail.jpg"

    monkeypatch.setattr(main.yt, "set_video_thumbnail", fake_thumbnail)
    response = client.put(
        f"/channels/{channel_id}/videos/{video_id}/thumbnail",
        headers={"Origin": settings.frontend_origin, "Content-Type": "image/png"},
        content=b"png-bytes",
    )
    assert response.status_code == 200
    assert captured == {
        "refresh_token": "w4-refresh",
        "youtube_video_id": "youtube-video",
        "data": b"png-bytes",
        "content_type": "image/png",
    }
    assert response.json()["thumbnail_url"] == "https://img.example/new-thumbnail.jpg"
    with test_database() as db:
        assert db.get(Video, video_id).youtube_thumbnail_url == "https://img.example/new-thumbnail.jpg"


def test_video_captions_write_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database, write_mode=False)
    client.cookies.set(settings.session_cookie_name, token)
    monkeypatch.setattr(main.yt, "insert_video_caption", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")))
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/captions?language=de&name=test.srt",
        headers={"Origin": settings.frontend_origin, "Content-Type": "application/x-subrip"},
        content=b"caption-bytes",
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "write_mode_off"


def test_video_captions_write_forwards_payload_and_marks_available(client, test_database, monkeypatch):
    token, channel_id, video_id = _video_fixture(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    captured = {}

    def fake_caption(refresh_token, youtube_video_id, data, content_type, language, name, recorder=None):
        captured.update(
            refresh_token=refresh_token,
            youtube_video_id=youtube_video_id,
            data=data,
            content_type=content_type,
            language=language,
            name=name,
        )
        return {"id": "caption-id", "status": "serving"}

    monkeypatch.setattr(main.yt, "insert_video_caption", fake_caption)
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/captions?language=de&name=test.srt",
        headers={"Origin": settings.frontend_origin, "Content-Type": "application/x-subrip"},
        content=b"caption-bytes",
    )
    assert response.status_code == 200
    assert captured == {
        "refresh_token": "w4-refresh",
        "youtube_video_id": "youtube-video",
        "data": b"caption-bytes",
        "content_type": "application/x-subrip",
        "language": "de",
        "name": "test.srt",
    }
    assert response.json()["id"] == "caption-id"
    with test_database() as db:
        assert db.get(Video, video_id).youtube_captions_available is True
