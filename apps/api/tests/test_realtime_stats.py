from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app import realtime_stats


def _snapshot(views, captured_at):
    return SimpleNamespace(view_count=views, captured_at=captured_at)


def test_regular_realtime_samples_are_stored_even_when_views_do_not_change():
    now = datetime(2026, 10, 11, 17, 0, tzinfo=timezone.utc)
    latest = _snapshot(38680, now - timedelta(minutes=5))

    assert realtime_stats._should_store(latest, 38680, now) is True


def test_realtime_sample_is_not_duplicated_inside_collection_interval():
    now = datetime(2026, 10, 11, 17, 0, tzinfo=timezone.utc)
    latest = _snapshot(38680, now - timedelta(minutes=2))

    assert realtime_stats._should_store(latest, 38687, now) is False


def test_realtime_samples_support_zero_and_nonzero_adjacent_deltas():
    samples = [38680, 38680, 38687, 38692]
    deltas = [max(0, current - previous) for previous, current in zip(samples, samples[1:])]

    assert deltas == [0, 7, 5]
    assert samples[-1] - samples[0] == 12
