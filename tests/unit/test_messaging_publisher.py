"""Publisher behavior when broker disabled."""

import pytest

from src.config.settings import get_settings
from src.messaging.envelope import EventEnvelope
from src.messaging.publisher import publish_event, publish_json_raw


@pytest.mark.asyncio
async def test_publish_event_noop_when_rabbitmq_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_RABBITMQ", "false")
    get_settings.cache_clear()
    try:
        env = EventEnvelope(event_name="x", payload={})
        ok = await publish_event("notifications.send_requested", env)
        assert ok is True
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_publish_json_raw_false_when_rabbitmq_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_RABBITMQ", "false")
    get_settings.cache_clear()
    try:
        ok = await publish_json_raw("notifications.send_requested", {"a": 1})
        assert ok is False
    finally:
        get_settings.cache_clear()
