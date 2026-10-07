from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


@dataclass(frozen=True)
class RateLimitPolicy:
    requests: int
    window_seconds: int


POLICIES = {
    "oauth": RateLimitPolicy(20, 60),
    "provider": RateLimitPolicy(120, 60),
    "write": RateLimitPolicy(60, 60),
    "upload": RateLimitPolicy(20, 60),
    # Reserved for future AI execution routes; connection settings are not AI execution.
    "ai": RateLimitPolicy(20, 60),
}


class FixedWindowRateLimiter:
    def __init__(self, policies: dict[str, RateLimitPolicy] | None = None):
        self.policies = policies or POLICIES
        self._entries: dict[tuple[str, str], tuple[int, int]] = {}
        self._lock = threading.Lock()

    def check(self, bucket: str, key: str, *, now: float | None = None) -> tuple[bool, int]:
        policy = self.policies[bucket]
        current = int(time.monotonic() if now is None else now)
        window = current // policy.window_seconds
        entry_key = (bucket, key)
        with self._lock:
            previous_window, count = self._entries.get(entry_key, (window, 0))
            if previous_window != window:
                count = 0
            count += 1
            self._entries[entry_key] = (window, count)
            if len(self._entries) > 10000:
                self._entries = {
                    item_key: value
                    for item_key, value in self._entries.items()
                    if value[0] >= window - 1
                }
        retry_after = policy.window_seconds - (current % policy.window_seconds)
        return count <= policy.requests, max(1, retry_after)


def bucket_for(request: Request) -> str | None:
    path = request.url.path
    method = request.method.upper()
    if path.startswith(("/auth/google/", "/auth/youtube/")):
        return "oauth"
    if path.startswith("/ai/execute"):
        return "ai"
    if path.endswith("/thumbnail") or path.endswith("/captions"):
        return "upload"
    if (
        "/catalog/sync" in path
        or path.endswith("/refresh-profile")
        or path.endswith("/available-channels")
        or path.endswith("/playlist-memberships")
    ):
        return "provider"
    if method in {"POST", "PUT", "PATCH", "DELETE"} and (
        path == "/write-mode"
        or path.startswith("/channels/")
        or path.startswith("/google-connections/")
    ):
        return "write"
    return None


def request_key(request: Request, session_cookie_name: str) -> str:
    session = request.cookies.get(session_cookie_name, "")
    if session:
        return "session:" + hashlib.sha256(session.encode("utf-8")).hexdigest()
    host = request.client.host if request.client else "unknown"
    return "client:" + host


class AbuseRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, session_cookie_name: str, limiter: FixedWindowRateLimiter | None = None):
        super().__init__(app)
        self.session_cookie_name = session_cookie_name
        self.limiter = limiter or FixedWindowRateLimiter()

    async def dispatch(self, request: Request, call_next):
        bucket = bucket_for(request)
        if bucket is not None:
            allowed, retry_after = self.limiter.check(
                bucket, request_key(request, self.session_cookie_name)
            )
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={"detail": {"code": "rate_limited", "bucket": bucket}},
                    headers={"Retry-After": str(retry_after)},
                )
        return await call_next(request)
