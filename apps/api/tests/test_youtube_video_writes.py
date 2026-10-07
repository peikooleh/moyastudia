from app import youtube as yt


class _Request:
    def __init__(self, response):
        self.response = response

    def execute(self):
        return self.response


class _Videos:
    def __init__(self, status):
        self.status = status
        self.update_calls = []

    def list(self, **kwargs):
        return _Request({"items": [{"status": dict(self.status)}]})

    def update(self, **kwargs):
        self.update_calls.append(kwargs)
        body = kwargs["body"]
        return _Request({
            "snippet": body.get("snippet", {}),
            "status": body.get("status", dict(self.status)),
        })


class _Service:
    def __init__(self, status):
        self.videos_api = _Videos(status)

    def videos(self):
        return self.videos_api


def _install_service(monkeypatch, status):
    service = _Service(status)
    monkeypatch.setattr(yt, "build", lambda *args, **kwargs: service)
    monkeypatch.setattr(yt, "creds_from_refresh", lambda _token: object())
    return service


def test_calendar_noop_does_not_send_videos_update(monkeypatch):
    service = _install_service(monkeypatch, {
        "privacyStatus": "private",
        "publishAt": "2099-01-02T15:30:00Z",
    })

    result = yt.update_video_calendar_status(
        "refresh",
        "video-one",
        privacy_status="private",
        publish_at="2099-01-02T15:30:00Z",
    )

    assert result == {"privacy": "private", "publishAt": "2099-01-02T15:30:00Z"}
    assert service.videos_api.update_calls == []


def test_metadata_update_does_not_touch_status_when_audience_is_unchanged(monkeypatch):
    service = _install_service(monkeypatch, {
        "privacyStatus": "private",
        "publishAt": "2099-01-02T15:30:00Z",
        "selfDeclaredMadeForKids": False,
    })

    yt.update_video_metadata(
        "refresh",
        "video-one",
        title="New title",
        description="New description",
        tags=["new"],
        category_id="22",
        language="de",
        made_for_kids=False,
    )

    call = service.videos_api.update_calls[0]
    assert call["part"] == "snippet"
    assert "status" not in call["body"]


def test_metadata_audience_change_preserves_existing_schedule(monkeypatch):
    service = _install_service(monkeypatch, {
        "privacyStatus": "private",
        "publishAt": "2099-01-02T15:30:00Z",
        "license": "youtube",
        "embeddable": True,
        "publicStatsViewable": True,
        "selfDeclaredMadeForKids": False,
    })

    yt.update_video_metadata(
        "refresh",
        "video-one",
        title="New title",
        description="New description",
        tags=["new"],
        category_id="22",
        language="de",
        made_for_kids=True,
    )

    call = service.videos_api.update_calls[0]
    assert call["part"] == "snippet,status"
    assert call["body"]["status"]["privacyStatus"] == "private"
    assert call["body"]["status"]["publishAt"] == "2099-01-02T15:30:00Z"
    assert call["body"]["status"]["selfDeclaredMadeForKids"] is True


def test_calendar_visibility_change_drops_existing_schedule(monkeypatch):
    service = _install_service(monkeypatch, {
        "privacyStatus": "private",
        "publishAt": "2099-01-02T15:30:00Z",
        "license": "youtube",
    })

    yt.update_video_calendar_status(
        "refresh",
        "video-one",
        privacy_status="public",
        publish_at=None,
    )

    call = service.videos_api.update_calls[0]
    assert call["part"] == "status"
    assert call["body"]["status"]["privacyStatus"] == "public"
    assert "publishAt" not in call["body"]["status"]
