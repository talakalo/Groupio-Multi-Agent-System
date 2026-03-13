"""Unit tests for the PushService (Firebase Cloud Messaging)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.push import PushService, get_push_service


@pytest.fixture
def push_service():
    with patch("src.services.push.get_settings") as mock_settings:
        settings = MagicMock()
        settings.FCM_SERVER_KEY = "test-fcm-key"
        settings.FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send"
        mock_settings.return_value = settings
        svc = PushService()
        svc.settings = settings
        yield svc


@pytest.fixture
def unconfigured_push_service():
    with patch("src.services.push.get_settings") as mock_settings:
        settings = MagicMock()
        settings.FCM_SERVER_KEY = ""
        settings.FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send"
        mock_settings.return_value = settings
        svc = PushService()
        svc.settings = settings
        yield svc


class TestPushServiceConfigured:
    @pytest.mark.asyncio
    async def test_send_success(self, push_service):
        """Successful FCM send returns success=True with message_id."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": 1,
            "results": [{"message_id": "msg123"}],
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.services.push.httpx.AsyncClient", return_value=mock_client):
            result = await push_service.send(token="device-token", title="Test", body="Hello")

        assert result["success"] is True
        assert result["message_id"] == "msg123"

    @pytest.mark.asyncio
    async def test_send_fcm_failure(self, push_service):
        """FCM returns non-success → returns success=False with reason."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": 0,
            "results": [{"error": "InvalidRegistration"}],
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.services.push.httpx.AsyncClient", return_value=mock_client):
            result = await push_service.send(token="bad-token", title="Test", body="Hello")

        assert result["success"] is False
        assert result["reason"] == "InvalidRegistration"

    @pytest.mark.asyncio
    async def test_send_http_error(self, push_service):
        """Network/HTTP exception → returns success=False with reason."""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=Exception("connection refused"))

        with patch("src.services.push.httpx.AsyncClient", return_value=mock_client):
            result = await push_service.send(token="device-token", title="Test", body="Hello")

        assert result["success"] is False
        assert "connection refused" in result["reason"]

    @pytest.mark.asyncio
    async def test_send_with_data_payload(self, push_service):
        """Extra data dict is included in FCM payload, values stringified."""
        captured_payload = {}

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": 1, "results": [{"message_id": "x"}]}

        async def capture_post(url, json=None, headers=None):
            captured_payload.update(json or {})
            return mock_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = capture_post

        with patch("src.services.push.httpx.AsyncClient", return_value=mock_client):
            await push_service.send(
                token="tok", title="T", body="B", data={"offer_id": 42, "status": "pending"}
            )

        assert captured_payload["data"] == {"offer_id": "42", "status": "pending"}

    @pytest.mark.asyncio
    async def test_send_no_token(self, push_service):
        """Empty token → early return without making HTTP call."""
        result = await push_service.send(token="", title="T", body="B")
        assert result["success"] is False
        assert result["reason"] == "no_token"

    @pytest.mark.asyncio
    async def test_send_multicast(self, push_service):
        """send_multicast aggregates results from individual sends."""
        async def fake_send(token, title, body, data=None):
            if token == "good":
                return {"success": True, "message_id": "m1"}
            return {"success": False, "reason": "error"}

        push_service.send = fake_send
        result = await push_service.send_multicast(
            tokens=["good", "bad"], title="T", body="B"
        )
        assert result["total"] == 2
        assert result["success"] == 1
        assert result["failed"] == 1

    @pytest.mark.asyncio
    async def test_send_multicast_empty(self, push_service):
        """send_multicast with empty token list returns zeros."""
        result = await push_service.send_multicast(tokens=[], title="T", body="B")
        assert result["total"] == 0
        assert result["success"] == 0
        assert result["failed"] == 0


class TestPushServiceUnconfigured:
    @pytest.mark.asyncio
    async def test_send_not_configured(self, unconfigured_push_service):
        """When FCM_SERVER_KEY is empty, send skips delivery gracefully."""
        result = await unconfigured_push_service.send(token="tok", title="T", body="B")
        assert result["success"] is False
        assert result["reason"] == "not_configured"

    def test_is_configured_false(self, unconfigured_push_service):
        assert unconfigured_push_service._is_configured() is False

    def test_is_configured_true(self, push_service):
        assert push_service._is_configured() is True


class TestGetPushService:
    def test_singleton(self):
        """get_push_service returns the same instance on repeated calls."""
        import src.services.push as push_module

        push_module._push_service = None  # reset singleton
        with patch("src.services.push.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(FCM_SERVER_KEY="k", FCM_ENDPOINT="url")
            svc1 = get_push_service()
            svc2 = get_push_service()
            assert svc1 is svc2
        push_module._push_service = None  # clean up
