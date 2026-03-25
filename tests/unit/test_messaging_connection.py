"""RabbitMQ connection helper (disabled by default)."""

import pytest

from src.config.settings import get_settings


@pytest.mark.asyncio
async def test_connect_returns_none_when_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_RABBITMQ", "false")
    get_settings.cache_clear()
    from src.messaging.connection import connect_rabbitmq_robust

    try:
        conn = await connect_rabbitmq_robust()
        assert conn is None
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_connect_returns_none_when_url_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_RABBITMQ", "true")
    monkeypatch.setenv("RABBITMQ_URL", "")
    get_settings.cache_clear()
    from src.messaging.connection import connect_rabbitmq_robust

    try:
        conn = await connect_rabbitmq_robust()
        assert conn is None
    finally:
        get_settings.cache_clear()
