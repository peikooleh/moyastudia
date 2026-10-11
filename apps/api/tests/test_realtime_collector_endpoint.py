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


def test_scheduled_catalog_refresh_rejects_invalid_secret(monkeypatch):
    monkeypatch.setattr(settings, "realtime_collector_secret", "test-secret")
    main.app.dependency_overrides[main.get_db] = lambda: object()
    try:
        response = TestClient(main.app).post(
            "/internal/catalog-refresh", headers={"Authorization": "Bearer invalid"}
        )
    finally:
        main.app.dependency_overrides.pop(main.get_db, None)
    assert response.status_code == 401


def test_scheduled_catalog_refresh_advances_one_bounded_round(monkeypatch):
    monkeypatch.setattr(settings, "realtime_collector_secret", "test-secret")
    calls = []
    monkeypatch.setattr(
        main,
        "_run_scheduled_catalog_page",
        lambda db: calls.append(db) or {"channels": [{"channel_id": 1, "state": "PARTIAL", "pending": True}], "pending": 1, "errors": []},
    )
    main.app.dependency_overrides[main.get_db] = lambda: object()
    try:
        response = TestClient(main.app).post(
            "/internal/catalog-refresh", headers={"Authorization": "Bearer test-secret"}
        )
    finally:
        main.app.dependency_overrides.pop(main.get_db, None)
    assert response.status_code == 200
    assert response.json()["pending"] == 1
    assert len(calls) == 1


def test_scheduled_catalog_refresh_fails_when_any_channel_errors(monkeypatch):
    monkeypatch.setattr(settings, "realtime_collector_secret", "test-secret")
    monkeypatch.setattr(
        main,
        "_run_scheduled_catalog_page",
        lambda db: {"channels": [], "pending": 0, "errors": [{"channel_id": 7, "status_code": 502}]},
    )
    main.app.dependency_overrides[main.get_db] = lambda: object()
    try:
        response = TestClient(main.app).post(
            "/internal/catalog-refresh", headers={"Authorization": "Bearer test-secret"}
        )
    finally:
        main.app.dependency_overrides.pop(main.get_db, None)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "catalog_refresh_failed"
