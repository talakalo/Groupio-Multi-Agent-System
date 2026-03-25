"""Event envelope schema."""

from src.messaging.envelope import CURRENT_EVENT_VERSION, EventEnvelope


def test_envelope_roundtrip_json_dict() -> None:
    e = EventEnvelope(
        event_name="test.event",
        entity_type="offer",
        entity_id="abc",
        idempotency_key="k:1",
        payload={"x": 1},
    )
    d = e.to_json_dict()
    assert d["event_name"] == "test.event"
    assert d["event_version"] == CURRENT_EVENT_VERSION
    assert d["payload"]["x"] == 1
    e2 = EventEnvelope.from_dict(d)
    assert e2.event_id == e.event_id


def test_envelope_from_dict() -> None:
    raw = {
        "event_id": "e1",
        "event_name": "crm.contractor.registered",
        "event_version": 1,
        "occurred_at": "2026-03-25T12:00:00Z",
        "idempotency_key": None,
        "source": "groupio-api",
        "entity_type": "contractor",
        "entity_id": "c1",
        "payload": {},
    }
    e = EventEnvelope.from_dict(raw)
    assert e.entity_id == "c1"
