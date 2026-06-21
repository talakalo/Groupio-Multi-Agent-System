"""Unit tests for the webhooks API routes."""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient


def _whatsapp_sig(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# GET /webhooks/whatsapp (verification)
# ---------------------------------------------------------------------------


class TestWhatsAppVerify:
    def test_verify_subscribe_ok(self):
        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = "secret123"
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(
                "/api/v1/webhooks/whatsapp",
                params={
                    "hub.mode": "subscribe",
                    "hub.challenge": "12345",
                    "hub.verify_token": "secret123",
                },
            )
        assert resp.status_code == 200
        assert resp.json() == 12345

    def test_verify_subscribe_wrong_token(self):
        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = "correct-secret"
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(
                "/api/v1/webhooks/whatsapp",
                params={
                    "hub.mode": "subscribe",
                    "hub.challenge": "12345",
                    "hub.verify_token": "wrong-token",
                },
            )
        assert resp.status_code == 403

    def test_verify_no_mode(self):
        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = "secret"
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/webhooks/whatsapp")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /webhooks/whatsapp
# ---------------------------------------------------------------------------


class TestWhatsAppWebhook:
    def test_webhook_rejected_when_secret_not_configured(self):
        """Fail closed: no WHATSAPP_WEBHOOK_SECRET → 403 (no unsigned webhooks)."""
        payload = {
            "entry": [{"changes": [{"value": {"messages": [{"from": "972501234567", "text": {"body": "Hello"}}]}}]}]
        }

        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = ""
            mock_settings.return_value.WHATSAPP_API_TOKEN = None
            mock_settings.return_value.WHATSAPP_PHONE_ID = None
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/webhooks/whatsapp",
                content=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
        assert resp.status_code == 403

    def test_webhook_invalid_json(self):
        """Invalid JSON returns 400 after signature verification."""
        from src.api.main import app

        secret = "whsec-test"
        body = b"not-valid-json"
        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = secret
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/webhooks/whatsapp",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Hub-Signature-256": _whatsapp_sig(body, secret),
                },
            )
        assert resp.status_code == 400

    def test_webhook_no_messages_returns_ignored(self):
        """Payloads without messages are silently ignored."""
        payload = {"entry": [{"changes": [{"value": {"messages": []}}]}]}

        from src.api.main import app

        secret = "whsec-test"
        body = json.dumps(payload).encode()
        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = secret
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/webhooks/whatsapp",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Hub-Signature-256": _whatsapp_sig(body, secret),
                },
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ignored"


# ---------------------------------------------------------------------------
# POST /webhooks/contractor-update
# ---------------------------------------------------------------------------


class TestContractorUpdateWebhook:
    def test_contractor_update_ok(self):
        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.API_KEYS = "test-key"
            mock_settings.return_value.get_api_keys.return_value = ["test-key"]
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/webhooks/contractor-update",
                json={"contractor_id": "c1", "type": "profile_update"},
                headers={"X-API-Key": "test-key"},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"

    def test_contractor_update_missing_fields(self):
        """Missing contractor_id or type → invalid."""
        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.API_KEYS = "test-key"
            mock_settings.return_value.get_api_keys.return_value = ["test-key"]
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/webhooks/contractor-update",
                json={"type": "profile_update"},  # no contractor_id
                headers={"X-API-Key": "test-key"},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "invalid"

    def test_contractor_update_invalid_api_key(self):
        """Invalid API key → 403."""
        from src.api.main import app

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.API_KEYS = "valid-key"
            mock_settings.return_value.get_api_keys.return_value = ["valid-key"]
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/webhooks/contractor-update",
                json={"contractor_id": "c1", "type": "license_updated"},
                headers={"X-API-Key": "wrong-key"},
            )
        assert resp.status_code == 403

    def test_contractor_update_triggers_vetting(self):
        """document_uploaded triggers vetting agent run."""
        from src.api.main import app

        mock_vetting = AsyncMock()
        mock_vetting.run = AsyncMock()
        mock_orchestrator = MagicMock()
        mock_orchestrator.agents = {"vetting": mock_vetting}

        with patch("src.api.routes.webhooks.get_settings") as mock_settings:
            mock_settings.return_value.API_KEYS = "test-key"
            mock_settings.return_value.get_api_keys.return_value = ["test-key"]
            with patch("src.api.routes.webhooks.get_orchestrator", return_value=mock_orchestrator):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/webhooks/contractor-update",
                    json={"contractor_id": "c1", "type": "document_uploaded"},
                    headers={"X-API-Key": "test-key"},
                )
        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"


# ---------------------------------------------------------------------------
# _verify_whatsapp_signature helper
# ---------------------------------------------------------------------------


def test_verify_signature_no_secret():
    """Fail closed: no secret → verification fails."""
    from src.api.routes.webhooks import _verify_whatsapp_signature

    with patch("src.api.routes.webhooks.get_settings") as mock_settings:
        mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = ""
        result = _verify_whatsapp_signature(b"payload", None)
    assert result is False


def test_verify_signature_missing_header():
    """Returns False when secret is set but header is missing."""
    from src.api.routes.webhooks import _verify_whatsapp_signature

    with patch("src.api.routes.webhooks.get_settings") as mock_settings:
        mock_settings.return_value.WHATSAPP_WEBHOOK_SECRET = "secret"
        result = _verify_whatsapp_signature(b"payload", None)
    assert result is False


# ---------------------------------------------------------------------------
# _parse_whatsapp_payload helper
# ---------------------------------------------------------------------------


def test_parse_whatsapp_payload_valid():
    from src.api.routes.webhooks import _parse_whatsapp_payload

    payload = {"entry": [{"changes": [{"value": {"messages": [{"from": "972501234567", "text": {"body": "Hello"}}]}}]}]}
    result = _parse_whatsapp_payload(payload)
    assert result is not None
    assert result["phone"] == "972501234567"
    assert result["text"] == "Hello"


def test_parse_whatsapp_payload_no_messages():
    from src.api.routes.webhooks import _parse_whatsapp_payload

    result = _parse_whatsapp_payload({"entry": [{"changes": [{"value": {"messages": []}}]}]})
    assert result is None


def test_parse_whatsapp_payload_empty_text():
    from src.api.routes.webhooks import _parse_whatsapp_payload

    payload = {"entry": [{"changes": [{"value": {"messages": [{"from": "972501234567", "text": {"body": ""}}]}}]}]}
    result = _parse_whatsapp_payload(payload)
    assert result is None
