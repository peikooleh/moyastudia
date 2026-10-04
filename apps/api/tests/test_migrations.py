import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
import pytest


def test_foundation_migration_discards_prototype_records(tmp_path):
    database_path = tmp_path / "legacy.db"
    database_url = "sqlite:///" + str(database_path).replace("\\", "/")
    legacy_engine = create_engine(database_url)
    with legacy_engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE channels (id INTEGER PRIMARY KEY, refresh_token TEXT)")
        )
        connection.execute(
            text("CREATE TABLE videos (id INTEGER PRIMARY KEY, channel_id INTEGER)")
        )
        connection.execute(
            text("INSERT INTO channels (id, refresh_token) VALUES (1, 'prototype-token')")
        )

    api_dir = os.path.dirname(os.path.dirname(__file__))
    config = Config(os.path.join(api_dir, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(api_dir, "migrations"))
    config.set_main_option("prepend_sys_path", api_dir)
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")

    migrated_engine = create_engine(database_url)
    inspector = inspect(migrated_engine)
    assert {
        "users",
        "identities",
        "google_connections",
        "channels",
        "videos",
        "user_sessions",
        "oauth_states",
        "youtube_quota_usage",
    } <= set(inspector.get_table_names())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    assert "write_mode_enabled" in user_columns
    video_columns = {column["name"] for column in inspector.get_columns("videos")}
    assert {"language", "working_base_language"} <= video_columns
    assert "refresh_token" not in {
        column["name"] for column in inspector.get_columns("channels")
    }
    with migrated_engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM channels")).scalar_one() == 0
    command.check(config)
    migrated_engine.dispose()
    legacy_engine.dispose()


def test_video_catalog_migration_preserves_existing_video_rows(tmp_path):
    database_path = tmp_path / "catalog.db"
    database_url = "sqlite:///" + str(database_path).replace("\\", "/")
    api_dir = os.path.dirname(os.path.dirname(__file__))
    config = Config(os.path.join(api_dir, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(api_dir, "migrations"))
    config.set_main_option("prepend_sys_path", api_dir)
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "0001_foundation")

    legacy_engine = create_engine(database_url)
    with legacy_engine.begin() as connection:
        connection.execute(
            text("INSERT INTO users (id) VALUES ('user-one')")
        )
        connection.execute(
            text(
                "INSERT INTO google_connections "
                "(id, user_id, google_subject, encrypted_refresh_token) "
                "VALUES (1, 'user-one', 'google-one', 'encrypted')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO channels (id, google_connection_id, youtube_channel_id) "
                "VALUES (1, 1, 'youtube-one')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO videos "
                "(id, channel_id, youtube_video_id, internal_status, title, description, tags) "
                "VALUES (7, 1, 'existing-video', 'DRAFT', 'Working title', 'Working description', 'tag')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO videos "
                "(id, channel_id, youtube_video_id, internal_status, title, description, tags) "
                "VALUES (8, 1, 'imported-video', 'DRAFT', '', '', '')"
            )
        )

    command.upgrade(config, "0002_video_catalog")
    with legacy_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE videos SET youtube_title = 'Snapshot title', "
                "youtube_description = 'Snapshot description', "
                "youtube_tags = '[\"snapshot\", \"tags\"]' WHERE id = 7"
            )
        )
        connection.execute(
            text(
                "UPDATE videos SET youtube_title = 'Imported title', "
                "youtube_description = 'Imported description', "
                "youtube_tags = '[\"imported\"]' WHERE id = 8"
            )
        )

    command.upgrade(config, "head")
    migrated_engine = create_engine(database_url)
    inspector = inspect(migrated_engine)
    video_columns = {column["name"]: column for column in inspector.get_columns("videos")}
    assert video_columns["internal_status"]["nullable"] is True
    assert video_columns["title"]["nullable"] is True
    assert str(video_columns["title"]["type"]).upper() == "TEXT"
    assert str(video_columns["working_base_title"]["type"]).upper() == "VARCHAR(255)"
    assert str(video_columns["youtube_title"]["type"]).upper() == "VARCHAR(255)"
    assert video_columns["description"]["nullable"] is True
    assert video_columns["tags"]["nullable"] is True
    assert "youtube_title" in video_columns
    assert "working_base_title" in video_columns
    assert "working_base_description" in video_columns
    assert "working_base_tags" in video_columns
    assert video_columns["working_ready"]["nullable"] is False
    assert "working_revision" in video_columns
    assert "availability_status" in video_columns
    assert "channel_catalog_syncs" in inspector.get_table_names()
    with migrated_engine.connect() as connection:
        video = connection.execute(
            text(
                "SELECT id, channel_id, youtube_video_id, internal_status, title, description, tags "
                "FROM videos WHERE id = 7"
            )
        ).one()
        assert tuple(video) == (
            7,
            1,
            "existing-video",
            "DRAFT",
            "Working title",
            "Working description",
            "tag",
        )
        assert connection.execute(
            text("SELECT COUNT(*) FROM channel_catalog_syncs")
        ).scalar_one() == 0
        assert connection.execute(
            text(
                "SELECT title, description, tags, working_base_title, "
                "working_base_description, working_base_tags, working_ready, working_revision "
                "FROM videos WHERE id = 7"
            )
        ).one() == (
            "Working title",
            "Working description",
            "tag",
            "Snapshot title",
            "Snapshot description",
            "snapshot, tags",
            False,
            0,
        )
        assert connection.execute(
            text("SELECT title, description, tags, working_ready, working_revision FROM videos WHERE id = 8")
        ).one() == (None, None, None, False, 0)
    command.check(config)
    migrated_engine.dispose()

    command.downgrade(config, "0003_video_working_state")
    downgraded_readiness_engine = create_engine(database_url)
    assert "working_ready" not in {
        column["name"] for column in inspect(downgraded_readiness_engine).get_columns("videos")
    }
    downgraded_readiness_engine.dispose()

    command.upgrade(config, "head")
    reupgraded_engine = create_engine(database_url)
    assert "working_ready" in {
        column["name"] for column in inspect(reupgraded_engine).get_columns("videos")
    }
    with reupgraded_engine.connect() as connection:
        assert bool(connection.execute(
            text("SELECT working_ready FROM videos WHERE id = 7")
        ).scalar_one()) is False
    reupgraded_engine.dispose()

    with migrated_engine.begin() as connection:
        connection.execute(text("UPDATE videos SET title = :title WHERE id = 7"), {"title": "x" * 300})
    with pytest.raises(RuntimeError, match="longer titles exist"):
        command.downgrade(config, "0004_video_working_readiness")
    with migrated_engine.begin() as connection:
        connection.execute(text("UPDATE videos SET title = 'Working title' WHERE id = 7"))

    command.downgrade(config, "0001_foundation")
    downgraded_engine = create_engine(database_url)
    downgraded_inspector = inspect(downgraded_engine)
    assert "channel_catalog_syncs" not in downgraded_inspector.get_table_names()
    downgraded_columns = {
        column["name"]: column for column in downgraded_inspector.get_columns("videos")
    }
    assert "youtube_title" not in downgraded_columns
    assert downgraded_columns["internal_status"]["nullable"] is False
    with downgraded_engine.connect() as connection:
        assert connection.execute(
            text("SELECT internal_status FROM videos WHERE id = 7")
        ).scalar_one() == "DRAFT"
    downgraded_engine.dispose()
    legacy_engine.dispose()