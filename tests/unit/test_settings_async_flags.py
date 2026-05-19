"""Feature flags for RabbitMQ / outbox / CRM (defaults safe/off)."""

import os
from unittest.mock import patch

from src.config.settings import Settings

# Env vars that override the .env file to ensure we test Pydantic defaults.
_ASYNC_FLAGS_OFF = {
    "ENABLE_RABBITMQ": "false",
    "ENABLE_OUTBOX": "false",
    "ENABLE_NOTIFICATION_QUEUE": "false",
    "ENABLE_CRM_SYNC": "false",
    "ENABLE_PAYMENT_EVENTS": "false",
    "RABBITMQ_URL": "",
    "ESPOCRM_BASE_URL": "",
    "ESPOCRM_API_KEY": "",
}


def test_async_flags_default_false() -> None:
    with patch.dict(os.environ, _ASYNC_FLAGS_OFF):
        s = Settings(ENVIRONMENT="development")
    assert s.ENABLE_RABBITMQ is False
    assert s.ENABLE_OUTBOX is False
    assert s.ENABLE_NOTIFICATION_QUEUE is False
    assert s.ENABLE_CRM_SYNC is False
    assert s.ENABLE_PAYMENT_EVENTS is False


def test_async_config_placeholders() -> None:
    with patch.dict(os.environ, _ASYNC_FLAGS_OFF):
        s = Settings(ENVIRONMENT="development")
    assert s.RABBITMQ_EXCHANGE_EVENTS == "groupio.events"
    assert s.OUTBOX_POLL_INTERVAL_MS == 500
    assert s.RABBITMQ_URL == ""
    assert s.ESPOCRM_BASE_URL == ""
    assert s.ESPOCRM_API_KEY == ""


def test_async_flags_can_enable_explicitly() -> None:
    s = Settings(
        ENVIRONMENT="development",
        ENABLE_RABBITMQ=True,
        ENABLE_OUTBOX=True,
        ENABLE_NOTIFICATION_QUEUE=True,
        RABBITMQ_URL="amqp://guest:guest@localhost:5672/",
    )
    assert s.ENABLE_RABBITMQ is True
    assert s.ENABLE_OUTBOX is True
    assert s.ENABLE_NOTIFICATION_QUEUE is True
