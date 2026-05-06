"""Unit tests for ``worker_crm_sync`` consumer + EspoCRMService.handle_envelope.

The release audit noted the CRM worker was "log-only". In reality it hands
the envelope to ``EspoCRMService.handle_envelope`` which does call the real
EspoCRM HTTP client; the missing piece was test coverage. These tests pin the
dispatch behaviour end-to-end with the HTTP client mocked.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.integrations.espocrm.schema import EspoSchema
from src.integrations.espocrm.service import EspoCRMService
from src.workers.worker_crm_sync import _process_envelope


def _schema() -> EspoSchema:
    return EspoSchema(
        entity_contractor="GroupioContractor",
        entity_building="GroupioBuilding",
        entity_note="Note",
        field_contractor_external_id="cGroupioContractorId",
        field_contractor_verification="cGroupioVerificationStatus",
        field_building_external_id="cGroupioBuildingId",
        field_building_address="cGroupioAddress",
        field_building_city="cGroupioCity",
        field_building_region="cGroupioRegion",
    )


def _enabled_settings() -> MagicMock:
    s = MagicMock()
    s.ENABLE_CRM_SYNC = True
    return s


@pytest.mark.asyncio
async def test_service_skips_when_crm_disabled() -> None:
    db = AsyncMock()
    client = MagicMock()
    client.is_configured = MagicMock(return_value=True)
    svc = EspoCRMService(db=db, client=client, schema=_schema())

    fake_settings = MagicMock()
    fake_settings.ENABLE_CRM_SYNC = False
    with patch("src.integrations.espocrm.service.get_settings", return_value=fake_settings):
        await svc.handle_envelope({"event_name": "crm.contractor.registered", "entity_id": "c1"})

    db.get_contractor.assert_not_called()
    client.create_entity.assert_not_called()


@pytest.mark.asyncio
async def test_service_skips_when_client_not_configured() -> None:
    db = AsyncMock()
    client = MagicMock()
    client.is_configured = MagicMock(return_value=False)
    client.create_entity = AsyncMock()
    svc = EspoCRMService(db=db, client=client, schema=_schema())

    with patch("src.integrations.espocrm.service.get_settings", return_value=_enabled_settings()):
        await svc.handle_envelope({"event_name": "crm.contractor.registered", "entity_id": "c1"})

    client.create_entity.assert_not_called()


@pytest.mark.asyncio
async def test_service_creates_contractor_and_upserts_ref_when_no_existing_ref() -> None:
    db = AsyncMock()
    db.get_contractor = AsyncMock(return_value={"id": "c1", "name": "Acme", "category": "gardening"})
    db.get_crm_external_ref = AsyncMock(return_value=None)
    db.upsert_crm_external_ref = AsyncMock()

    client = MagicMock()
    client.is_configured = MagicMock(return_value=True)
    client.create_entity = AsyncMock(return_value={"id": "crm-42"})
    client.update_entity = AsyncMock()

    svc = EspoCRMService(db=db, client=client, schema=_schema())

    with patch("src.integrations.espocrm.service.get_settings", return_value=_enabled_settings()):
        await svc.handle_envelope({"event_name": "crm.contractor.registered", "entity_id": "c1"})

    client.create_entity.assert_awaited_once()
    client.update_entity.assert_not_called()
    db.upsert_crm_external_ref.assert_awaited_once_with("contractor", "c1", "GroupioContractor", "crm-42")


@pytest.mark.asyncio
async def test_service_updates_contractor_when_ref_exists() -> None:
    db = AsyncMock()
    db.get_contractor = AsyncMock(return_value={"id": "c1", "name": "Acme"})
    db.get_crm_external_ref = AsyncMock(return_value={"crm_entity_type": "GroupioContractor", "crm_id": "crm-old"})

    client = MagicMock()
    client.is_configured = MagicMock(return_value=True)
    client.create_entity = AsyncMock()
    client.update_entity = AsyncMock(return_value={"id": "crm-old"})

    svc = EspoCRMService(db=db, client=client, schema=_schema())

    with patch("src.integrations.espocrm.service.get_settings", return_value=_enabled_settings()):
        await svc.handle_envelope({"event_name": "crm.contractor.status_changed", "entity_id": "c1"})

    client.update_entity.assert_awaited_once()
    client.create_entity.assert_not_called()


@pytest.mark.asyncio
async def test_service_ignores_unknown_event_without_crashing() -> None:
    db = AsyncMock()
    client = MagicMock()
    client.is_configured = MagicMock(return_value=True)
    client.create_entity = AsyncMock()
    svc = EspoCRMService(db=db, client=client, schema=_schema())

    with patch("src.integrations.espocrm.service.get_settings", return_value=_enabled_settings()):
        await svc.handle_envelope({"event_name": "crm.totally.unknown", "entity_id": "whatever"})

    client.create_entity.assert_not_called()


@pytest.mark.asyncio
async def test_service_skips_missing_contractor() -> None:
    db = AsyncMock()
    db.get_contractor = AsyncMock(return_value=None)

    client = MagicMock()
    client.is_configured = MagicMock(return_value=True)
    client.create_entity = AsyncMock()
    svc = EspoCRMService(db=db, client=client, schema=_schema())

    with patch("src.integrations.espocrm.service.get_settings", return_value=_enabled_settings()):
        await svc.handle_envelope({"event_name": "crm.contractor.registered", "entity_id": "missing"})

    client.create_entity.assert_not_called()


@pytest.mark.asyncio
async def test_worker_wrapper_increments_ok_on_success() -> None:
    svc = MagicMock()
    svc.handle_envelope = AsyncMock()
    with patch("src.workers.worker_crm_sync.messaging_consumer_messages_total") as metric:
        metric.labels = MagicMock(return_value=MagicMock(inc=MagicMock()))
        await _process_envelope(svc, {"event_name": "crm.contractor.registered"})

    metric.labels.assert_called_with(worker="crm_sync", result="ok")
    svc.handle_envelope.assert_awaited_once()


@pytest.mark.asyncio
async def test_worker_wrapper_reraises_on_handler_exception() -> None:
    svc = MagicMock()
    svc.handle_envelope = AsyncMock(side_effect=RuntimeError("boom"))

    with pytest.raises(RuntimeError, match="boom"):
        await _process_envelope(svc, {"event_name": "crm.contractor.registered"})
