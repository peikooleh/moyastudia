from app import main
from app.models import Channel, ChannelCatalogSync, GoogleConnection, Video
from app.settings import settings
from app.tokens import decrypt_refresh_token, encrypt_refresh_token

from conftest import create_account


def test_channel_endpoints_are_scoped_to_session_owner(
    client, test_database, monkeypatch
):
    owner_id, owner_token = create_account(test_database, subject="owner")
    other_id, other_token = create_account(test_database, subject="other")
    with test_database() as db:
        connection = GoogleConnection(
            user_id=owner_id,
            google_subject="youtube-account",
            email="channel@example.test",
            encrypted_refresh_token=encrypt_refresh_token("token"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="owned-channel",
            title="Owned channel",
        )
        db.add(channel)
        db.commit()
        channel_id = channel.id

    def fail_if_called(*args, **kwargs):
        raise AssertionError("a foreign channel must be rejected before contacting YouTube")

    monkeypatch.setattr(main.yt, "list_videos", fail_if_called)
    monkeypatch.setattr(main.yt, "list_playlists", fail_if_called)
    client.cookies.set(settings.session_cookie_name, other_token)
    assert client.get("/channels").json() == []
    assert client.get(f"/channels/{channel_id}/videos").status_code == 404
    assert client.get(f"/channels/{channel_id}/playlists").status_code == 404
    assert client.post(
        f"/channels/{channel_id}/refresh-profile",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 404
    assert client.delete(
        f"/channels/{channel_id}",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 404
    with test_database() as db:
        assert db.get(Channel, channel_id) is not None

    client.cookies.set(settings.session_cookie_name, owner_token)
    assert client.get("/channels").json()[0]["youtube_channel_id"] == "owned-channel"
    assert client.delete(
        f"/channels/{channel_id}",
        headers={"Origin": "https://attacker.test"},
    ).status_code == 403
    assert client.delete(
        f"/channels/{channel_id}",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 200
    with test_database() as db:
        assert db.get(Channel, channel_id) is None


def test_channel_working_language_persists_and_is_owner_scoped(client, test_database):
    owner_id, owner_token = create_account(test_database, subject="language-owner")
    _, other_token = create_account(test_database, subject="language-other")
    with test_database() as db:
        connection = GoogleConnection(
            user_id=owner_id,
            google_subject="language-youtube-account",
            encrypted_refresh_token=encrypt_refresh_token("token"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="language-channel",
            title="Language channel",
        )
        db.add(channel)
        db.commit()
        channel_id = channel.id

    client.cookies.set(settings.session_cookie_name, other_token)
    assert client.put(
        f"/channels/{channel_id}/working-language",
        json={"language": "de"},
        headers={"Origin": settings.frontend_origin},
    ).status_code == 404

    client.cookies.set(settings.session_cookie_name, owner_token)
    response = client.put(
        f"/channels/{channel_id}/working-language",
        json={"language": "de"},
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 200
    assert response.json() == {"id": channel_id, "working_language": "de"}
    assert client.get("/channels").json()[0]["working_language"] == "de"

    assert client.put(
        f"/channels/{channel_id}/working-language",
        json={"language": "invalid"},
        headers={"Origin": settings.frontend_origin},
    ).status_code == 422


def test_channel_routes_require_authentication(client):
    assert client.get("/channels").status_code == 401
    assert client.get("/channels/1/videos").status_code == 401
    assert client.delete(
        "/channels/1",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 401


def test_removing_one_channel_cascades_local_data_only_for_that_channel(
    client, test_database
):
    user_id, session_token = create_account(test_database, subject="shared-connection-owner")
    refresh_token = "test-refresh-token"
    with test_database() as db:
        connection = GoogleConnection(
            user_id=user_id,
            google_subject="shared-youtube-account",
            email="shared@example.test",
            encrypted_refresh_token=encrypt_refresh_token(refresh_token),
        )
        db.add(connection)
        db.flush()
        selected_channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="remove-this-channel",
            title="Remove this channel",
        )
        sibling_channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="keep-this-channel",
            title="Keep this channel",
        )
        db.add_all([selected_channel, sibling_channel])
        db.flush()
        selected_channel_id = selected_channel.id
        sibling_channel_id = sibling_channel.id
        db.add_all(
            [
                Video(
                    channel_id=selected_channel_id,
                    youtube_video_id="remove-video",
                    youtube_title="YouTube snapshot",
                    title="Local working title",
                    working_base_title="Original title",
                    working_revision=4,
                    working_ready=True,
                ),
                Video(
                    channel_id=sibling_channel_id,
                    youtube_video_id="keep-video",
                    youtube_title="Sibling snapshot",
                    title="Sibling working title",
                    working_ready=True,
                ),
                ChannelCatalogSync(
                    channel_id=selected_channel_id,
                    state="COMPLETE",
                    mode="initial",
                    scanned_count=1,
                    uploads_playlist_id="remove-uploads",
                    next_page_token="remove-cursor",
                    lease_token="remove-lease",
                ),
                ChannelCatalogSync(
                    channel_id=sibling_channel_id,
                    state="COMPLETE",
                    mode="initial",
                    scanned_count=1,
                    uploads_playlist_id="keep-uploads",
                ),
            ]
        )
        db.commit()
        connection_id = connection.id
        encrypted_token = connection.encrypted_refresh_token

    client.cookies.set(settings.session_cookie_name, session_token)
    response = client.delete(
        f"/channels/{selected_channel_id}",
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert client.get("/auth/session").json()["authenticated"] is True
    assert client.get(f"/channels/{sibling_channel_id}/catalog/status").status_code == 200
    with test_database() as db:
        assert db.get(Channel, selected_channel_id) is None
        assert db.query(Video).filter_by(youtube_video_id="remove-video").one_or_none() is None
        assert db.query(ChannelCatalogSync).filter_by(
            channel_id=selected_channel_id
        ).one_or_none() is None
        sibling_video = db.query(Video).filter_by(youtube_video_id="keep-video").one()
        assert sibling_video.title == "Sibling working title"
        assert sibling_video.working_ready is True
        sibling_sync = db.get(ChannelCatalogSync, sibling_channel_id)
        assert sibling_sync is not None
        connection = db.get(GoogleConnection, connection_id)
        assert connection is not None
        assert connection.encrypted_refresh_token == encrypted_token
        assert decrypt_refresh_token(connection.encrypted_refresh_token) == refresh_token


def test_removed_channel_can_be_reselected_with_a_clean_catalog(
    client, test_database, monkeypatch
):
    user_id, session_token = create_account(test_database, subject="reselection-owner")
    refresh_token = "reselection-refresh-token"
    with test_database() as db:
        connection = GoogleConnection(
            user_id=user_id,
            google_subject="reselection-google-account",
            email="reselection@example.test",
            encrypted_refresh_token=encrypt_refresh_token(refresh_token),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="reselected-youtube-channel",
            title="Original local channel",
        )
        db.add(channel)
        db.flush()
        channel_id = channel.id
        connection_id = connection.id
        db.add(
            Video(
                channel_id=channel_id,
                youtube_video_id="old-video",
                youtube_title="Old snapshot",
                title="Old local working title",
                working_base_title="Base title",
                working_revision=3,
                working_ready=True,
            )
        )
        db.add(
            ChannelCatalogSync(
                channel_id=channel_id,
                state="COMPLETE",
                mode="initial",
                scanned_count=1,
            )
        )
        db.commit()

    client.cookies.set(settings.session_cookie_name, session_token)
    removed = client.delete(
        f"/channels/{channel_id}",
        headers={"Origin": settings.frontend_origin},
    )
    assert removed.status_code == 200

    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda token: object())
    monkeypatch.setattr(
        main.yt,
        "list_available_channels",
        lambda credentials: [
            {
                "youtube_channel_id": "reselected-youtube-channel",
                "title": "Reconnected channel",
                "thumbnail_url": "",
                "banner_url": "",
                "description": "",
                "yt_published_at": "",
                "subscriber_count": 0,
            }
        ],
    )
    selected = client.post(
        f"/google-connections/{connection_id}/channels",
        json={"youtube_channel_ids": ["reselected-youtube-channel"]},
        headers={"Origin": settings.frontend_origin},
    )

    assert selected.status_code == 200
    new_channel_id = selected.json()["channels"][0]["id"]
    with test_database() as db:
        assert db.query(Channel).count() == 1
        assert db.get(Channel, new_channel_id).youtube_channel_id == (
            "reselected-youtube-channel"
        )
        assert db.query(Video).count() == 0
        assert db.query(ChannelCatalogSync).count() == 0
        connection = db.get(GoogleConnection, connection_id)
        assert connection is not None
        assert decrypt_refresh_token(connection.encrypted_refresh_token) == refresh_token

    assert client.get(
        f"/channels/{new_channel_id}/catalog/status"
    ).json()["state"] == "NOT_IMPORTED"
    sync = client.post(
        f"/channels/{new_channel_id}/catalog/sync",
        json={"mode": "initial"},
        headers={"Origin": settings.frontend_origin},
    )
    assert sync.status_code == 200
    assert sync.json()["state"] == "LOADING"