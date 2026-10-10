from types import SimpleNamespace

from app import main, youtube
from app.models import Channel, GoogleConnection, Video
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

    def fake_summary(token, start_date, end_date, video_id="", playlist_id=""):
        called.update(
            token=token,
            start_date=start_date,
            end_date=end_date,
            video_id=video_id,
            playlist_id=playlist_id,
        )
        return {
            "views": 321,
            "estimated_minutes_watched": 1234.0,
            "average_view_duration": 92.0,
            "average_view_percentage": 31.5,
            "likes": 12,
            "comments": 3,
            "shares": 2,
            "subscribers_gained": 8,
            "subscribers_lost": 1,
            "start_date": start_date,
            "end_date": end_date,
        }

    def fake_timeseries(token, start_date, end_date, video_id="", playlist_id="", dimension="day"):
        return [{"date": start_date, "views": 321, "estimated_minutes_watched": 1234.0}]

    monkeypatch.setattr(main.yt, "channel_analytics_summary", fake_summary)
    monkeypatch.setattr(main.yt, "channel_analytics_timeseries", fake_timeseries)

    client.cookies.set(settings.session_cookie_name, other_token)
    assert client.get(f"/channels/{channel_id}/analytics/summary").status_code == 404
    assert called == {}

    client.cookies.set(settings.session_cookie_name, owner_token)
    response = client.get(f"/channels/{channel_id}/analytics/summary")
    assert response.status_code == 200
    assert response.json()["estimated_minutes_watched"] == 1234.0
    assert response.json()["views"] == 321
    assert response.json()["scope"] == "channel"
    assert response.json()["series"][0]["views"] == 321
    assert called["token"] == "analytics-token"
    assert called["start_date"] == "2020-03-04"


def test_channel_analytics_summary_requires_authentication(client):
    assert client.get("/channels/1/analytics/summary").status_code == 401


def test_channel_analytics_summary_supports_video_scope(client, test_database, monkeypatch):
    owner_id, owner_token = create_account(test_database, subject="analytics-video-owner")
    with test_database() as db:
        connection = GoogleConnection(
            user_id=owner_id,
            google_subject="analytics-video-google",
            encrypted_refresh_token=encrypt_refresh_token("analytics-video-token"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="analytics-video-channel",
            title="Analytics video channel",
            yt_published_at="2020-01-01",
        )
        db.add(channel)
        db.flush()
        video = Video(channel_id=channel.id, youtube_video_id="YT123", title="Scoped video")
        db.add(video)
        db.commit()
        channel_id = channel.id
        video_id = video.id

    called = {}

    def fake_summary(token, start_date, end_date, youtube_video_id="", playlist_id=""):
        called.update(video_id=youtube_video_id, playlist_id=playlist_id)
        return {"views": 7, "estimated_minutes_watched": 12.0}

    def fake_timeseries(token, start_date, end_date, youtube_video_id="", playlist_id="", dimension="day"):
        called.update(series_video_id=youtube_video_id, dimension=dimension)
        return []

    monkeypatch.setattr(main.yt, "channel_analytics_summary", fake_summary)
    monkeypatch.setattr(main.yt, "channel_analytics_timeseries", fake_timeseries)
    monkeypatch.setattr(main.yt, "video_current_statistics", lambda token, youtube_video_id: {"views": 11, "likes": 2, "comments": 1})
    client.cookies.set(settings.session_cookie_name, owner_token)

    response = client.get(f"/channels/{channel_id}/analytics/summary?days=28&video_id={video_id}")
    assert response.status_code == 200
    assert response.json()["scope"] == "video"
    assert response.json()["local_video_id"] == video_id
    assert called["video_id"] == "YT123"
    assert called["series_video_id"] == "YT123"
    assert response.json()["current_statistics"] == {"views": 11, "likes": 2, "comments": 1}


def test_channel_analytics_summary_supports_playlist_scope(client, test_database, monkeypatch):
    owner_id, owner_token = create_account(test_database, subject="analytics-playlist-owner")
    with test_database() as db:
        connection = GoogleConnection(
            user_id=owner_id,
            google_subject="analytics-playlist-google",
            encrypted_refresh_token=encrypt_refresh_token("analytics-playlist-token"),
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id="analytics-playlist-channel",
            title="Analytics playlist channel",
            yt_published_at="2020-01-01",
        )
        db.add(channel)
        db.commit()
        channel_id = channel.id

    called = {}

    def fake_summary(token, start_date, end_date, video_id="", playlist_id=""):
        called["playlist_id"] = playlist_id
        return {"views": 9, "estimated_minutes_watched": 20.0}

    def fake_timeseries(token, start_date, end_date, video_id="", playlist_id="", dimension="day"):
        called["series_playlist_id"] = playlist_id
        return []

    monkeypatch.setattr(main.yt, "channel_analytics_summary", fake_summary)
    monkeypatch.setattr(main.yt, "channel_analytics_timeseries", fake_timeseries)
    client.cookies.set(settings.session_cookie_name, owner_token)

    response = client.get(f"/channels/{channel_id}/analytics/summary?days=28&playlist_id=PL123")
    assert response.status_code == 200
    assert response.json()["scope"] == "playlist"
    assert response.json()["playlist_id"] == "PL123"
    assert called["playlist_id"] == "PL123"
    assert called["series_playlist_id"] == "PL123"



def test_youtube_analytics_summary_marks_empty_report_as_unavailable(monkeypatch):
    class FakeReports:
        def query(self, **kwargs):
            return SimpleNamespace(execute=lambda: {"rows": []})

    class FakeAnalytics:
        def reports(self):
            return FakeReports()

    monkeypatch.setattr(youtube, "creds_from_refresh", lambda token: object())
    monkeypatch.setattr(youtube, "build", lambda *args, **kwargs: FakeAnalytics())

    result = youtube.channel_analytics_summary(
        "token", "2026-10-10", "2026-10-10", "video-id"
    )

    assert result["has_data"] is False
    assert result["views"] == 0
    assert result["estimated_minutes_watched"] == 0


def test_youtube_analytics_summary_marks_returned_report_row_as_available(monkeypatch):
    class FakeReports:
        def query(self, **kwargs):
            return SimpleNamespace(execute=lambda: {
                "rows": [[249, 120.0, 30.0, 50.0, 4, 2, 1, 3, 0]]
            })

    class FakeAnalytics:
        def reports(self):
            return FakeReports()

    monkeypatch.setattr(youtube, "creds_from_refresh", lambda token: object())
    monkeypatch.setattr(youtube, "build", lambda *args, **kwargs: FakeAnalytics())

    result = youtube.channel_analytics_summary(
        "token", "2026-10-01", "2026-10-10", "video-id"
    )

    assert result["has_data"] is True
    assert result["views"] == 249
    assert result["estimated_minutes_watched"] == 120.0
