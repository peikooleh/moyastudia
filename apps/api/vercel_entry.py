"""Vercel Services adapter for the public /api URL prefix.

Vercel's service rewrites preserve the original path, while the local FastAPI
application exposes routes without that prefix. Keep this adapter isolated so
local Uvicorn continues to use app.main:app unchanged.
"""

from app.main import app as fastapi_app


async def app(scope, receive, send):
    if scope["type"] in {"http", "websocket"}:
        path = scope.get("path", "")
        if path == "/api" or path.startswith("/api/"):
            scope = dict(scope)
            scope["path"] = path[4:] or "/"
            raw_path = scope.get("raw_path")
            if isinstance(raw_path, bytes) and (raw_path == b"/api" or raw_path.startswith(b"/api/")):
                scope["raw_path"] = raw_path[4:] or b"/"
    await fastapi_app(scope, receive, send)
