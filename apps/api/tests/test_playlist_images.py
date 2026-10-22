import json
from types import SimpleNamespace

import pytest

from app import youtube


class FakeHttp:
    def __init__(self, status=200, body=None):
        self.status = status
        self.body = body if body is not None else {"items": [{"id": "image-1"}]}
        self.calls = []

    def request(self, url, method="GET"):
        self.calls.append((url, method))
        return SimpleNamespace(status=self.status, reason="Forbidden" if self.status >= 400 else "OK"), json.dumps(self.body).encode("utf-8")


def test_playlist_images_list_uses_documented_parent_filter():
    http = FakeHttp()
    service = SimpleNamespace(_http=http)
    images = youtube._playlist_images_list(service, "PL/with space")
    assert images == [{"id": "image-1"}]
    assert http.calls == [(
        "https://www.googleapis.com/youtube/v3/playlistImages?part=snippet&parent=PL%2Fwith+space&maxResults=50",
        "GET",
    )]


def test_playlist_images_list_preserves_provider_http_error():
    http = FakeHttp(status=403, body={"error": {"message": "Forbidden"}})
    with pytest.raises(youtube.HttpError) as error:
        youtube._playlist_images_list(SimpleNamespace(_http=http), "PL123")
    assert error.value.resp.status == 403
