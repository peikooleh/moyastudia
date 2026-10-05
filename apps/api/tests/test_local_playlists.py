from app.models import Channel, GoogleConnection, LocalPlaylist
from app.settings import settings
from app.tokens import encrypt_refresh_token

from conftest import create_account


def _channel_for_user(session_factory, user_id: str, suffix: str = "local-playlists") -> int:
    with session_factory() as db:
        connection = GoogleConnection(
            user_id=user_id,
            google_subject=f"youtube-{suffix}",
            email=f"{suffix}@example.test",
            encrypted_refresh_token=encrypt_refresh_token("token"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id=f"channel-{suffix}",
            title="Playlist channel",
        )
        db.add(channel)
        db.commit()
        return channel.id


def test_local_playlist_draft_persists_membership_and_deletes(client, test_database):
    user_id, token = create_account(test_database, subject="local-playlist-owner")
    channel_id = _channel_for_user(test_database, user_id)
    client.cookies.set(settings.session_cookie_name, token)
    headers = {"Origin": settings.frontend_origin}

    created = client.post(
        f"/channels/{channel_id}/local-playlists",
        headers=headers,
        json={"local_id": "local-test", "title": "Test"},
    )
    assert created.status_code == 200
    assert created.json() == {"id": "local-test", "title": "Test", "videoIds": []}

    updated = client.put(
        f"/channels/{channel_id}/local-playlists/local-test/membership",
        headers=headers,
        json={"video_ids": ["video-1", "video-2", "video-1"]},
    )
    assert updated.status_code == 200
    assert updated.json()["videoIds"] == ["video-1", "video-2"]

    listed = client.get(f"/channels/{channel_id}/local-playlists")
    assert listed.status_code == 200
    assert listed.json() == [{"id": "local-test", "title": "Test", "videoIds": ["video-1", "video-2"]}]

    deleted = client.delete(
        f"/channels/{channel_id}/local-playlists/local-test",
        headers=headers,
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True, "id": "local-test"}
    assert client.get(f"/channels/{channel_id}/local-playlists").json() == []


def test_local_playlist_mutations_require_same_origin(client, test_database):
    user_id, token = create_account(test_database, subject="local-playlist-origin")
    channel_id = _channel_for_user(test_database, user_id, "origin")
    client.cookies.set(settings.session_cookie_name, token)

    response = client.post(
        f"/channels/{channel_id}/local-playlists",
        json={"local_id": "local-origin", "title": "Origin"},
    )
    assert response.status_code == 403


def test_local_playlist_drafts_are_owner_scoped(client, test_database):
    owner_id, _owner_token = create_account(test_database, subject="local-owner")
    _other_id, other_token = create_account(test_database, subject="local-other")
    channel_id = _channel_for_user(test_database, owner_id, "owner")
    with test_database() as db:
        db.add(LocalPlaylist(channel_id=channel_id, local_id="local-private", title="Private", video_ids=["v1"]))
        db.commit()

    client.cookies.set(settings.session_cookie_name, other_token)
    assert client.get(f"/channels/{channel_id}/local-playlists").status_code == 404
    assert client.put(
        f"/channels/{channel_id}/local-playlists/local-private/membership",
        headers={"Origin": settings.frontend_origin},
        json={"video_ids": []},
    ).status_code == 404
    assert client.delete(
        f"/channels/{channel_id}/local-playlists/local-private",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 404

    with test_database() as db:
        assert db.query(LocalPlaylist).filter(LocalPlaylist.local_id == "local-private").count() == 1
