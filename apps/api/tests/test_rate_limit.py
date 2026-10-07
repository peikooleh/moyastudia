from starlette.requests import Request

from app.rate_limit import FixedWindowRateLimiter, RateLimitPolicy, bucket_for, request_key


def test_rate_limiter_blocks_after_limit_and_returns_retry_after():
    limiter = FixedWindowRateLimiter({"write": RateLimitPolicy(2, 60)})

    assert limiter.check("write", "session:a", now=10) == (True, 50)
    assert limiter.check("write", "session:a", now=11) == (True, 49)
    allowed, retry_after = limiter.check("write", "session:a", now=12)

    assert allowed is False
    assert retry_after == 48


def test_rate_limiter_isolates_keys_and_resets_next_window():
    limiter = FixedWindowRateLimiter({"upload": RateLimitPolicy(1, 60)})

    assert limiter.check("upload", "session:a", now=59)[0] is True
    assert limiter.check("upload", "session:a", now=59)[0] is False
    assert limiter.check("upload", "session:b", now=59)[0] is True
    assert limiter.check("upload", "session:a", now=60)[0] is True


def _request(path, method="GET", cookie=""):
    headers = [(b"cookie", cookie.encode("ascii"))] if cookie else []
    return Request({
        "type": "http",
        "method": method,
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": headers,
        "scheme": "https",
        "server": ("testserver", 443),
        "client": ("203.0.113.10", 12345),
    })


def test_sensitive_routes_use_separate_rate_limit_buckets():
    assert bucket_for(_request("/auth/google/login")) == "oauth"
    assert bucket_for(_request("/channels/1/catalog/sync/continue", "POST")) == "provider"
    assert bucket_for(_request("/channels/1/videos/2/thumbnail", "PUT")) == "upload"
    assert bucket_for(_request("/channels/1/videos/2/publish-metadata", "POST")) == "write"
    assert bucket_for(_request("/ai/execute/title", "POST")) == "ai"
    assert bucket_for(_request("/channels/1/videos", "GET")) is None


def test_rate_limit_key_hashes_session_and_oauth_binding():
    session_request = _request("/", cookie="moyastudia_session=secret-session")
    oauth_request = _request("/", cookie="moya_oauth_123=secret-binding")

    session_key = request_key(session_request, "moyastudia_session")
    oauth_key = request_key(oauth_request, "moyastudia_session")

    assert session_key.startswith("session:") and "secret-session" not in session_key
    assert oauth_key.startswith("oauth:") and "secret-binding" not in oauth_key
