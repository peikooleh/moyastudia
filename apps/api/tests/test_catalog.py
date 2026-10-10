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




def test_channel_metadata_write_requires_write_mode(client, test_database, monkeypatch):
    user_id, token = create_account(test_database, subject="channel-metadata-write-mode")
    channel_id, _, _ = create_channel(test_database, user_id, "channel-metadata-write-mode")
    authorized_client(client, token)
    monkeypatch.setattr(
        main.yt,
        "update_channel_metadata",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not call YouTube")),
    )

    response = client.put(
        f"/channels/{channel_id}/metadata",
        headers=post_headers(),
        json={"description": "New description", "keywords": "one two"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "write_mode_off"


def test_channel_metadata_write_updates_youtube_and_persists_description(client, test_database, monkeypatch):
    user_id, token = create_account(test_database, subject="channel-metadata-owner")
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id, "channel-metadata")
    with test_database() as db:
        db.get(main.User, user_id).write_mode_enabled = True
        db.commit()
    authorized_client(client, token)
    captured = {}

    def fake_update(refresh_token, remote_channel_id, *, description, keywords, recorder=None):
        captured.update(
            refresh_token=refresh_token,
            remote_channel_id=remote_channel_id,
            description=description,
            keywords=keywords,
        )
        return {"description": description, "keywords": keywords}

    monkeypatch.setattr(main.yt, "update_channel_metadata", fake_update)

    response = client.put(
        f"/channels/{channel_id}/metadata",
        headers=post_headers(),
        json={"description": "New description", "keywords": "one two"},
    )

    assert response.status_code == 200
    assert captured == {
        "refresh_token": "refresh-token",
        "remote_channel_id": youtube_channel_id,
        "description": "New description",
        "keywords": "one two",
    }
    assert response.json()["description"] == "New description"
    assert response.json()["keywords"] == "one two"
    with test_database() as db:
        assert db.get(Channel, channel_id).description == "New description"


def test_detach_channel_is_owner_scoped_and_removes_local_channel(client, test_database):
    owner_id, owner_token = create_account(test_database, subject="detach-channel-owner")
    _, other_token = create_account(test_database, subject="detach-channel-other")
    channel_id, _, _ = create_channel(test_database, owner_id, "detach-channel")

    authorized_client(client, other_token)
    foreign = client.delete(f"/channels/{channel_id}", headers=post_headers())
    assert foreign.status_code == 404

    authorized_client(client, owner_token)
    response = client.delete(f"/channels/{channel_id}", headers=post_headers())
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    with test_database() as db:
        assert db.get(Channel, channel_id) is None


def test_local_playlist_persists_membership_and_delete_without_active_google_connection(client, test_database):
    user_id, token = create_account(test_database, subject="local-playlist-owner")
    channel_id, _, _ = create_channel(test_database, user_id, "local-playlist", active=False)
    authorized_client(client, token)

    created = client.post(
        f"/channels/{channel_id}/local-playlists",
        headers=post_headers(),
        json={"local_id": "local-test", "title": "Local test"},
    )
    assert created.status_code == 200
    assert created.json()["videoIds"] == []

    updated = client.put(
        f"/channels/{channel_id}/local-playlists/local-test/membership",
        headers=post_headers(),
        json={"video_ids": ["YT1", "YT2", "YT1"]},
    )
    assert updated.status_code == 200
    assert updated.json()["videoIds"] == ["YT1", "YT2"]

    reloaded = client.get(f"/channels/{channel_id}/local-playlists")
    assert reloaded.status_code == 200
    assert reloaded.json() == [{"id": "local-test", "title": "Local test", "videoIds": ["YT1", "YT2"]}]

    deleted = client.delete(
        f"/channels/{channel_id}/local-playlists/local-test",
        headers=post_headers(),
    )
    assert deleted.status_code == 200
    assert client.get(f"/channels/{channel_id}/local-playlists").json() == []


def test_local_playlist_routes_are_owner_scoped(client, test_database):
    owner_id, owner_token = create_account(test_database, subject="local-playlist-scope-owner")
    _, other_token = create_account(test_database, subject="local-playlist-scope-other")
    channel_id, _, _ = create_channel(test_database, owner_id, "local-playlist-scope")

    authorized_client(client, owner_token)
    assert client.post(
        f"/channels/{channel_id}/local-playlists",
        headers=post_headers(),
        json={"local_id": "local-private", "title": "Private local"},
    ).status_code == 200

    authorized_client(client, other_token)
    assert client.get(f"/channels/{channel_id}/local-playlists").status_code == 404
    assert client.put(
        f"/channels/{channel_id}/local-playlists/local-private/membership",
        headers=post_headers(),
        json={"video_ids": ["YT1"]},
    ).status_code == 404
    assert client.delete(
        f"/channels/{channel_id}/local-playlists/local-private",
        headers=post_headers(),
    ).status_code == 404


def test_channel_working_language_persists_without_active_google_connection(client, test_database):
    user_id, token = create_account(test_database, subject="language-offline-owner")
    channel_id, _, _ = create_channel(test_database, user_id, "language-offline", active=False)
    authorized_client(client, token)

    response = client.put(
        f"/channels/{channel_id}/working-language",
        headers=post_headers(),
        json={"language": "de"},
    )

    assert response.status_code == 200
    assert response.json()["working_language"] == "de"
    with test_database() as db:
        assert db.get(Channel, channel_id).working_language == "de"

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


def test_channel_list_includes_only_local_catalog_video_count(client, test_database):
    user_id, token = create_account(test_database, subject="channel-count-owner")
    channel_id, _, _ = create_channel(test_database, user_id, "channel-count")
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(channel_id=channel_id, youtube_video_id="catalog-one"),
                Video(channel_id=channel_id, youtube_video_id="catalog-two"),
                Video(channel_id=channel_id, youtube_video_id=None, title="Local-only"),
            ]
        )
        db.commit()

    response = client.get("/channels")

    assert response.status_code == 200
    assert response.json()[0]["catalog_video_count"] == 2
    assert response.json()[0]["hidden_subscribers"] is None


def test_refresh_profile_returns_youtube_video_count_and_hidden_subscribers(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database, subject="channel-profile-owner")
    channel_id, _, _ = create_channel(test_database, user_id, "channel-profile")
    authorized_client(client, token)
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda refresh_token: object())
    monkeypatch.setattr(
        main.yt,
        "fetch_channel",
        lambda credentials, youtube_channel_id: {
            "youtube_channel_id": youtube_channel_id,
            "title": "Channel profile",
            "thumbnail_url": "",
            "banner_url": "",
            "description": "",
            "yt_published_at": "",
            "subscriber_count": 0,
            "video_count": 37,
            "hidden_subscribers": True,
        },
    )

    response = client.post(
        f"/channels/{channel_id}/refresh-profile",
        headers=post_headers(),
    )

    assert response.status_code == 200
    assert response.json()["video_count"] == 37
    assert response.json()["subscriber_count"] == 0
    assert response.json()["hidden_subscribers"] is True


def test_refresh_profile_persists_cleared_channel_description(client, test_database, monkeypatch):
    user_id, token = create_account(test_database, subject="refresh-cleared-description")
    channel_id, _, _ = create_channel(test_database, user_id, "refresh-cleared-description")
    with test_database() as db:
        channel = db.get(Channel, channel_id)
        channel.description = "Old description"
        db.commit()
    authorized_client(client, token)
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda token: object())
    monkeypatch.setattr(
        main.yt,
        "fetch_channel",
        lambda credentials, youtube_channel_id: {
            "youtube_channel_id": youtube_channel_id,
            "title": "Channel refresh-cleared-description",
            "description": "",
            "keywords": "",
            "subscriber_count": 0,
            "video_count": 0,
            "hidden_subscribers": False,
        },
    )

    response = client.post(
        f"/channels/{channel_id}/refresh-profile",
        headers=post_headers(),
    )

    assert response.status_code == 200
    assert response.json()["description"] == ""
    with test_database() as db:
        assert db.get(Channel, channel_id).description == ""


def test_refresh_profile_rejects_channel_missing_on_youtube(client, test_database, monkeypatch):
    user_id, token = create_account(test_database, subject="refresh-missing-channel")
    channel_id, _, _ = create_channel(test_database, user_id, "refresh-missing-channel")
    authorized_client(client, token)
    monkeypatch.setattr(main.yt, "creds_from_refresh", lambda token: object())
    monkeypatch.setattr(
        main.yt,
        "fetch_channel",
        lambda credentials, youtube_channel_id: {
            "youtube_channel_id": "",
            "title": "",
            "description": "",
            "subscriber_count": 0,
            "video_count": 0,
            "hidden_subscribers": False,
        },
    )

    response = client.post(
        f"/channels/{channel_id}/refresh-profile",
        headers=post_headers(),
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "channel_not_found_on_youtube"


def test_catalog_search_sort_and_cursor_use_effective_title(client, test_database):
    user_id, token = create_account(test_database, subject="effective-catalog-owner")
    channel_id, _, _ = create_channel(test_database, user_id, "effective-catalog")
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(
                    channel_id=channel_id,
                    youtube_video_id="snapshot-zebra",
                    youtube_title="Snapshot title",
                    youtube_description="Snapshot description",
                    title="Effective zebra",
                    description="Current description",
                ),
                Video(
                    channel_id=channel_id,
                    youtube_video_id="effective-alpha",
                    youtube_title="Effective alpha",
                ),
                Video(
                    channel_id=channel_id,
                    youtube_video_id="effective-beta",
                    youtube_title="Effective beta",
                ),
            ]
        )
        db.commit()

    base_url = f"/channels/{channel_id}/videos"
    by_effective_title = client.get(base_url, params={"sort": "title", "limit": 1})
    assert by_effective_title.status_code == 200
    assert by_effective_title.json()["items"][0]["effectiveTitle"] == "Effective alpha"
    cursor = by_effective_title.json()["next_cursor"]
    second_page = client.get(
        base_url,
        params={"sort": "title", "limit": 1, "cursor": cursor},
    )
    assert second_page.json()["items"][0]["effectiveTitle"] == "Effective beta"
    third_page = client.get(
        base_url,
        params={"sort": "title", "limit": 1, "cursor": second_page.json()["next_cursor"]},
    )
    assert third_page.json()["items"][0]["effectiveTitle"] == "Effective zebra"

    assert client.get(base_url, params={"q": "Effective zebra"}).json()["total"] == 1
    assert client.get(base_url, params={"q": "Current description"}).json()["total"] == 1
    assert client.get(base_url, params={"q": "Snapshot title"}).json()["total"] == 0
    assert client.get(base_url, params={"q": "Snapshot description"}).json()["total"] == 0


def test_catalog_rows_include_dirty_state_for_every_video(client, test_database):
    user_id, token = create_account(test_database, subject="dirty-catalog-owner")
    channel_id, _, _ = create_channel(test_database, user_id, "dirty-catalog")
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(
                    channel_id=channel_id,
                    youtube_video_id="locally-edited",
                    youtube_title="Snapshot",
                    title="Local title",
                ),
                Video(
                    channel_id=channel_id,
                    youtube_video_id="unchanged",
                    youtube_title="Unchanged",
                    working_ready=True,
                ),
            ]
        )
        db.commit()

    response = client.get(f"/channels/{channel_id}/videos")
    assert response.status_code == 200
    items = {item["youtubeId"]: item for item in response.json()["items"]}
    assert items["locally-edited"]["dirty"] is True
    assert items["locally-edited"]["dirtyFields"] == {
        "title": True,
        "description": False,
        "tags": False,
        "language": False,
        "category": False,
        "madeForKids": False,
    }
    assert items["unchanged"]["dirty"] is False
    assert items["unchanged"]["dirtyFields"] == {
        "title": False,
        "description": False,
        "tags": False,
        "language": False,
        "category": False,
        "madeForKids": False,
    }


def test_list_videos_discovers_complete_owned_video_page(monkeypatch):
    calls = []

    class FakeResource:
        def __init__(self, name, response):
            self.name = name
            self.response = response

        def list(self, **kwargs):
            calls.append((self.name, kwargs))
            return SimpleNamespace(execute=lambda: self.response)

    class FakeService:
        def channels(self):
            return FakeResource(
                "channels",
                {
                    "items": [
                        {
                            "contentDetails": {
                                "relatedPlaylists": {"uploads": "uploads-playlist"}
                            }
                        }
                    ]
                },
            )

        def playlistItems(self):
            return FakeResource(
                "playlistItems",
                {
                    "items": [
                        {"contentDetails": {"videoId": "selected-video"}}
                    ],
                    "nextPageToken": "next-page",
                },
            )

        def videos(self):
            return FakeResource(
                "videos",
                {
                    "items": [
                        {
                            "id": "selected-video",
                            "snippet": {
                                "channelId": "selected-channel",
                                "title": "Selected video",
                            },
                            "status": {"privacyStatus": "private", "publishAt": "2026-10-07T05:00:00Z"},
                            "contentDetails": {},
                            "statistics": {},
                        }
                    ]
                },
            )

    monkeypatch.setattr(youtube, "creds_from_refresh", lambda token: SimpleNamespace())
    monkeypatch.setattr(youtube, "build", lambda *args, **kwargs: FakeService())

    result = youtube.list_videos("token", "selected-channel", limit=50)

    assert calls[0] == (
        "channels",
        {"part": "contentDetails", "id": "selected-channel", "maxResults": 1},
    )
    assert calls[1] == (
        "playlistItems",
        {"part": "contentDetails", "playlistId": "uploads-playlist", "maxResults": 50},
    )
    assert calls[2][0] == "videos"
    assert calls[2][1]["id"] == "selected-video"
    assert result["next_page_token"] == "next-page"
    assert result["uploads_playlist_id"] == "uploads-playlist"
    assert result["videos"][0]["youtube_video_id"] == "selected-video"
    assert result["videos"][0]["youtube_scheduled_at"] == "2026-10-07T05:00:00Z"


def test_list_videos_reuses_known_uploads_playlist_without_channel_lookup(monkeypatch):
    calls = []

    class FakeResource:
        def __init__(self, name, response):
            self.name = name
            self.response = response

        def list(self, **kwargs):
            calls.append((self.name, kwargs))
            return SimpleNamespace(execute=lambda: self.response)

    class FakeService:
        def channels(self):
            raise AssertionError("known uploads playlist must avoid channels.list")

        def playlistItems(self):
            return FakeResource(
                "playlistItems",
                {"items": [], "nextPageToken": None},
            )

        def videos(self):
            raise AssertionError("empty upload page must avoid videos.list")

    monkeypatch.setattr(youtube, "creds_from_refresh", lambda token: SimpleNamespace())
    monkeypatch.setattr(youtube, "build", lambda *args, **kwargs: FakeService())

    result = youtube.list_videos(
        "token",
        "selected-channel",
        uploads_playlist_id="known-uploads",
        limit=25,
    )

    assert calls == [
        (
            "playlistItems",
            {"part": "contentDetails", "playlistId": "known-uploads", "maxResults": 25},
        )
    ]
    assert result["uploads_playlist_id"] == "known-uploads"
    assert result["video_ids"] == []
    assert result["videos"] == []


def test_channel_playlists_are_scoped_to_selected_channel(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    calls = []
    responses = [
        {
            "items": [
                {
                    "id": "selected-playlist",
                    "snippet": {
                        "channelId": youtube_channel_id,
                        "title": "Selected",
                        "description": "Playlist description",
                        "publishedAt": "2026-01-02T03:04:05Z",
                        "thumbnails": {"high": {"url": "https://img.example.test/selected.jpg"}},
                    },
                    "status": {"privacyStatus": "private"},
                    "contentDetails": {"itemCount": 12},
                },
                {
                    "id": "other-playlist",
                    "snippet": {"channelId": "another-channel", "title": "Other"},
                },
            ],
            "nextPageToken": "page-two",
        },
        {
            "items": [
                {
                    "id": "selected-playlist-2",
                    "snippet": {"channelId": youtube_channel_id, "title": "Second"},
                }
            ],
            "nextPageToken": "page-three",
        },
        {
            "items": [
                {
                    "id": "selected-playlist-3",
                    "snippet": {"channelId": youtube_channel_id, "title": "Third"},
                    "status": {"privacyStatus": "unlisted"},
                    "contentDetails": {"itemCount": 0},
                }
            ]
        },
    ]

    class FakeResource:
        def list(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(execute=lambda: responses.pop(0))

    class FakeService:
        def playlists(self):
            return FakeResource()

    monkeypatch.setattr(youtube, "service_for", lambda refresh_token: FakeService())
    response = client.get(f"/channels/{channel_id}/playlists")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "selected-playlist",
            "title": "Selected",
            "description": "Playlist description",
            "thumb": "https://img.example.test/selected.jpg",
            "publishedAt": "2026-01-02T03:04:05Z",
            "privacy": "private",
            "itemCount": 12,
        },
        {
            "id": "selected-playlist-2",
            "title": "Second",
            "description": "",
            "thumb": "",
            "publishedAt": "",
            "privacy": "",
            "itemCount": None,
        },
        {
            "id": "selected-playlist-3",
            "title": "Third",
            "description": "",
            "thumb": "",
            "publishedAt": "",
            "privacy": "unlisted",
            "itemCount": 0,
        },
    ]
    assert len(calls) == 3
    assert all(call["channelId"] == youtube_channel_id for call in calls)
    assert all("mine" not in call for call in calls)
    assert all(call["part"] == "snippet,status,contentDetails" for call in calls)
    assert all(call["maxResults"] == 50 for call in calls)
    assert [call["pageToken"] for call in calls] == [None, "page-two", "page-three"]


def test_channel_playlists_have_no_200_item_cap(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    responses = []
    for page_number in range(5):
        first_id = page_number * 50
        last_id = min(first_id + 50, 205)
        responses.append(
            {
                "items": [
                    {
                        "id": f"playlist-{item_id}",
                        "snippet": {
                            "channelId": youtube_channel_id,
                            "title": f"Playlist {item_id}",
                        },
                    }
                    for item_id in range(first_id, last_id)
                ],
                **({"nextPageToken": f"page-{page_number + 2}"} if page_number < 4 else {}),
            }
        )
    calls = []

    class FakeResource:
        def list(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(execute=lambda: responses.pop(0))

    class FakeService:
        def playlists(self):
            return FakeResource()

    monkeypatch.setattr(youtube, "service_for", lambda refresh_token: FakeService())

    response = client.get(f"/channels/{channel_id}/playlists")

    assert response.status_code == 200
    assert len(response.json()) == 205
    assert len(calls) == 5


def test_channel_playlists_empty_and_api_error_responses(client, test_database, monkeypatch):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)

    class EmptyService:
        def playlists(self):
            return SimpleNamespace(list=lambda **kwargs: SimpleNamespace(execute=lambda: {}))

    monkeypatch.setattr(youtube, "service_for", lambda refresh_token: EmptyService())
    assert client.get(f"/channels/{channel_id}/playlists").json() == []

    class FailedService:
        def playlists(self):
            def fail(**kwargs):
                return SimpleNamespace(
                    execute=lambda: (_ for _ in ()).throw(RuntimeError("playlist API failed access_token=fixture-secret"))
                )

            return SimpleNamespace(list=fail)

    monkeypatch.setattr(youtube, "service_for", lambda refresh_token: FailedService())
    response = client.get(f"/channels/{channel_id}/playlists")
    assert response.status_code == 502
    assert response.json() == {"detail": {"code": "youtube_request_failed"}}
    assert "fixture-secret" not in response.text


def test_channel_playlists_repeated_page_token_fails_instead_of_looping(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    page_tokens = []
    responses = iter(
        [
            {"items": [], "nextPageToken": "repeat"},
            {"items": [], "nextPageToken": "repeat"},
        ]
    )

    class FakeResource:
        def list(self, **kwargs):
            page_tokens.append(kwargs["pageToken"])
            return SimpleNamespace(execute=lambda: next(responses))

    class FakeService:
        def playlists(self):
            return FakeResource()

    monkeypatch.setattr(youtube, "service_for", lambda refresh_token: FakeService())

    response = client.get(f"/channels/{channel_id}/playlists")

    assert response.status_code == 502
    assert response.json() == {"detail": {"code": "youtube_request_failed"}}
    assert page_tokens == [None, "repeat"]


def test_owner_search_finds_all_seven_unlisted_videos_missing_from_uploads(
    monkeypatch,
):
    """The uploads playlist can miss videos; owner search is authoritative."""
    selected_channel = "youtube-uk"
    calls = []
    video_ids = [f"unlisted-{index}" for index in range(7)]

    class FakeResource:
        def __init__(self, resource):
            self.resource = resource

        def list(self, **kwargs):
            calls.append((self.resource, kwargs))
            if self.resource == "search":
                assert kwargs["forMine"] is True
                assert kwargs["channelId"] == selected_channel
                assert kwargs["type"] == "video"
                if not kwargs.get("pageToken"):
                    ids = video_ids[:5]
                    next_token = "second-page"
                else:
                    assert kwargs["pageToken"] == "second-page"
                    ids = video_ids[5:]
                    next_token = None
                items = [
                    {"id": {"videoId": video_id}, "snippet": {"channelId": selected_channel}}
                    for video_id in ids
                ]
                # A stray video from another authorized channel must not enter
                # this channel's catalog even if the provider returned it.
                items.append({
                    "id": {"videoId": "foreign-channel-video"},
                    "snippet": {"channelId": "youtube-ru"},
                })
                return SimpleNamespace(
                    execute=lambda: {"items": items, "nextPageToken": next_token}
                )
            if self.resource == "videos":
                ids = kwargs["id"].split(",")
                items = [
                    {
                        "id": video_id,
                        "snippet": {"channelId": selected_channel, "title": video_id},
                        "status": {"privacyStatus": "unlisted"},
                    }
                    for video_id in ids
                ]
                return SimpleNamespace(execute=lambda: {"items": items})
            raise AssertionError("Catalog must not enumerate the uploads playlist")

    class FakeService:
        def search(self):
            return FakeResource("search")

        def videos(self):
            return FakeResource("videos")

        def channels(self):
            raise AssertionError("Catalog must not request uploads playlist")

        def playlistItems(self):
            raise AssertionError("Catalog must not enumerate uploads playlist")

    monkeypatch.setattr(youtube, "creds_from_refresh", lambda token: object())
    monkeypatch.setattr(youtube, "build", lambda *args, **kwargs: FakeService())
    first = youtube.list_videos("token", selected_channel, limit=5)
    second = youtube.list_videos(
        "token", selected_channel, page_token=first["next_page_token"], limit=5
    )

    assert first["uploads_playlist_id"] is None
    assert second["next_page_token"] is None
    assert first["video_ids"] + second["video_ids"] == video_ids
    assert [v["youtube_visibility"] for v in first["videos"] + second["videos"]] == [
        "unlisted"
    ] * 7
    assert [name for name, _ in calls] == ["search", "videos", "search", "videos"]


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
        assert rows[0].title is None
        assert rows[0].youtube_title == "same-video"


def test_incremental_sync_refreshes_known_videos_across_all_pages(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(
                    channel_id=channel_id,
                    youtube_video_id="known-first",
                    internal_status=None,
                    youtube_visibility="public",
                ),
                Video(
                    channel_id=channel_id,
                    youtube_video_id="known-later",
                    internal_status=None,
                    youtube_visibility="public",
                ),
            ]
        )
        db.commit()
    calls = []

    def list_page(refresh_token, selected_id, **kwargs):
        page_token = kwargs.get("page_token")
        calls.append(page_token)
        if page_token is None:
            return page(
                selected_id,
                ["new-video", "known-first"],
                next_token="more",
            )
        assert page_token == "more"
        changed = remote_video("known-later", selected_id)
        changed["youtube_visibility"] = "unlisted"
        changed["youtube_scheduled_at"] = "2026-10-16T05:00:00Z"
        return page(
            selected_id,
            ["known-later"],
            details=[changed],
        )

    monkeypatch.setattr(main.yt, "list_videos", list_page)
    assert start_sync(client, channel_id, "incremental").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "PARTIAL"
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"

    assert calls == [None, "more"]
    with test_database() as db:
        assert db.query(Video).filter(Video.channel_id == channel_id).count() == 3
        changed = (
            db.query(Video)
            .filter_by(channel_id=channel_id, youtube_video_id="known-later")
            .one()
        )
        assert changed.youtube_visibility == "unlisted"
        assert changed.youtube_scheduled_at.isoformat() == "2026-10-16T05:00:00"


def test_catalog_timestamps_always_include_utc_offset():
    # SQLite drops tzinfo, but browser dates must still represent UTC instants.
    naive_utc = datetime(2026, 10, 16, 5, 0)
    zurich = timezone(timedelta(hours=2))
    aware_local = datetime(2026, 10, 16, 7, 0, tzinfo=zurich)
    assert main._catalog_datetime_iso(naive_utc) == "2026-10-16T05:00+00:00"
    assert main._catalog_datetime_iso(aware_local) == "2026-10-16T05:00+00:00"
    assert main._catalog_datetime_iso(None) == ""


def test_catalog_video_dates_remain_utc_aware_after_sqlite_roundtrip(
    client, test_database
):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id, "date-offset")
    authorized_client(client, token)
    with test_database() as db:
        db.add(
            Video(
                channel_id=channel_id,
                youtube_video_id="timezone-video",
                youtube_visibility="private",
                availability_status="available",
                youtube_scheduled_at=datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc),
                youtube_published_at=datetime(2026, 9, 10, 22, 30, tzinfo=timezone.utc),
            )
        )
        db.commit()

    response = client.get(f"/channels/{channel_id}/videos")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["status"] == "scheduled"
    assert item["slot"] == "2026-10-16T05:00+00:00"
    assert item["publishedAt"] == "2026-09-10T22:30+00:00"


def test_incremental_refresh_restores_all_seven_unlisted_playlist_videos(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add_all(
            [
                Video(
                    channel_id=channel_id,
                    youtube_video_id=f"playlist-video-{index}",
                    youtube_visibility="private",
                    availability_status="available",
                )
                for index in range(7)
            ]
        )
        db.commit()

    def list_page(refresh_token, selected_id, **kwargs):
        page_token = kwargs.get("page_token")
        ids = (
            [f"playlist-video-{index}" for index in range(2)]
            if page_token is None
            else [f"playlist-video-{index}" for index in range(2, 7)]
        )
        details = []
        for video_id in ids:
            video = remote_video(video_id, selected_id)
            video["youtube_visibility"] = "unlisted"
            details.append(video)
        return page(
            selected_id,
            ids,
            next_token="next" if page_token is None else None,
            details=details,
        )

    monkeypatch.setattr(main.yt, "list_videos", list_page)
    assert start_sync(client, channel_id, "incremental").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "PARTIAL"
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"

    response = client.get(f"/channels/{channel_id}/videos?visibility=unlisted")
    assert response.status_code == 200
    assert response.json()["total"] == 7
    assert response.json()["status_counts"]["unlisted"] == 7
    assert {item["youtubeId"] for item in response.json()["items"]} == {
        f"playlist-video-{index}" for index in range(7)
    }


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
                Video(
                    channel_id=channel_id,
                    youtube_video_id="local-work",
                    internal_status=None,
                    youtube_title="Remote title",
                    title="Local title",
                    working_base_title="Remote title",
                ),
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
        rows = db.query(Video).filter_by(channel_id=channel_id).order_by(Video.id).all()
        assert [video.youtube_video_id for video in rows] == ["present", "local-work"]
        local_work = rows[1]
        assert local_work.title == "Local title"
        assert local_work.availability_status == "remote_missing"

    missing = client.get(f"/channels/{channel_id}/videos?visibility=remote_missing")
    assert missing.status_code == 200
    assert missing.json()["items"][0]["status"] == "remote_missing"
    assert missing.json()["items"][0]["remoteMissing"] is True


def test_catalog_video_working_routes_require_authentication(
    client, test_database
):
    user_id, _ = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    with test_database() as db:
        video = Video(
            channel_id=channel_id,
            youtube_video_id="private-video",
            internal_status=None,
        )
        db.add(video)
        db.commit()
        video_id = video.id

    assert client.get(f"/channels/{channel_id}/videos/{video_id}").status_code == 401
    assert client.patch(
        f"/channels/{channel_id}/videos/{video_id}/working",
        json={"revision": 0, "title": "Unauthorized"},
        headers=post_headers(),
    ).status_code == 401


def test_catalog_video_working_routes_are_owner_scoped_and_preserve_snapshot(
    client, test_database
):
    owner_id, owner_token = create_account(test_database, subject="working-owner")
    other_id, _ = create_account(test_database, subject="working-other")
    owner_channel_id, _, _ = create_channel(test_database, owner_id, "working-owner")
    other_channel_id, _, _ = create_channel(test_database, other_id, "working-other")
    with test_database() as db:
        video = Video(
            channel_id=owner_channel_id,
            youtube_video_id="owned-video",
            internal_status=None,
            youtube_title="Snapshot title",
            youtube_description="Snapshot description",
            youtube_tags=["snapshot", "tags"],
        )
        foreign_video = Video(
            channel_id=other_channel_id,
            youtube_video_id="foreign-video",
            internal_status=None,
        )
        db.add_all([video, foreign_video])
        db.commit()
        video_id = video.id
        foreign_video_id = foreign_video.id

    authorized_client(client, owner_token)
    detail_url = f"/channels/{owner_channel_id}/videos/{video_id}"
    detail = client.get(detail_url)
    assert detail.status_code == 200
    assert detail.json()["snapshot"] == {
        "title": "Snapshot title",
        "description": "Snapshot description",
        "tags": "snapshot, tags",
        "language": "",
        "category": "",
        "madeForKids": None,
    }
    assert detail.json()["working"] == {
        "title": None,
        "description": None,
        "tags": None,
        "language": None,
        "category": None,
        "madeForKids": None,
        "ready": False,
    }
    assert detail.json()["effective"] == detail.json()["snapshot"]
    assert detail.json()["dirty"] is False

    headers = post_headers()
    patch_url = f"{detail_url}/working"
    saved = client.patch(
        patch_url,
        json={
            "revision": 0,
            "title": "",
            "description": "Local description",
            "tags": "local, tags",
        },
        headers=headers,
    )
    assert saved.status_code == 200
    saved_item = saved.json()
    assert saved_item["snapshot"]["title"] == "Snapshot title"
    assert saved_item["working"] == {
        "title": "",
        "description": "Local description",
        "tags": "local, tags",
        "language": None,
        "category": None,
        "madeForKids": None,
        "ready": False,
    }
    assert saved_item["effective"]["title"] == ""
    assert saved_item["base"] == {
        "title": "Snapshot title",
        "description": "Snapshot description",
        "tags": "snapshot, tags",
        "language": None,
        "category": None,
        "madeForKids": None,
    }
    assert saved_item["dirty"] is True
    assert saved_item["revision"] == 1

    rejected_snapshot_write = client.patch(
        patch_url,
        json={"revision": 1, "youtube_title": "Must not change snapshot"},
        headers=headers,
    )
    assert rejected_snapshot_write.status_code == 422

    with test_database() as db:
        persisted = db.get(Video, video_id)
        assert persisted.youtube_title == "Snapshot title"
        assert persisted.youtube_description == "Snapshot description"
        assert persisted.youtube_tags == ["snapshot", "tags"]

    assert client.get(
        f"/channels/{other_channel_id}/videos/{foreign_video_id}"
    ).status_code == 404


def test_working_metadata_round_trips_above_youtube_limits(client, test_database):
    user_id, token = create_account(test_database, subject="long-working-metadata")
    channel_id, _, _ = create_channel(test_database, user_id, "long-working-metadata")
    with test_database() as db:
        video = Video(channel_id=channel_id, youtube_video_id="long-working-video")
        db.add(video)
        db.commit()
        video_id = video.id

    authorized_client(client, token)
    url = f"/channels/{channel_id}/videos/{video_id}"
    title = "Л" * 300
    description = "😀" * 1300
    tags = ",".join(f"tag-{index}" for index in range(100))
    saved = client.patch(
        f"{url}/working",
        json={"revision": 0, "title": title, "description": description, "tags": tags},
        headers=post_headers(),
    )

    assert saved.status_code == 200
    assert saved.json()["working"] == {
        "title": title,
        "description": description,
        "tags": tags,
        "language": None,
        "category": None,
        "madeForKids": None,
        "ready": False,
    }
    reloaded = client.get(url)
    assert reloaded.status_code == 200
    assert reloaded.json()["effective"] == {
        "title": title,
        "description": description,
        "tags": tags,
        "language": "",
        "category": "",
        "madeForKids": None,
    }


def test_working_video_revision_prevents_lost_updates(client, test_database):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id, "revision")
    authorized_client(client, token)
    with test_database() as db:
        video = Video(
            channel_id=channel_id,
            youtube_video_id="revision-video",
            internal_status=None,
            youtube_title="Snapshot",
        )
        db.add(video)
        db.commit()
        video_id = video.id

    url = f"/channels/{channel_id}/videos/{video_id}/working"
    headers = post_headers()
    first = client.patch(url, json={"revision": 0, "title": "First"}, headers=headers)
    stale = client.patch(url, json={"revision": 0, "title": "Stale overwrite"}, headers=headers)

    assert first.status_code == 200
    assert first.json()["revision"] == 1
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["working"]["title"] == "First"
    with test_database() as db:
        assert db.get(Video, video_id).title == "First"


def test_working_readiness_is_owner_scoped_and_revision_protected(client, test_database):
    owner_id, owner_token = create_account(test_database, subject="readiness-owner")
    other_id, _ = create_account(test_database, subject="readiness-other")
    owner_channel_id, _, _ = create_channel(test_database, owner_id, "readiness-owner")
    other_channel_id, _, _ = create_channel(test_database, other_id, "readiness-other")
    with test_database() as db:
        video = Video(
            channel_id=owner_channel_id,
            youtube_video_id="readiness-video",
            internal_status=None,
            youtube_title="YouTube title",
            youtube_description="YouTube description",
        )
        foreign_video = Video(
            channel_id=other_channel_id,
            youtube_video_id="foreign-readiness-video",
            internal_status=None,
        )
        db.add_all([video, foreign_video])
        db.commit()
        video_id = video.id
        foreign_video_id = foreign_video.id

    authorized_client(client, owner_token)
    detail_url = f"/channels/{owner_channel_id}/videos/{video_id}"
    initial = client.get(detail_url)
    assert initial.status_code == 200
    assert initial.json()["working"]["ready"] is False
    assert initial.json()["snapshot"]["title"] == "YouTube title"

    patch_url = f"{detail_url}/working"
    headers = post_headers()
    marked_ready = client.patch(
        patch_url,
        json={"revision": 0, "ready": True},
        headers=headers,
    )
    assert marked_ready.status_code == 200
    assert marked_ready.json()["working"]["ready"] is True
    assert marked_ready.json()["revision"] == 1
    assert marked_ready.json()["snapshot"] == initial.json()["snapshot"]
    assert marked_ready.json()["dirty"] is False
    assert marked_ready.json()["conflict"] is False

    stale = client.patch(
        patch_url,
        json={"revision": 0, "ready": False},
        headers=headers,
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["working"]["ready"] is True

    foreign = client.patch(
        f"/channels/{other_channel_id}/videos/{foreign_video_id}/working",
        json={"revision": 0, "ready": True},
        headers=headers,
    )
    assert foreign.status_code == 404

    with test_database() as db:
        persisted = db.get(Video, video_id)
        assert persisted.working_ready is True
        assert persisted.youtube_title == "YouTube title"
        assert persisted.youtube_description == "YouTube description"


def test_catalog_sync_after_local_edit_reports_snapshot_conflict(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id, "conflict")
    authorized_client(client, token)
    with test_database() as db:
        video = Video(
            channel_id=channel_id,
            youtube_video_id="conflict-video",
            internal_status=None,
            youtube_title="Original title",
            youtube_description="Description",
            youtube_tags=["one"],
        )
        db.add(video)
        db.commit()
        video_id = video.id

    detail_url = f"/channels/{channel_id}/videos/{video_id}"
    edited = client.patch(
        f"{detail_url}/working",
        json={"revision": 0, "title": "Local title"},
        headers=post_headers(),
    )
    assert edited.status_code == 200
    remote_title = {"value": "Updated remotely"}
    monkeypatch.setattr(
        main.yt,
        "list_videos",
        lambda refresh_token, selected_id, **kwargs: page(
            selected_id,
            ["conflict-video"],
            details=[remote_video("conflict-video", selected_id, remote_title["value"])],
        ),
    )

    assert start_sync(client, channel_id, "incremental").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"
    refreshed = client.get(detail_url).json()

    assert refreshed["snapshot"]["title"] == "Updated remotely"
    assert refreshed["working"]["title"] == "Local title"
    assert refreshed["base"]["title"] == "Original title"
    assert refreshed["dirtyFields"]["title"] is True
    assert refreshed["conflictFields"]["title"] is True

    kept = client.patch(
        f"{detail_url}/working",
        json={"revision": 1, "conflict_resolution": "keep_local"},
        headers=post_headers(),
    )
    assert kept.status_code == 200
    assert kept.json()["working"]["title"] == "Local title"
    assert kept.json()["base"]["title"] == "Updated remotely"
    assert kept.json()["conflict"] is False

    remote_title["value"] = "Final remote title"
    assert start_sync(client, channel_id, "incremental").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"

    replaced = client.patch(
        f"{detail_url}/working",
        json={"revision": 2, "conflict_resolution": "use_snapshot"},
        headers=post_headers(),
    )
    assert replaced.status_code == 200
    assert replaced.json()["working"]["title"] is None
    assert replaced.json()["effective"]["title"] == "Final remote title"
    assert replaced.json()["conflict"] is False


def test_playlist_items_are_channel_scoped_and_include_matching_catalog_videos(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database, subject="playlist-item-owner")
    other_id, _ = create_account(test_database, subject="playlist-item-other")
    channel_id, _, _ = create_channel(test_database, user_id, "playlist-item-owner")
    other_channel_id, _, _ = create_channel(test_database, other_id, "playlist-item-other")
    with test_database() as db:
        video = Video(
            channel_id=channel_id,
            youtube_video_id="playlist-video",
            youtube_title="Cached playlist video",
            internal_status=None,
        )
        db.add(video)
        db.commit()
        video_id = video.id

    calls = []
    monkeypatch.setattr(
        main.yt,
        "list_playlist_items",
        lambda *args, **kwargs: calls.append((args, kwargs)) or {
            "items": [
                {"videoId": "playlist-video", "title": "Cached playlist video"},
                {
                    "videoId": "uncached-video",
                    "title": "Not in catalog",
                    "videoSnapshot": {"title": "Not in catalog", "description": ""},
                },
            ],
            "nextPageToken": "next-page",
        },
    )
    authorized_client(client, token)
    response = client.get(
        f"/channels/{channel_id}/playlists/playlist-one/items?page_token=cursor&limit=20"
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["catalogVideo"]["id"] == video_id
    assert response.json()["items"][1]["catalogVideo"] is None
    assert response.json()["items"][1]["videoSnapshot"]["title"] == "Not in catalog"
    assert response.json()["nextPageToken"] == "next-page"
    assert calls[0][0] == ("refresh-token", "youtube-playlist-item-owner", "playlist-one", "cursor", 20)
    assert client.get(
        f"/channels/{other_channel_id}/playlists/playlist-one/items"
    ).status_code == 404


def test_youtube_playlist_items_verify_ownership_and_paginate(monkeypatch):
    calls = []

    class FakeResource:
        def __init__(self, result):
            self.result = result

        def list(self, **kwargs):
            calls.append(kwargs)
            return self

        def execute(self):
            return self.result

    class FakeService:
        def playlists(self):
            return FakeResource({"items": [{"snippet": {"channelId": "channel-one"}}]})

        def playlistItems(self):
            return FakeResource({
                "items": [{
                    "snippet": {
                        "title": "Video title",
                        "position": 4,
                        "resourceId": {"videoId": "video-one"},
                    },
                    "contentDetails": {"videoId": "video-one"},
                    "status": {"privacyStatus": "public"},
                }],
                "nextPageToken": "next",
            })

        def videos(self):
            return FakeResource({"items": [{
                "id": "video-one",
                "snippet": {
                    "title": "Video title",
                    "description": "Description",
                    "tags": ["one", "two"],
                    "categoryId": "27",
                    "publishedAt": "2026-10-03T12:00:00Z",
                    "thumbnails": {},
                },
                "status": {"privacyStatus": "public", "madeForKids": False},
                "contentDetails": {"duration": "PT1M", "caption": "true"},
                "statistics": {"viewCount": "12", "likeCount": "3", "commentCount": "1"},
            }]})

    monkeypatch.setattr(youtube, "service_for", lambda _token: FakeService())
    result = youtube.list_playlist_items(
        "refresh", "channel-one", "playlist-one", page_token="cursor", limit=100
    )

    assert result == {
        "items": [{
            "playlistItemId": "",
            "videoId": "video-one",
            "title": "Video title",
            "thumb": "",
            "position": 4,
            "privacy": "public",
            "videoSnapshot": {
                "youtubeId": "video-one",
                "title": "Video title",
                "effectiveTitle": "Video title",
                "description": "Description",
                "tags": "one, two",
                "category": "27",
                "language": "",
                "privacy": "public",
                "status": "public",
                "availability": "available",
                "remoteMissing": False,
                "thumb": "",
                "publishedAt": "2026-10-03T12:00:00Z",
                "duration": "PT1M",
                "views": 12,
                "likes": 3,
                "comments": 1,
                "captions": True,
                "madeForKids": False,
            },
        }],
        "nextPageToken": "next",
    }
    assert calls[1]["maxResults"] == 50
    assert calls[1]["pageToken"] == "cursor"

    class WrongChannelService(FakeService):
        def playlists(self):
            return FakeResource({"items": [{"snippet": {"channelId": "channel-two"}}]})

    monkeypatch.setattr(youtube, "service_for", lambda _token: WrongChannelService())
    with pytest.raises(LookupError):
        youtube.list_playlist_items("refresh", "channel-one", "playlist-one")


def test_working_conflict_distinguishes_missing_snapshot_from_empty_string(
    client, test_database, monkeypatch
):
    user_id, token = create_account(test_database)
    channel_id, youtube_channel_id, _ = create_channel(test_database, user_id, "null-conflict")
    authorized_client(client, token)
    with test_database() as db:
        video = Video(
            channel_id=channel_id,
            youtube_video_id="null-snapshot-video",
            internal_status=None,
            youtube_title=None,
        )
        db.add(video)
        db.commit()
        video_id = video.id

    detail_url = f"/channels/{channel_id}/videos/{video_id}"
    edited = client.patch(
        f"{detail_url}/working",
        json={"revision": 0, "title": "Local value"},
        headers=post_headers(),
    )
    assert edited.status_code == 200
    assert edited.json()["base"]["title"] is None

    monkeypatch.setattr(
        main.yt,
        "list_videos",
        lambda refresh_token, selected_id, **kwargs: page(
            selected_id,
            ["null-snapshot-video"],
            details=[remote_video("null-snapshot-video", selected_id, "unused") | {"youtube_title": ""}],
        ),
    )
    assert start_sync(client, channel_id, "incremental").status_code == 200
    assert continue_sync(client, channel_id).json()["state"] == "COMPLETE"
    refreshed = client.get(detail_url).json()

    assert refreshed["snapshot"]["title"] == ""
    assert refreshed["working"]["title"] == "Local value"
    assert refreshed["conflictFields"]["title"] is True


def test_video_detail_and_working_patch_require_the_owned_channel(
    client, test_database
):
    owner_id, token = create_account(test_database, subject="inactive-video-owner")
    channel_id, _, _ = create_channel(test_database, owner_id, "inactive-video", active=False)
    with test_database() as db:
        video = Video(
            channel_id=channel_id,
            youtube_video_id="inactive-video",
            internal_status=None,
            youtube_title="Snapshot",
        )
        db.add(video)
        db.commit()
        video_id = video.id

    authorized_client(client, token)
    assert client.get(f"/channels/{channel_id}/videos/{video_id}").status_code == 200
    patched = client.patch(
        f"/channels/{channel_id}/videos/{video_id}/working",
        json={"revision": 0, "title": "Local while offline"},
        headers=post_headers(),
    )
    assert patched.status_code == 200
    assert patched.json()["working"]["title"] == "Local while offline"


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
    monkeypatch.setattr(main.yt, "list_playlists", fail_if_called)
    assert client.get(f"/channels/{foreign_channel_id}/videos").status_code == 404
    assert client.get(f"/channels/{foreign_channel_id}/playlists").status_code == 404
    assert client.get(f"/channels/{foreign_channel_id}/catalog/status").status_code == 404
    assert start_sync(client, foreign_channel_id).status_code == 404
    assert continue_sync(client, foreign_channel_id).status_code == 404
    assert client.get(f"/channels/{inactive_channel_id}/videos").status_code == 200
    assert client.get(f"/channels/{inactive_channel_id}/playlists").status_code == 400
    assert client.get(f"/channels/{inactive_channel_id}/catalog/status").status_code == 200
    assert start_sync(client, inactive_channel_id).status_code == 400


def test_catalog_routes_require_authentication(client):
    headers = post_headers()
    assert client.get("/channels/1/videos").status_code == 401
    assert client.get("/channels/1/catalog/status").status_code == 401
    assert client.post(
        "/channels/1/catalog/sync",
        json={"mode": "initial"},
        headers=headers,
    ).status_code == 401
    assert client.post(
        "/channels/1/catalog/sync/continue",
        headers=headers,
    ).status_code == 401
    assert client.get("/channels/1/videos/1").status_code == 401
    assert client.patch(
        "/channels/1/videos/1/working",
        json={"revision": 0, "title": "Unauthorized"},
        headers=headers,
    ).status_code == 401


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


def test_completed_catalog_does_not_become_stale_only_because_time_passed(client, test_database):
    user_id, token = create_account(test_database)
    channel_id, _, _ = create_channel(test_database, user_id)
    authorized_client(client, token)
    with test_database() as db:
        db.add(Video(
            channel_id=channel_id,
            youtube_video_id="cached-video",
            internal_status=None,
            youtube_title="Cached",
            youtube_visibility="public",
            availability_status="available",
        ))
        db.add(ChannelCatalogSync(
            channel_id=channel_id,
            state="COMPLETE",
            mode="incremental",
            scanned_count=1,
            last_success_at=datetime.now(timezone.utc) - timedelta(days=2),
        ))
        db.commit()

    response = client.get(f"/channels/{channel_id}/catalog/status")
    assert response.status_code == 200
    assert response.json()["state"] == "COMPLETE"
    assert response.json()["video_count"] == 1


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
                    youtube_video_id="unlisted-video",
                    internal_status=None,
                    youtube_title="Link only",
                    youtube_visibility="unlisted",
                    availability_status="available",
                    youtube_published_at=datetime(2026, 9, 3, tzinfo=timezone.utc),
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
    private = client.get(f"/channels/{channel_id}/videos?visibility=private")
    scheduled = client.get(f"/channels/{channel_id}/videos?visibility=scheduled")
    unlisted = client.get(f"/channels/{channel_id}/videos?visibility=unlisted")
    unavailable = client.get(f"/channels/{channel_id}/videos?visibility=unavailable")
    newest_first = client.get(f"/channels/{channel_id}/videos?sort=date_desc&limit=2")
    oldest_page_one = client.get(f"/channels/{channel_id}/videos?sort=date_asc&limit=1")
    oldest_page_two = client.get(
        f"/channels/{channel_id}/videos?sort=date_asc&limit=1&cursor={oldest_page_one.json()['next_cursor']}"
    )

    assert [item["title"] for item in first.json()["items"]] == ["Alpha"]
    assert [item["title"] for item in second.json()["items"]] == ["Beta"]
    assert [item["youtubeId"] for item in by_description.json()["items"]] == ["title-b"]
    assert [item["youtubeId"] for item in by_date_range.json()["items"]] == ["title-a"]
    assert [item["youtubeId"] for item in public.json()["items"]] == ["title-b"]
    assert private.json()["items"] == []
    assert [item["youtubeId"] for item in scheduled.json()["items"]] == ["title-a"]
    assert [item["youtubeId"] for item in unlisted.json()["items"]] == ["unlisted-video"]
    assert unavailable.json()["items"][0]["status"] == "unavailable"
    assert unlisted.json()["status_counts"]["unlisted"] == 1
    assert unlisted.json()["status_counts"]["unavailable"] == 1
    assert [item["youtubeId"] for item in newest_first.json()["items"]] == ["title-a", "unlisted-video"]
    assert [item["youtubeId"] for item in oldest_page_one.json()["items"]] == ["title-b"]
    assert [item["youtubeId"] for item in oldest_page_two.json()["items"]] == ["unlisted-video"]