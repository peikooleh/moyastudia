from app.settings import settings

from conftest import create_account


def _signed_in(client, test_database, subject="write-mode"):
    _, session_token = create_account(test_database, subject=subject)
    client.cookies.set(settings.session_cookie_name, session_token)
    return {"Origin": settings.frontend_origin}


def test_write_mode_defaults_off(client, test_database):
    _signed_in(client, test_database)
    response = client.get("/write-mode")
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "youtube_writes_available": False}


def test_enabling_write_mode_requires_explicit_confirmation(client, test_database):
    headers = _signed_in(client, test_database)
    response = client.put("/write-mode", headers=headers, json={"enabled": True})
    assert response.status_code == 422
    assert client.get("/write-mode").json()["enabled"] is False


def test_write_mode_can_be_enabled_and_disabled(client, test_database):
    headers = _signed_in(client, test_database)
    enabled = client.put(
        "/write-mode",
        headers=headers,
        json={"enabled": True, "confirmation": "enable_youtube_writes"},
    )
    assert enabled.status_code == 200
    assert enabled.json() == {"enabled": True, "youtube_writes_available": False}
    assert client.get("/write-mode").json()["enabled"] is True

    disabled = client.put("/write-mode", headers=headers, json={"enabled": False})
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False


def test_write_mode_mutation_requires_same_origin(client, test_database):
    _signed_in(client, test_database)
    response = client.put(
        "/write-mode",
        json={"enabled": True, "confirmation": "enable_youtube_writes"},
    )
    assert response.status_code == 403


def test_write_mode_requires_authentication(client):
    assert client.get("/write-mode").status_code == 401
