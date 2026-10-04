from app import youtube as yt


class _Request:
    def __init__(self, response):
        self.response = response

    def execute(self):
        return self.response


class _Playlists:
    def __init__(self):
        self.calls = []

    def insert(self, **kwargs):
        self.calls.append(kwargs)
        return _Request({
            "id": "PL-new",
            "snippet": kwargs["body"]["snippet"],
            "status": kwargs["body"]["status"],
        })


class _PlaylistItems:
    def __init__(self):
        self.insert_calls = []
        self.delete_calls = []

    def insert(self, **kwargs):
        self.insert_calls.append(kwargs)
        return _Request({
            "id": "PLI-new",
            "snippet": kwargs["body"]["snippet"],
        })

    def delete(self, **kwargs):
        self.delete_calls.append(kwargs)
        return _Request({})


class _Service:
    def __init__(self):
        self.playlists_api = _Playlists()
        self.playlist_items_api = _PlaylistItems()

    def playlists(self):
        return self.playlists_api

    def playlistItems(self):
        return self.playlist_items_api


def test_create_playlist_uses_private_default_and_records_quota(monkeypatch):
    service = _Service()
    monkeypatch.setattr(yt, "service_for", lambda _token: service)
    recorded = []

    result = yt.create_playlist(
        "refresh",
        title="Draft",
        description="Description",
        recorder=lambda operation, outcome: recorded.append((operation, outcome)),
    )

    assert result == {
        "id": "PL-new",
        "title": "Draft",
        "description": "Description",
        "privacy": "private",
    }
    assert service.playlists_api.calls[0]["part"] == "snippet,status"
    assert recorded == [("playlists.insert", "success")]


def test_add_video_returns_playlist_item_id(monkeypatch):
    service = _Service()
    monkeypatch.setattr(yt, "service_for", lambda _token: service)

    result = yt.add_video_to_playlist(
        "refresh",
        playlist_id="PL-one",
        video_id="video-one",
    )

    assert result["playlistItemId"] == "PLI-new"
    body = service.playlist_items_api.insert_calls[0]["body"]
    assert body["snippet"]["playlistId"] == "PL-one"
    assert body["snippet"]["resourceId"] == {
        "kind": "youtube#video",
        "videoId": "video-one",
    }


def test_remove_playlist_item_uses_membership_id_and_records_quota(monkeypatch):
    service = _Service()
    monkeypatch.setattr(yt, "service_for", lambda _token: service)
    recorded = []

    yt.remove_playlist_item(
        "refresh",
        playlist_item_id="PLI-membership",
        recorder=lambda operation, outcome: recorded.append((operation, outcome)),
    )

    assert service.playlist_items_api.delete_calls == [{"id": "PLI-membership"}]
    assert recorded == [("playlistItems.delete", "success")]
