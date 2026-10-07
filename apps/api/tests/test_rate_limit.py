from app.rate_limit import FixedWindowRateLimiter, RateLimitPolicy


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
