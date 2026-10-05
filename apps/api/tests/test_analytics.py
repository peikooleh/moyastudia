from app import main
from app.models import Channel, GoogleConnection
from app.settings import settings
from app.tokens import encrypt_refresh_token

from conftest import create_account


def test_channel_analytics_summary_is_owner_scoped(client, test_database, monkeypatch):
    owner_id, owner_token = create_account(test_database, subject="analytics-owner")
    _, other_token = create_account(test_database, subject="analytics-other")
    with test_database() as db:
        connection = GoogleConnection(
            user_id=owner_id,
            google_subject="analytics-google",
            encrypted_refresh_token=encrypt_refresh_token("analytics-token"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="analytics-channel",
            title="Analytics channel",
            yt_published_at="2020-03-04",
        )
        db.add(channel)
        db.commit()
        channel_id = channel.id

    called = {}

    def fake_summary(token, start_date, end_date):
        called.update(token=token, start_date=start_date, end_date=end_date)
        return {
            "estimated_minutes_watched": 1234.0,
            "start_date": start_date,
            "end_date": end_date,
        }

    monkeypatch.setattr(main.yt, "channel_analytics_summary", fake_summary)

    client.cookies.set(settings.session_cookie_name, other_token)
    assert client.get(f"/channels/{channel_id}/analytics/summary").status_code == 404
    assert called == {}

    client.cookies.set(settings.session_cookie_name, owner_token)
    response = client.get(f"/channels/{channel_id}/analytics/summary")
    assert response.status_code == 200
    assert response.json()["estimated_minutes_watched"] == 1234.0
    assert called["token"] == "analytics-token"
    assert called["start_date"] == "2020-03-04"


def test_channel_analytics_summary_requires_authentication(client):
    assert client.get("/channels/1/analytics/summary").status_code == 401
