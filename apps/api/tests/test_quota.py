from datetime import datetime, timezone

from app import quota
from app import main as main_module
from app.models import User
from app.settings import settings

from conftest import create_account


def test_quota_window_uses_pacific_midnight():
    start, end = quota.quota_window(datetime(2026, 10, 4, 12, 0, tzinfo=timezone.utc))
    assert start.isoformat() == "2026-10-04T07:00:00+00:00"
    assert end.isoformat() == "2026-10-05T07:00:00+00:00"


def test_quota_summary_tracks_moyastudia_attempts(client, test_database):
    user_id, session_token = create_account(test_database, subject="quota-owner")
    with test_database() as db:
        quota.record_usage(
            db,
            user_id=user_id,
            operation="videos.list",
            outcome="success",
        )
        quota.record_usage(
            db,
            user_id=user_id,
            operation="videos.update",
            outcome="youtube_error",
        )

    client.cookies.set(settings.session_cookie_name, session_token)
    response = client.get("/quota/today")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "moyastudia_tracked"
    assert body["authoritative_google_balance"] is False
    assert body["buckets"]["general"]["used"] == 51
    assert body["buckets"]["general"]["requests"] == 2
    assert body["buckets"]["general"]["limit"] == 10_000
    assert body["buckets"]["general"]["estimated_remaining"] == 9_949
    assert body["buckets"]["search"]["used"] == 0
    assert body["buckets"]["video_upload"]["used"] == 0


def test_quota_endpoint_requires_authentication(client):
    assert client.get("/quota/today").status_code == 401


def test_quota_operation_buckets_match_current_reference():
    assert quota.operation_cost("channels.list") == ("general", 1)
    assert quota.operation_cost("videos.update") == ("general", 50)\n    assert quota.operation_cost("captions.insert") == ("general", 400)\n    assert quota.operation_cost("captions.update") == ("general", 450)\n    assert quota.operation_cost("videos.delete") == ("general", 50)
    assert quota.operation_cost("search.list") == ("search", 1)
    assert quota.operation_cost("videos.insert") == ("video_upload", 1)


def test_request_quota_recorder_uses_an_isolated_session(monkeypatch):
    bind = object()

    class RequestSession:
        def get_bind(self):
            return bind

        def commit(self):
            raise AssertionError("request session must not be committed by quota telemetry")

    calls = []

    def fake_record_usage_isolated(received_bind, **kwargs):
        calls.append((received_bind, kwargs))

    monkeypatch.setattr(quota, "record_usage_isolated", fake_record_usage_isolated)
    user = User(id="quota-user")
    recorder = main_module._quota_recorder(RequestSession(), user)
    recorder("videos.update", "success")

    assert calls == [
        (
            bind,
            {
                "user_id": "quota-user",
                "google_connection_id": None,
                "channel_id": None,
                "operation": "videos.update",
                "outcome": "success",
            },
        )
    ]
