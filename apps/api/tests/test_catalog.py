from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app import main, youtube
from app.models import Channel, ChannelCatalogSync, GoogleConnection, Video
from app.settings import settings
from app.tokens import encrypt_refresh_token

from conftest import create_account


def create_channel(session_factory, user_id, suffix="one", active=True):
    with session_factory() as db:
        connection = GoogleConnection(
            user_id=user_id,
            google_subject=f"google-{suffix}",
            email=f"{suffix}@example.test",
            encrypted_refresh_token=encrypt_refresh_token("refresh-token"),
            is_active=active,
        )
        db.add(connection)
        db.flush()
        channel = Channel(
            google_connection_id=connection.id,
            youtube_channel_id=f"youtube-{suffix}",
            title=f"Channel {suffix}",
        )
        db.add(channel)
        db.commit()
        return channel.id, channel.youtube_channel_id, connection.id


def remote_video(video_id, channel_id, title=None):
    return {
        "youtube_video_id": video_id,
        "youtube_title": title or video_id,
        "youtube_description": f"Description {video_id}",
        "youtube_tags": ["first", "second"],
        "youtube_thumbnail_url": f"https://img.example.test/{video_id}.jpg",
        "youtube_category_id": "22",
        "youtube_default_language": "en",
        "youtube_default_audio_language": "en-US",
        "youtube_duration": "PT1M2S",
        "youtube_published_at": "2026-09-01T12:00:00Z",
        "youtube_scheduled_at": None,
        "youtube_visibility": "public",
        "youtube_upload_status": "processed",
        "youtube_view_count": 123,
        "youtube_like_count": 12,
        "youtube_comment_count": 3,
        "youtube_captions_available": True,
        "youtube_made_for_kids": False,
        "channel_id": channel_id,
    }


def page(channel_id, ids, next_token=None, details=None, playlist_id="uploads-playlist"):
    return {
        "uploads_playlist_id": playlist_id,
        "video_ids": ids,
        "videos": details if details is not None else [remote_video(video_id, channel_id) for video_id in ids],
        "next_page_token": next_token,
    }


def authorized_client(client, token):
    client.cookies.set(settings.session_cookie_name, token)


def post_headers():
    return {"Origin": settings.frontend_origin}


def start_sync(client, channel_id, mode="initial"):
    return client.post(
        f"/channels/{channel_id}/catalog/sync",
        json={"mode": mode},
        headers=post_headers(),
    )


def continue_sync(client, channel_id):
    return client.post(
        f"/channels/{channel_id}/catalog/sync/continue",
        headers=post_headers(),
    )


def test_list_videos_resolves_selected_channel_and_returns_one_page(monkeypatch):
    calls = []

    class FakeResource:
        def __init__(self, response):
            self.response = response

        def list(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(execute=lambda: self.response)

    class FakeService:
        def channels(self):
            return FakeResource(
                {
                    "items": [
                        {
                            "id": "selected-channel",
                            "contentDetails": {"relatedPlaylists": {"uploads": "selected-uploads"}},
                        }
                    ]
                }
            )

        def playlistItems(self):
            return FakeResource(
                {
                    "items": [{"contentDetails": {"videoId": "selected-video"}}],
                    "nextPageToken": "next-page",
                }
            )

        def videos(self):
            return FakeResource(
                {
                    "items": [
                        {
                            "id": "selected-video",
                            "snippet": {
                                "channelId": "selected-channel",
                                "title": "Selected video",
                            },
                            "status": {},
                            "contentDetails": {},
                            "statistics": {},
                        }
                    ]
                }
            )

    monkeypatch.setattr(youtube, "creds_from_refresh", lambda token: SimpleNamespace())
    monkeypatch.setattr(youtube, "build", lambda *args, **kwargs: FakeService())

    result = youtube.list_videos("token", "selected-channel", limit=50)

    assert calls[0]["id"] == "selected-channel"
    assert "mine" not in calls[0]
    assert calls[1]["playlistId"] == "selected-uploads"
    assert calls[1]["maxResults"] == 50
    assert result["next_page_token"] == "next-page"
    assert result["videos"][0]["youtube_video_id"] == "selected-video"


@pytest.mark.parametrize(
    ("video_count", "next_token", "expected_state"),
    [
        (0, None, "EMPTY"),
        (1, None, "COMPLETE"),
        (50, None, "COMPLETE"),
        (51, "second-page", "PARTIAL"),
    ],
)
def test_initial_sync_processes_bounded_pages(
    client, test_database, monkeypatch, video_count, next_token, expected_state
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    video_ids = [f"video-{index}" for index in range(video_count)]
    page_calls = []

    def list_page(refresh_token, selected_id, **kwargs):
        page_calls.append((selected_id, kwargs.get("page_token"), kwargs.get("limit")))
        ids = video_ids if next_token is None else video_ids[:50]
        return page(selected_id, ids, next_token=next_token)

    monkeypatch.setattr(main.yt, "list_videos", list_page)
    assert start_sync(client, channel_id).status_code == 200
    response = continue_sync(client, channel_id)

    assert response.status_code == 200
    assert response.json()["state"] == expected_state
    assert page_calls == [(youtube_channel_id, None, 50)]
    with test_database() as db:
        assert db.query(Video).filter(Video.channel_id == channel_id).count() == min(video_count, 50)


def test_initial_sync_resumes_saved_page_cursor(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    calls = []

    def list_page(refresh_token, selected_id, page_token=None, **kwargs):
        calls.append((selected_id, page_token, kwargs.get("uploads_playlist_id"), kwargs.get("limit")))
        if page_token is None:
            return page(selected_id, ["video-one"], next_token="saved-cursor")
        return page(selected_id, ["video-two"])

    monkeypatch.setattr(main.yt, "list_videos", list_page)
    assert start_sync(client, channel_id).status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "PARTIAL"
    with test_database() as db:
        sync = db.get(ChannelCatalogSync, channel_id)
        assert sync.next_page_token == "saved-cursor"
        assert sync.uploads_playlist_id == "uploads-playlist"
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"

    assert calls == [
        (youtube_channel_id, None, None, 50),
        (youtube_channel_id, "saved-cursor", "uploads-playlist", 50),
    ]
    with test_database() as db:
        assert db.query(Video).filter(Video.channel_id == channel_id).count() == 2


def test_reconcile_is_upserted_and_repeat_sync_does_not_duplicate(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    monkeypatch.setattr(
        main.yt,
        "list_videos",
        lambda refresh_token, selected_id, **kwargs: page(
            selected_id, ["same-video"], details=[remote_video("same-video", selected_id)]
        ),
    )

    assert start_sync(client, channel_id, "reconcile").status_code == 200
    first_reconcile = continue_sync(client, channel_id)
    assert first_reconcile.status_code == 200, first_reconcile.text
    assert first_reconcile.json()["state"] == "COMPLETE"
    assert start_sync(client, channel_id, "reconcile").status_code == 200
    repeated_reconcile = continue_sync(client, channel_id)
    assert repeated_reconcile.status_code == 200, repeated_reconcile.text
    assert repeated_reconcile.json()["state"] == "COMPLETE"

    with test_database() as db:
        rows = db.query(Video).filter(Video.channel_id == channel_id).all()
        assert len(rows) == 1
        assert rows[0].youtube_video_id == "same-video"
        assert rows[0].internal_status is None
        assert rows[0].title == ""
        assert rows[0].youtube_title == "same-video"


def test_incremental_sync_stops_after_known_video_overlap(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add(
            Video(
                channel_id=channel_id,
                youtube_video_id="known-video",
                internal_status=None,
                youtube_title="Known",
            )
        )
        db.commit()
    calls = []

    def list_page(refresh_token, selected_id, **kwargs):
        calls.append(kwargs.get("page_token"))
        return page(selected_id, ["new-video", "known-video"], next_token="more")

    monkeypatch.setattr(main.yt, "list_videos", list_page)
    assert start_sync(client, channel_id, "incremental").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"

    assert calls == [None]
    with test_database() as db:
        assert db.query(Video).filter(Video.channel_id == channel_id).count() == 2


def test_failed_partial_reconcile_keeps_cache_and_marks_stale(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(channel_id=channel_id, youtube_video_id="keep-one", internal_status=None),
                Video(channel_id=channel_id, youtube_video_id="keep-two", internal_status=None),
            ]
        )
        db.commit()
    calls = 0

    def list_page(refresh_token, selected_id, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return page(selected_id, ["keep-one"], next_token="second-page")
        error = RuntimeError("quota limit")
        error.resp = SimpleNamespace(status=403)
        error.error_details = [{"reason": "quotaExceeded"}]
        raise error

    monkeypatch.setattr(main.yt, "list_videos", list_page)
    assert start_sync(client, channel_id, "reconcile").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "PARTIAL"
    assert continue_sync(client, channel_id).status_code == 502

    with test_database() as db:
        assert db.query(Video).filter(Video.channel_id == channel_id).count() == 2
        sync = db.get(ChannelCatalogSync, channel_id)
        assert sync.state == "STALE"
        assert sync.last_error_code == "quota_exceeded"
        assert sync.next_page_token == "second-page"


def test_successful_reconcile_deletes_only_absent_videos(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(channel_id=channel_id, youtube_video_id="present", internal_status=None),
                Video(channel_id=channel_id, youtube_video_id="deleted", internal_status=None),
            ]
        )
        db.commit()
    monkeypatch.setattr(
        main.yt,
        "list_videos",
        lambda refresh_token, selected_id, **kwargs: page(selected_id, ["present"]),
    )
    assert start_sync(client, channel_id, "reconcile").status_code == 200
    response = continue_sync(client, channel_id)
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "COMPLETE"

    with test_database() as db:
        assert [
            video.youtube_video_id for video in db.query(Video).filter_by(channel_id=channel_id)
        ] == ["present"]


def test_missing_video_details_mark_unavailable_not_deleted(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    monkeypatch.setattr(
        main.yt,
        "list_videos",
        lambda refresh_token, selected_id, **kwargs: page(
            selected_id, ["hidden-video"], details=[]
        ),
    )

    assert start_sync(client, channel_id).status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"
    with test_database() as db:
        video = db.query(Video).filter_by(channel_id=channel_id).one()
        assert video.youtube_video_id == "hidden-video"
        assert video.availability_status == "unavailable"


def test_continue_rejects_concurrent_page_lease(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add(
            ChannelCatalogSync(
                channel_id=channel_id,
                state="LOADING",
                mode="initial",
                lease_token="active-lease",
                lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=1),
            )
        )
        db.commit()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("a second sync page must not call YouTube")

    monkeypatch.setattr(main.yt, "list_videos", fail_if_called)
    response = continue_sync(client, channel_id)
    assert response.status_code == 409


def test_foreign_channel_and_inactive_connection_rules(client, test_database, monkeypatch):
    owner_id, _ = create_account(test_database, subject="catalog-owner")
    other_id, other_token = create_account(test_database, subject="catalog-other")
    foreign_channel_id, _, _ = create_channel(test_database, owner_id, "foreign")
    inactive_channel_id, _, _ = create_channel(test_database, other_id, "inactive", active=False)
    authorized_client(client, other_token)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("ownership and active-connection checks precede YouTube calls")

    monkeypatch.setattr(main.yt, "list_videos", fail_if_called)
    assert client.get(f"/channels/{foreign_channel_id}/videos").status_code == 404
    assert client.get(f"/channels/{foreign_channel_id}/catalog/status").status_code == 404
    assert start_sync(client, foreign_channel_id).status_code == 404
    assert client.get(f"/channels/{inactive_channel_id}/videos").status_code == 200
    assert client.get(f"/channels/{inactive_channel_id}/catalog/status").status_code == 200
    assert start_sync(client, inactive_channel_id).status_code == 400


def test_video_cache_endpoint_paginates_and_never_calls_youtube(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    other_channel_id, _, _ = create_channel(test_database, user_id, "other")
    authorized_client(client, token)
    with test_database() as db:
        for channel, video_id in (
            (channel_id, "newer"),
            (channel_id, "older"),
            (other_channel_id, "foreign-video"),
        ):
            db.add(
                Video(
                    channel_id=channel,
                    youtube_video_id=video_id,
                    internal_status=None,
                    youtube_title=video_id,
                    youtube_published_at=datetime.fromisoformat(
                        "2026-09-02T00:00:00+00:00"
                        if video_id == "newer"
                        else "2026-09-01T00:00:00+00:00"
                    ),
                    youtube_visibility="public",
                )
            )
        db.commit()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("GET /videos must read local cache only")

    monkeypatch.setattr(main.yt, "list_videos", fail_if_called)
    first = client.get(f"/channels/{channel_id}/videos?limit=1")
    second = client.get(
        f"/channels/{channel_id}/videos?limit=1&cursor={first.json()['next_cursor']}"
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["items"][0]["youtubeId"] == "newer"
    assert second.json()["items"][0]["youtubeId"] == "older"
    assert first.json()["total"] == 2
    assert "foreign-video" not in str(first.json())


def test_video_cache_filters_and_sorts_on_server(client, test_database):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(
                    channel_id=channel_id,
                    youtube_video_id="title-b",
                    internal_status=None,
                    youtube_title="Beta",
                    youtube_description="Needle in description",
                    youtube_visibility="public",
                        availability_status="available",
                    youtube_published_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
                ),
                Video(
                    channel_id=channel_id,
                    youtube_video_id="title-a",
                    internal_status=None,
                    youtube_title="Alpha",
                    youtube_visibility="private",
                        availability_status="available",
                    youtube_scheduled_at=datetime(2026, 10, 10, tzinfo=timezone.utc),
                    youtube_published_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
                ),
                Video(
                    channel_id=channel_id,
                    youtube_video_id="unavailable-video",
                    internal_status=None,
                    youtube_title="Unavailable",
                    youtube_visibility="public",
                    availability_status="unavailable",
                ),
            ]
        )
        db.commit()

    first = client.get(f"/channels/{channel_id}/videos?sort=title&limit=1")
    second = client.get(
        f"/channels/{channel_id}/videos?sort=title&limit=1&cursor={first.json()['next_cursor']}"
    )
    by_description = client.get(f"/channels/{channel_id}/videos?q=Needle")
    by_date_range = client.get(
        f"/channels/{channel_id}/videos?date_from=2026-10-09T00:00:00Z&date_to=2026-10-11T00:00:00Z"
    )
    public = client.get(f"/channels/{channel_id}/videos?visibility=public")
    unavailable = client.get(f"/channels/{channel_id}/videos?visibility=unavailable")

    assert [item["title"] for item in first.json()["items"]] == ["Alpha"]
    assert [item["title"] for item in second.json()["items"]] == ["Beta"]
    assert [item["youtubeId"] for item in by_description.json()["items"]] == ["title-b"]
    assert [item["youtubeId"] for item in by_date_range.json()["items"]] == ["title-a"]
    assert [item["youtubeId"] for item in public.json()["items"]] == ["title-b"]
    assert unavailable.json()["items"][0]["status"] == "unavailable"