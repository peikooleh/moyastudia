from app.models import AIConnection
from app.settings import settings
from app.tokens import decrypt_refresh_token

from conftest import create_account


def _payload(**overrides):
    payload = {
        "provider": "openai",
        "model": "gpt-test",
        "api_key": "secret-ai-key",
        "title_prompt": "Improve the title",
        "description_prompt": "Improve the description",
    }
    payload.update(overrides)
    return payload


def test_ai_connections_require_authentication(client):
    assert client.get("/ai-connections").status_code == 401
    assert client.put(
        "/ai-connections",
        json=_payload(),
        headers={"Origin": settings.frontend_origin},
    ).status_code == 401


def test_ai_connection_write_requires_same_origin(client, test_database):
    _, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)

    rejected = client.put(
        "/ai-connections",
        json=_payload(),
        headers={"Origin": "https://attacker.test"},
    )

    assert rejected.status_code == 403
    with test_database() as db:
        assert db.query(AIConnection).count() == 0


def test_ai_connection_encrypts_key_and_never_returns_plaintext(client, test_database):
    user_id, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)

    response = client.put(
        "/ai-connections",
        json=_payload(),
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openai"
    assert body["model"] == "gpt-test"
    assert body["has_api_key"] is True
    assert "api_key" not in body
    assert "encrypted_api_key" not in body
    assert "secret-ai-key" not in response.text

    with test_database() as db:
        row = db.query(AIConnection).filter(AIConnection.user_id == user_id).one()
        assert row.encrypted_api_key != "secret-ai-key"
        assert decrypt_refresh_token(row.encrypted_api_key) == "secret-ai-key"

    listed = client.get("/ai-connections")
    assert listed.status_code == 200
    assert "secret-ai-key" not in listed.text
    assert listed.json() == [{
        "id": body["id"],
        "provider": "openai",
        "model": "gpt-test",
        "has_api_key": True,
        "title_prompt": "Improve the title",
        "description_prompt": "Improve the description",
    }]


def test_ai_connections_are_owner_scoped(client, test_database):
    owner_id, owner_token = create_account(test_database, subject="ai-owner")
    other_id, other_token = create_account(test_database, subject="ai-other")

    client.cookies.set(settings.session_cookie_name, owner_token)
    created = client.put(
        "/ai-connections",
        json=_payload(model="owner-model"),
        headers={"Origin": settings.frontend_origin},
    )
    assert created.status_code == 200

    client.cookies.set(settings.session_cookie_name, other_token)
    assert client.get("/ai-connections").json() == []

    other_created = client.put(
        "/ai-connections",
        json=_payload(model="other-model", api_key="other-secret"),
        headers={"Origin": settings.frontend_origin},
    )
    assert other_created.status_code == 200

    with test_database() as db:
        rows = db.query(AIConnection).order_by(AIConnection.user_id).all()
        assert {row.user_id for row in rows} == {owner_id, other_id}
        assert len(rows) == 2


def test_ai_connection_update_keeps_saved_key_when_api_key_is_omitted(client, test_database):
    user_id, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    headers = {"Origin": settings.frontend_origin}

    first = client.put("/ai-connections", json=_payload(), headers=headers)
    assert first.status_code == 200

    updated = client.put(
        "/ai-connections",
        json=_payload(
            api_key=None,
            title_prompt="Updated title prompt",
            description_prompt="Updated description prompt",
        ),
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["id"] == first.json()["id"]
    assert updated.json()["has_api_key"] is True
    with test_database() as db:
        row = db.query(AIConnection).filter(AIConnection.user_id == user_id).one()
        assert decrypt_refresh_token(row.encrypted_api_key) == "secret-ai-key"
        assert row.title_prompt == "Updated title prompt"
        assert row.description_prompt == "Updated description prompt"


def test_new_ai_connection_requires_api_key(client, test_database):
    _, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)

    response = client.put(
        "/ai-connections",
        json=_payload(api_key=None),
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 422
    with test_database() as db:
        assert db.query(AIConnection).count() == 0


def test_ai_connection_rejects_blank_model_and_blank_new_key(client, test_database):
    _, token = create_account(test_database)
    client.cookies.set(settings.session_cookie_name, token)
    headers = {"Origin": settings.frontend_origin}

    blank_model = client.put(
        "/ai-connections",
        json=_payload(model="   "),
        headers=headers,
    )
    blank_key = client.put(
        "/ai-connections",
        json=_payload(model="another-model", api_key="   "),
        headers=headers,
    )

    assert blank_model.status_code == 422
    assert blank_key.status_code == 422
    with test_database() as db:
        assert db.query(AIConnection).count() == 0
