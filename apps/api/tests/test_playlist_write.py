from app import main, youtube
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


def test_youtube_playlist_thumbnail_insert_is_owned_and_uses_custom_image(monkeypatch):
    calls = []

    class Request:
        def __init__(self, response):
            self.response = response

        def execute(self):
            return self.response

    class Resource:
        def __init__(self, name):
            self.name = name

        def list(self, **kwargs):
            calls.append((self.name, "list", kwargs))
            if self.name == "playlists":
                return Request({"items": [{"snippet": {"channelId": "playlist-channel"}}]})
            return Request({"items": []})

        def insert(self, **kwargs):
            calls.append((self.name, "insert", kwargs))
            return Request({"id": "image-one"})

    class Service:
        def playlists(self):
            return Resource("playlists")

        def playlistImages(self):
            return Resource("playlistImages")

    monkeypatch.setattr(youtube, "service_for", lambda _token: Service())
    result = youtube.set_playlist_thumbnail(
        "refresh", "playlist-channel", "playlist-one", b"png", "image/png"
    )

    assert result == {"ok": True, "id": "image-one", "playlistId": "playlist-one"}
    image_insert = next(call for call in calls if call[0:2] == ("playlistImages", "insert"))
    assert image_insert[2]["body"] == {
        "snippet": {"playlistId": "playlist-one", "type": "custom"}
    }
    assert image_insert[2]["media_body"].mimetype() == "image/png"


def test_youtube_playlist_reorder_verifies_item_membership(monkeypatch):
    update_calls = []

    class Request:
        def __init__(self, response):
            self.response = response

        def execute(self):
            return self.response

    class Playlists:
        def list(self, **kwargs):
            return Request({"items": [{"snippet": {"channelId": "playlist-channel"}}]})

    class PlaylistItems:
        def list(self, **kwargs):
            return Request(
                {
                    "items": [
                        {
                            "id": "item-one",
                            "snippet": {
                                "playlistId": "playlist-one",
                                "resourceId": {"kind": "youtube#video", "videoId": "video-one"},
                                "position": 0,
                            },
                        }
                    ]
                }
            )

        def update(self, **kwargs):
            update_calls.append(kwargs)
            return Request({"id": "item-one", "snippet": {"position": 3}})

    class Service:
        def playlists(self):
            return Playlists()

        def playlistItems(self):
            return PlaylistItems()

    monkeypatch.setattr(youtube, "service_for", lambda _token: Service())
    result = youtube.update_playlist_item_position(
        "refresh", "playlist-channel", "playlist-one", "item-one", 3
    )

    assert result == {"id": "item-one", "position": 3}
    body = update_calls[0]["body"]
    assert body["id"] == "item-one"
    assert body["snippet"]["playlistId"] == "playlist-one"
    assert body["snippet"]["resourceId"]["videoId"] == "video-one"
    assert body["snippet"]["position"] == 3


def test_playlist_delete_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database, write_mode=False)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "delete_playlist_item",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )
    response = client.delete(
        f"/channels/{channel_id}/playlists/playlist-one/items/item-one",
        headers=_headers(),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "write_mode_off"


def test_playlist_delete_forwards_owned_item(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    captured = {}

    def fake_delete(refresh_token, youtube_channel_id, playlist_id, playlist_item_id):
        captured.update(
            refresh_token=refresh_token,
            youtube_channel_id=youtube_channel_id,
            playlist_id=playlist_id,
            playlist_item_id=playlist_item_id,
        )
        return {"ok": True, "playlistItemId": playlist_item_id}

    monkeypatch.setattr(main.yt, "delete_playlist_item", fake_delete)
    response = client.delete(
        f"/channels/{channel_id}/playlists/playlist-one/items/item-one",
        headers=_headers(),
    )
    assert response.status_code == 200
    assert response.json()["playlistItemId"] == "item-one"
    assert captured["playlist_id"] == "playlist-one"


def test_playlist_order_requires_write_mode(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database, write_mode=False)
    _authorize(client, token)
    monkeypatch.setattr(
        main.yt,
        "reorder_playlist_items",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )
    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/order",
        headers=_headers(),
        json={"playlist_item_ids": ["item-one"]},
    )
    assert response.status_code == 403


def test_playlist_order_forwards_complete_order(client, test_database, monkeypatch):
    token, channel_id = _playlist_fixture(test_database)
    _authorize(client, token)
    captured = {}

    def fake_order(refresh_token, youtube_channel_id, playlist_id, playlist_item_ids):
        captured["ids"] = playlist_item_ids
        return {"ok": True, "playlistItemIds": playlist_item_ids, "updated": 1}

    monkeypatch.setattr(main.yt, "reorder_playlist_items", fake_order)
    response = client.put(
        f"/channels/{channel_id}/playlists/playlist-one/order",
        headers=_headers(),
        json={"playlist_item_ids": ["item-two", "item-one"]},
    )
    assert response.status_code == 200
    assert captured["ids"] == ["item-two", "item-one"]


def test_youtube_playlist_thumbnail_update_existing_image(monkeypatch):
    calls = []

    class Request:
        def __init__(self, response):
            self.response = response
        def execute(self):
            return self.response

    class Resource:
        def __init__(self, name):
            self.name = name
        def list(self, **kwargs):
            calls.append((self.name, "list", kwargs))
            if self.name == "playlists":
                return Request({"items": [{"snippet": {"channelId": "playlist-channel"}}]})
            return Request({"items": [{"id": "existing-image", "snippet": {"playlistId": "playlist-one", "type": "custom"}}]})
        def update(self, **kwargs):
            calls.append((self.name, "update", kwargs))
            return Request({"id": "existing-image"})

    class Service:
        def playlists(self):
            return Resource("playlists")
        def playlistImages(self):
            return Resource("playlistImages")

    monkeypatch.setattr(youtube, "service_for", lambda _token: Service())
    result = youtube.set_playlist_thumbnail(
        "refresh", "playlist-channel", "playlist-one", b"png", "image/png"
    )
    assert result["id"] == "existing-image"
    image_update = next(call for call in calls if call[0:2] == ("playlistImages", "update"))
    assert image_update[2]["body"] == {
        "snippet": {"playlistId": "playlist-one", "type": "custom"}
    }
    assert image_update[2]["media_body"].mimetype() == "image/png"


def test_youtube_playlist_delete_verifies_membership(monkeypatch):
    deleted = []

    class Request:
        def __init__(self, response):
            self.response = response
        def execute(self):
            return self.response

    class Playlists:
        def list(self, **kwargs):
            return Request({"items": [{"snippet": {"channelId": "playlist-channel"}}]})

    class PlaylistItems:
        def list(self, **kwargs):
            return Request({"items": [{"id": "item-one", "snippet": {"playlistId": "playlist-one"}}]})
        def delete(self, **kwargs):
            deleted.append(kwargs)
            return Request({})

    class Service:
        def playlists(self):
            return Playlists()
        def playlistItems(self):
            return PlaylistItems()

    monkeypatch.setattr(youtube, "service_for", lambda _token: Service())
    result = youtube.delete_playlist_item(
        "refresh", "playlist-channel", "playlist-one", "item-one"
    )
    assert result == {"ok": True, "playlistItemId": "item-one"}
    assert deleted == [{"id": "item-one"}]


def test_youtube_playlist_reorder_reconciles_complete_order(monkeypatch):
    updates = []

    class Request:
        def __init__(self, response):
            self.response = response
        def execute(self):
            return self.response

    class Playlists:
        def list(self, **kwargs):
            return Request({"items": [{"snippet": {"channelId": "playlist-channel"}}]})

    class PlaylistItems:
        def list(self, **kwargs):
            return Request({"items": [
                {"id": "a", "snippet": {"playlistId": "playlist-one", "position": 0, "resourceId": {"kind": "youtube#video", "videoId": "va"}}},
                {"id": "b", "snippet": {"playlistId": "playlist-one", "position": 1, "resourceId": {"kind": "youtube#video", "videoId": "vb"}}},
                {"id": "c", "snippet": {"playlistId": "playlist-one", "position": 2, "resourceId": {"kind": "youtube#video", "videoId": "vc"}}},
            ]})
        def update(self, **kwargs):
            updates.append(kwargs["body"])
            return Request(kwargs["body"])

    class Service:
        def playlists(self):
            return Playlists()
        def playlistItems(self):
            return PlaylistItems()

    monkeypatch.setattr(youtube, "service_for", lambda _token: Service())
    result = youtube.reorder_playlist_items(
        "refresh", "playlist-channel", "playlist-one", ["c", "a", "b"]
    )
    assert result["playlistItemIds"] == ["c", "a", "b"]
    assert result["updated"] == 1
    assert updates[0]["id"] == "c"
    assert updates[0]["snippet"]["position"] == 0
