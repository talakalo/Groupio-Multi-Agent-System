# EspoCRM operational contract (Groupio async CRM worker)

This document is the **admin/setup checklist** when no live Espo instance is available for automated verification. The worker `worker_crm_sync` calls Espo’s REST API with **API key** auth (`X-Api-Key`). Groupio DB remains authoritative; Espo is a projection.

## Environment (must match Espo)

Configure in `.env` / `docker/staging-minimal.env` (see `src/config/settings.py`):

| Setting | Purpose |
|---------|---------|
| `ESPOCRM_BASE_URL` | Base URL, no trailing slash, e.g. `https://crm.example.com` |
| `ESPOCRM_API_KEY` | Espo “API Key” user credential |
| `ESPOCRM_ENTITY_CONTRACTOR` | REST entity path segment, default `C_GroupioContractor` |
| `ESPOCRM_ENTITY_BUILDING` | default `C_GroupioBuilding` |
| `ESPOCRM_ENTITY_NOTE` | default `Note` |
| `ESPOCRM_FIELD_*` | JSON attribute keys on create/PATCH bodies |

## Espo Admin: entity types

Create **custom entity types** (or map settings to native types such as `Account`) so that:

1. **Contractor** entity exposes:
   - `name` (string, required by Groupio mapper)
   - Configured `ESPOCRM_FIELD_CONTRACTOR_EXTERNAL_ID` — stores stable Groupio contractor UUID (string, **unique** in Espo if you enforce it)
   - Configured `ESPOCRM_FIELD_CONTRACTOR_VERIFICATION` — string
   - Optional: `emailAddress`, `phoneNumber`, `description` (sent when present on Groupio row)

2. **Building** entity exposes:
   - `name`
   - `ESPOCRM_FIELD_BUILDING_EXTERNAL_ID` — Groupio building id
   - `ESPOCRM_FIELD_BUILDING_ADDRESS`, `_CITY`, `_REGION`

3. **Note** entity (for escalations):
   - `name`, `post` (body text), `type` (Groupio sends `"General"`)

**Linking**: Escalation notes are created as standalone Notes. If you need `parentType` / `parentId` links, extend `EspoCRMService.handle_envelope` in a future pass; not required for idempotent external-ref flow on contractor/building.

## REST paths used

- `POST {BASE}/api/v1/{entity_type}` — create
- `PATCH {BASE}/api/v1/{entity_type}/{id}` — update

## Sample JSON bodies (contractor create)

Replace field names with your configured `ESPOCRM_FIELD_*` values:

```json
{
  "name": "ACME Plumbing",
  "cGroupioContractorId": "uuid-from-groupio",
  "cGroupioVerificationStatus": "pending",
  "emailAddress": "a@example.com",
  "phoneNumber": "0500000000",
  "description": "optional"
}
```

## Sample JSON bodies (building create)

```json
{
  "name": "Tower A",
  "cGroupioBuildingId": "uuid-from-groupio",
  "cGroupioAddress": "1 Main St",
  "cGroupioCity": "Tel Aviv",
  "cGroupioRegion": "center"
}
```

## Idempotency / `crm_external_refs`

- First successful create stores `(entity_type, groupio_id) → (crm_entity_type, crm_id)` in Postgres.
- Subsequent events **PATCH** the same Espo id. Deleting rows in Espo without cleaning `crm_external_refs` can cause duplicate creates or errors — operators should avoid orphaning mappings.

## Live verification (when Espo is available)

1. `curl -sS -H "X-Api-Key: $KEY" "$BASE/api/v1/$ESPOCRM_ENTITY_CONTRACTOR" -X OPTIONS` or GET list if allowed.
2. Create one test record with the sample contractor JSON; confirm 200 and returned `id`.
3. Run Groupio with `ENABLE_OUTBOX=true`, `ENABLE_CRM_SYNC=true`, register a test contractor; confirm worker logs and Espo row + `crm_external_refs` row.

## Rate limits / backoff

The client uses a fixed **30s** HTTP timeout (`src/integrations/espocrm/client.py`). There is **no** automatic exponential backoff on CRM API errors; failures cause the consumer to **nack without requeue** → message goes to **DLQ** (`crm.dlq`). Reduce load by scaling consumers down, fixing Espo, then requeue/move DLQ messages after the incident.
