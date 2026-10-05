from app import main
from app.models import Channel, GoogleConnection, User
from app.settings import settings
from app.tokens import encrypt_refresh_token

from conftest import create_account


def _playlist_fixture(test_database, *, write_mode=True):
    user_id, session_token = create_account(test_database, subject="playlist-write-owner")
    with test_database() as db:
        user = db.get(User, user_id)
        user.write_mode_enabled = write_mode
        connection = GoogleConnection(
            user_id=user_id,
            google_subject="playlist-write-google",
            encrypted_refresh_token=encrypt_refresh_token("playlist-refresh"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="playlist-channel",
            title="Playlist channel",
        )
        db.add(channel)
        db.commit()
        return session_token, channel.id


def _authorize(client, token):
    client.cookies.set(settings.session_cookie_name, token)


def _headers():
    return {"Origin": settings.frontend_origin}


def test_playlist_metadata_write_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database, write_mode=False)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "update_playlist_metadata",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )

    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one",
        headers=_headers(),
        json={"title": "New title", "description": "New description", "privacy": "unlisted"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "write_mode_off"


def test_playlist_metadata_write_passes_complete_snapshot(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    captured = {}

    def fake_update(refresh_token, youtube_channel_id, playlist_id, **kwargs):
        captured.update(
            refresh_token=refresh_token,
            youtube_channel_id=youtube_channel_id,
            playlist_id=playlist_id,
            **kwargs,
        )
        return {
            "id": playlist_id,
            "title": kwargs["title"],
            "description": kwargs["description"],
            "privacy": kwargs["privacy"],
            "thumb": "",
        }

    monkeypatch.setattr(main.yt, "update_playlist_metadata", fake_update)
    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one",
        headers=_headers(),
        json={"title": "  New title  ", "description": "New description", "privacy": "unlisted"},
    )

    assert response.status_code == 200
    assert captured == {
        "refresh_token": "playlist-refresh",
        "youtube_channel_id": "playlist-channel",
        "playlist_id": "playlist-one",
        "title": "New title",
        "description": "New description",
        "privacy": "unlisted",
    }


def test_playlist_metadata_validates_limits_before_youtube(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "update_playlist_metadata",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )

    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one",
        headers=_headers(),
        json={"title": "x" * 151, "description": "", "privacy": "public"},
    )

    assert response.status_code == 422


def test_playlist_reorder_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database, write_mode=False)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "update_playlist_item_position",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )

    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/items/item-one/position",
        headers=_headers(),
        json={"position": 2},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "write_mode_off"


def test_playlist_reorder_sends_requested_position(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    captured = {}

    def fake_reorder(refresh_token, youtube_channel_id, playlist_id, playlist_item_id, position):
        captured.update(
            refresh_token=refresh_token,
            youtube_channel_id=youtube_channel_id,
            playlist_id=playlist_id,
            playlist_item_id=playlist_item_id,
            position=position,
        )
        return {"id": playlist_item_id, "position": position}

    monkeypatch.setattr(main.yt, "update_playlist_item_position", fake_reorder)
    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/items/item-one/position",
        headers=_headers(),
        json={"position": 2},
    )

    assert response.status_code == 200
    assert response.json() == {"id": "item-one", "position": 2}
    assert captured["position"] == 2
    assert captured["playlist_id"] == "playlist-one"


def test_playlist_thumbnail_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database, write_mode=False)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "set_playlist_thumbnail",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )

    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/thumbnail",
        headers={**_headers(), "Content-Type": "image/png"},
        content=b"png",
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "write_mode_off"


def test_playlist_thumbnail_validates_type_and_forwards_bytes(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    captured = {}

    def fake_thumbnail(refresh_token, youtube_channel_id, playlist_id, data, content_type):
        captured.update(
            refresh_token=refresh_token,
            youtube_channel_id=youtube_channel_id,
            playlist_id=playlist_id,
            data=data,
            content_type=content_type,
        )
        return {"ok": True, "id": "image-one", "playlistId": playlist_id}

    monkeypatch.setattr(main.yt, "set_playlist_thumbnail", fake_thumbnail)

    rejected = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/thumbnail",
        headers={**_headers(), "Content-Type": "image/gif"},
        content=b"gif",
    )
    assert rejected.status_code == 415

    accepted = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/thumbnail",
        headers={**_headers(), "Content-Type": "image/png"},
        content=b"png-data",
    )
    assert accepted.status_code == 200
    assert captured["data"] == b"png-data"
    assert captured["content_type"] == "image/png"


def test_playlist_writes_require_same_origin(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "update_playlist_metadata",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )

    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one",
        json={"title": "New title", "description": "", "privacy": "private"},
    )

    assert response.status_code == 403
