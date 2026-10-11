import asyncio

import vercel_entry


def test_vercel_adapter_strips_public_api_prefix(monkeypatch):
    captured = []

    async def fake_app(scope, receive, send):
        captured.append((scope["path"], scope["raw_path"]))

    monkeypatch.setattr(vercel_entry, "fastapi_app", fake_app)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        pass

    for path in ("/api/health", "/api/auth/session", "/api", "/health", "/apiary"):
        scope = {"type": "http", "path": path, "raw_path": path.encode()}
        asyncio.run(vercel_entry.app(scope, receive, send))

    assert captured == [
        ("/health", b"/health"),
        ("/auth/session", b"/auth/session"),
        ("/", b"/"),
        ("/health", b"/health"),
        ("/apiary", b"/apiary"),
    ]
