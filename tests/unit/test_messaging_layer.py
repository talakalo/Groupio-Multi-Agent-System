"""Unit tests for ``src/messaging/*`` so the layer can come off the coverage
omit list.

Avoids a real broker by injecting a fake ``aio_pika`` module into
``sys.modules`` before the publisher / topology code imports it. The shape
of that fake mirrors what the production code actually calls; anything
extra (retries, DLQ binding) is still exercised via the fake.
"""

from __future__ import annotations

import sys
import types
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# aio_pika fake
# ---------------------------------------------------------------------------


class _FakeMessage:
    def __init__(self, body: bytes, content_type: str, delivery_mode: Any) -> None:
        self.body = body
        self.content_type = content_type
        self.delivery_mode = delivery_mode


class _FakeExchange:
    def __init__(self) -> None:
        self.publish = AsyncMock()
        self.bindings: list[tuple[str, str]] = []


class _FakeQueue:
    def __init__(self, name: str, arguments: dict[str, Any] | None) -> None:
        self.name = name
        self.arguments = arguments
        self.bind = AsyncMock()


class _FakeChannel:
    def __init__(self) -> None:
        self.exchanges: dict[str, _FakeExchange] = {}
        self.queues: dict[str, _FakeQueue] = {}

    async def declare_exchange(self, name: str, _type: Any, durable: bool = False) -> _FakeExchange:
        if name not in self.exchanges:
            self.exchanges[name] = _FakeExchange()
        return self.exchanges[name]

    async def declare_queue(
        self, name: str, durable: bool = False, arguments: dict[str, Any] | None = None,
        passive: bool = False,
    ) -> _FakeQueue:
        if name not in self.queues:
            self.queues[name] = _FakeQueue(name, arguments)
        return self.queues[name]

    async def set_qos(self, prefetch_count: int) -> None:
        return None


class _FakeConnection:
    def __init__(self) -> None:
        self._channel = _FakeChannel()
        self.closed = False

    async def __aenter__(self) -> "_FakeConnection":
        return self

    async def __aexit__(self, *_: object) -> bool:
        self.closed = True
        return False

    async def channel(self) -> _FakeChannel:
        return self._channel

    async def close(self) -> None:
        self.closed = True


class _FakeExchangeType:
    TOPIC = "topic"
    FANOUT = "fanout"


class _FakeDeliveryMode:
    PERSISTENT = 2


@pytest.fixture()
def fake_aio_pika(monkeypatch: pytest.MonkeyPatch):
    """Inject a fake ``aio_pika`` module so the publisher / topology code
    runs without the real broker package."""
    mod = types.ModuleType("aio_pika")
    mod.ExchangeType = _FakeExchangeType  # type: ignore[attr-defined]
    mod.DeliveryMode = _FakeDeliveryMode  # type: ignore[attr-defined]
    mod.Message = _FakeMessage  # type: ignore[attr-defined]
    mod.connect_robust = AsyncMock(return_value=_FakeConnection())  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "aio_pika", mod)
    yield mod


def _settings(enable_rabbit: bool = True, url: str = "amqp://guest:guest@localhost:5672/") -> MagicMock:
    s = MagicMock()
    s.ENABLE_RABBITMQ = enable_rabbit
    s.RABBITMQ_URL = url
    s.RABBITMQ_EXCHANGE_EVENTS = "groupio.events"
    return s


# ---------------------------------------------------------------------------
# Constants — trivial but explicit so a rename breaks tests instead of prod
# ---------------------------------------------------------------------------


def test_constants_pin_expected_names() -> None:
    from src.messaging import constants as c

    assert c.DEFAULT_EXCHANGE_EVENTS == "groupio.events"
    assert c.QUEUE_NOTIFICATIONS_DISPATCH == "notifications.dispatch"
    assert c.QUEUE_CRM_SYNC == "crm.sync"
    assert c.QUEUE_PAYMENTS_EVENTS == "payments.events"
    assert c.DLX_NOTIFICATIONS.endswith(".dlx")
    assert c.DLX_CRM.endswith(".dlx")
    assert c.DLX_PAYMENTS.endswith(".dlx")


# ---------------------------------------------------------------------------
# connection.connect_rabbitmq_robust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_returns_none_when_rabbit_disabled() -> None:
    from src.messaging.connection import connect_rabbitmq_robust

    with patch("src.messaging.connection.get_settings", return_value=_settings(enable_rabbit=False)):
        result = await connect_rabbitmq_robust()
    assert result is None


@pytest.mark.asyncio
async def test_connect_returns_none_when_url_empty() -> None:
    from src.messaging.connection import connect_rabbitmq_robust

    with patch("src.messaging.connection.get_settings", return_value=_settings(url="")):
        result = await connect_rabbitmq_robust()
    assert result is None


@pytest.mark.asyncio
async def test_connect_returns_connection_when_enabled(fake_aio_pika) -> None:
    from src.messaging.connection import connect_rabbitmq_robust

    with patch("src.messaging.connection.get_settings", return_value=_settings()):
        result = await connect_rabbitmq_robust()
    assert result is not None
    fake_aio_pika.connect_robust.assert_awaited_once()


@pytest.mark.asyncio
async def test_connect_returns_none_when_broker_rejects(fake_aio_pika) -> None:
    from src.messaging.connection import connect_rabbitmq_robust

    fake_aio_pika.connect_robust = AsyncMock(side_effect=ConnectionError("nope"))
    with patch("src.messaging.connection.get_settings", return_value=_settings()):
        result = await connect_rabbitmq_robust()
    assert result is None


# ---------------------------------------------------------------------------
# publisher.publish_event
# ---------------------------------------------------------------------------


def _envelope(event_name: str = "offers.joined") -> Any:
    from src.messaging.envelope import EventEnvelope

    return EventEnvelope(
        event_name=event_name,
        entity_type="offer",
        entity_id="off-1",
        payload={"x": 1},
    )


@pytest.mark.asyncio
async def test_publish_event_no_op_success_when_disabled() -> None:
    from src.messaging.publisher import publish_event

    with patch("src.messaging.publisher.get_settings", return_value=_settings(enable_rabbit=False)):
        ok = await publish_event("notifications.send_requested", _envelope())
    assert ok is True, "disabled broker must not look like a failure to callers"


@pytest.mark.asyncio
async def test_publish_event_returns_false_when_url_empty() -> None:
    from src.messaging.publisher import publish_event

    with patch("src.messaging.publisher.get_settings", return_value=_settings(url="")):
        ok = await publish_event("rk", _envelope())
    assert ok is False


@pytest.mark.asyncio
async def test_publish_event_sends_persistent_message(fake_aio_pika) -> None:
    from src.messaging.publisher import publish_event

    fake_conn = _FakeConnection()
    fake_aio_pika.connect_robust = AsyncMock(return_value=fake_conn)

    with patch("src.messaging.publisher.get_settings", return_value=_settings()):
        ok = await publish_event("notifications.send_requested", _envelope())

    assert ok is True
    exchange = fake_conn._channel.exchanges["groupio.events"]
    exchange.publish.assert_awaited_once()
    msg_arg = exchange.publish.await_args.args[0]
    assert msg_arg.content_type == "application/json"
    assert msg_arg.delivery_mode == _FakeDeliveryMode.PERSISTENT


@pytest.mark.asyncio
async def test_publish_event_returns_false_when_broker_raises(fake_aio_pika) -> None:
    from src.messaging.publisher import publish_event

    fake_aio_pika.connect_robust = AsyncMock(side_effect=RuntimeError("boom"))
    with patch("src.messaging.publisher.get_settings", return_value=_settings()):
        ok = await publish_event("rk", _envelope())
    assert ok is False


@pytest.mark.asyncio
async def test_publish_json_raw_returns_false_when_disabled() -> None:
    from src.messaging.publisher import publish_json_raw

    # Critical: publish_json_raw MUST NOT pretend success when disabled,
    # otherwise the outbox dispatcher marks rows published without a broker.
    with patch("src.messaging.publisher.get_settings", return_value=_settings(enable_rabbit=False)):
        ok = await publish_json_raw("rk", {"event_name": "x"})
    assert ok is False


@pytest.mark.asyncio
async def test_publish_json_raw_publishes_when_enabled(fake_aio_pika) -> None:
    from src.messaging.publisher import publish_json_raw

    fake_conn = _FakeConnection()
    fake_aio_pika.connect_robust = AsyncMock(return_value=fake_conn)
    with patch("src.messaging.publisher.get_settings", return_value=_settings()):
        ok = await publish_json_raw("notifications.send_requested", {"a": 1})
    assert ok is True
    exchange = fake_conn._channel.exchanges["groupio.events"]
    exchange.publish.assert_awaited_once()


# ---------------------------------------------------------------------------
# topology.declare_*
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_declare_core_topology_binds_notifications(fake_aio_pika) -> None:
    from src.messaging import topology as topo

    chan = _FakeChannel()
    with patch.object(topo, "get_settings", return_value=_settings()):
        await topo.declare_core_topology(chan)

    assert "groupio.events" in chan.exchanges
    assert "notifications.dispatch" in chan.queues
    assert "notifications.dlq" in chan.queues
    main_q = chan.queues["notifications.dispatch"]
    main_q.bind.assert_awaited_with(chan.exchanges["groupio.events"], routing_key="notifications.send_requested")


@pytest.mark.asyncio
async def test_declare_crm_topology_binds_all_routing_keys(fake_aio_pika) -> None:
    from src.messaging import topology as topo

    chan = _FakeChannel()
    with patch.object(topo, "get_settings", return_value=_settings()):
        await topo.declare_crm_topology(chan)

    q = chan.queues["crm.sync"]
    bound_keys = {call.kwargs.get("routing_key") for call in q.bind.await_args_list}
    assert {
        "crm.contractor.registered",
        "crm.contractor.status_changed",
        "crm.contractor.documents_submitted",
        "crm.building.created",
        "crm.building.activated",
        "crm.escalation.created",
    }.issubset(bound_keys)


@pytest.mark.asyncio
async def test_declare_payments_topology_binds_payment_events(fake_aio_pika) -> None:
    from src.messaging import topology as topo

    chan = _FakeChannel()
    with patch.object(topo, "get_settings", return_value=_settings()):
        await topo.declare_payments_topology(chan)

    q = chan.queues["payments.events"]
    bound_keys = {call.kwargs.get("routing_key") for call in q.bind.await_args_list}
    assert {"payments.succeeded", "payments.failed", "payments.refund_processed", "invoices.created"}.issubset(
        bound_keys
    )
