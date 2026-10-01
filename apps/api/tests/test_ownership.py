from app import main
from app.models import Channel, GoogleConnection
from app.settings import settings
from app.tokens import encrypt_refresh_token

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

    client.cookies.set(settings.session_cookie_name, owner_token)
    assert client.get("/channels").json()[0]["youtube_channel_id"] == "owned-channel"
    assert client.delete(
        f"/channels/{channel_id}",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 409


def test_channel_routes_require_authentication(client):
    assert client.get("/channels").status_code == 401
    assert client.get("/channels/1/videos").status_code == 401