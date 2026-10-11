from fastapi.testclient import TestClient

from app import main
from app.settings import settings


def test_scheduled_collector_rejects_missing_or_invalid_secret(monkeypatch):
    monkeypatch.setattr(settings, "realtime_collector_secret", "test-secret")
    client = TestClient(main.app)
    assert client.post("/internal/realtime-collect").status_code == 401
    assert client.post("/internal/realtime-collect", headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_scheduled_collector_requires_configured_secret(monkeypatch):
    monkeypatch.setattr(settings, "realtime_collector_secret", "")
    assert TestClient(main.app).post(
        "/internal/realtime-collect", headers={"Authorization": "Bearer anything"}
    ).status_code == 401


def test_scheduled_collector_executes_one_pass(monkeypatch):
    monkeypatch.setattr(settings, "realtime_collector_secret", "test-secret")
    calls = []
    monkeypatch.setattr(main.realtime_stats, "collect_once", lambda: calls.append(1) or 4)
    response = TestClient(main.app).post(
        "/internal/realtime-collect", headers={"Authorization": "Bearer test-secret"}
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True, "stored": 4}
    assert calls == [1]
