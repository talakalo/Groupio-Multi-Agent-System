"""Apply CRM projections from event envelopes (idempotent via crm_external_refs)."""

from __future__ import annotations

import logging
from typing import Any

from src.config.settings import get_settings
from src.databases.postgres import PostgresClient
from src.integrations.espocrm import mappers
from src.integrations.espocrm.client import EspoCRMClient
from src.integrations.espocrm.schema import EspoSchema

logger = logging.getLogger(__name__)


class EspoCRMService:
    def __init__(
        self,
        db: PostgresClient,
        client: EspoCRMClient | None = None,
        schema: EspoSchema | None = None,
    ) -> None:
        self._db = db
        self._client = client or EspoCRMClient.from_settings()
        self._schema = schema or EspoSchema.from_settings()

    async def handle_envelope(self, data: dict[str, Any]) -> None:
        if not get_settings().ENABLE_CRM_SYNC:
            return
        if not self._client.is_configured():
            logger.warning("CRM sync event skipped: EspoCRM not configured")
            return

        event_name = data.get("event_name") or ""
        entity_id = data.get("entity_id") or ""
        raw_payload = data.get("payload")
        payload: dict[str, Any] = raw_payload if isinstance(raw_payload, dict) else {}

        if event_name == "crm.contractor.registered" and entity_id:
            c = await self._db.get_contractor(entity_id)
            if not c:
                logger.warning("CRM contractor.registered: missing contractor %s", entity_id)
                return
            ref = await self._db.get_crm_external_ref("contractor", entity_id)
            attrs = mappers.contractor_to_crm_attributes(c, self._schema)
            etype = self._schema.entity_contractor
            if ref:
                await self._client.update_entity(ref["crm_entity_type"], ref["crm_id"], attrs)
            else:
                created = await self._client.create_entity(etype, attrs)
                crm_id = created.get("id") if isinstance(created, dict) else None
                if crm_id:
                    await self._db.upsert_crm_external_ref(
                        "contractor",
                        entity_id,
                        etype,
                        str(crm_id),
                    )
            return

        if event_name in ("crm.contractor.status_changed", "crm.contractor.documents_submitted") and entity_id:
            c = await self._db.get_contractor(entity_id)
            if not c:
                return
            ref = await self._db.get_crm_external_ref("contractor", entity_id)
            attrs = mappers.contractor_to_crm_attributes(c, self._schema)
            etype = self._schema.entity_contractor
            if ref:
                await self._client.update_entity(ref["crm_entity_type"], ref["crm_id"], attrs)
            else:
                created = await self._client.create_entity(etype, attrs)
                crm_id = created.get("id") if isinstance(created, dict) else None
                if crm_id:
                    await self._db.upsert_crm_external_ref(
                        "contractor",
                        entity_id,
                        etype,
                        str(crm_id),
                    )
            return

        if event_name == "crm.building.created" and entity_id:
            b = await self._db.get_building(entity_id)
            if not b:
                return
            ref = await self._db.get_crm_external_ref("building", entity_id)
            attrs = mappers.building_to_crm_attributes(b, self._schema)
            etype = self._schema.entity_building
            if ref:
                await self._client.update_entity(ref["crm_entity_type"], ref["crm_id"], attrs)
            else:
                created = await self._client.create_entity(etype, attrs)
                crm_id = created.get("id") if isinstance(created, dict) else None
                if crm_id:
                    await self._db.upsert_crm_external_ref(
                        "building",
                        entity_id,
                        etype,
                        str(crm_id),
                    )
            return

        if event_name == "crm.escalation.created":
            eid = payload.get("escalation_id") or entity_id
            if not eid:
                return
            esc = await self._db.get_escalation(str(eid))
            if not esc:
                return
            body = mappers.escalation_to_note_text(esc)
            await self._client.create_entity(
                self._schema.entity_note,
                {
                    "name": f"Escalation {eid}"[:255],
                    "post": body,
                    "type": "General",
                },
            )
            return

        logger.debug("CRM service: unhandled event_name=%s", event_name)
