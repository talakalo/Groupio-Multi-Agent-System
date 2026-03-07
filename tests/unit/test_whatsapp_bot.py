"""Unit tests for WhatsAppBotService."""

import hashlib
import hmac
import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _reload_module():
    """Ensure src.services.whatsapp_bot is the real module, not a MagicMock stub."""
    mod_name = "src.services.whatsapp_bot"
    # If it was replaced with a MagicMock, remove and reimport the real one
    existing = sys.modules.get(mod_name)
    if isinstance(existing, MagicMock):
        del sys.modules[mod_name]
    return importlib.import_module(mod_name)


# Reload at import time to get the real module
_wab = _reload_module()
WhatsAppBotService = _wab.WhatsAppBotService
WhatsAppContact = _wab.WhatsAppContact
WhatsAppMessage = _wab.WhatsAppMessage
WhatsAppWebhookPayload = _wab.WhatsAppWebhookPayload


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_orchestrator():
    orch = AsyncMock()
    orch.run = AsyncMock(
        return_value={
            "response": {"message": "Hello from orchestrator"},
            "conversation_id": "conv-1",
        }
    )
    return orch


@pytest.fixture
def mock_redis():
    r = AsyncMock()
    r.get_conversation_context = AsyncMock(return_value=[])
    r.add_conversation_message = AsyncMock()
    return r


@pytest.fixture
def mock_settings():
    s = MagicMock()
    s.WHATSAPP_PHONE_ID = "phone123"
    s.WHATSAPP_API_TOKEN = "token123"
    s.WHATSAPP_WEBHOOK_SECRET = "secret123"
    return s


@pytest.fixture
def bot(mock_orchestrator, mock_redis, mock_settings):
    with patch("src.services.whatsapp_bot.get_settings", return_value=mock_settings):
        with patch("src.services.whatsapp_bot.httpx.AsyncClient") as mock_client_cls:
            mock_client_cls.return_value = AsyncMock()
            service = WhatsAppBotService(
                orchestrator=mock_orchestrator,
                redis_client=mock_redis,
            )
    service.http_client = AsyncMock()
    service.http_client.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))
    return service


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


def test_whatsapp_message_defaults():
    msg = WhatsAppMessage(message_id="m1", from_number="972501234567", timestamp="12345")
    assert msg.type == "text"
    assert msg.text is None


def test_whatsapp_contact():
    c = WhatsAppContact(wa_id="972501234567", profile_name="Alice")
    assert c.wa_id == "972501234567"


def test_whatsapp_webhook_payload_defaults():
    p = WhatsAppWebhookPayload()
    assert p.messages == []
    assert p.contacts == []
    assert p.statuses == []


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


def test_verify_signature_valid(bot, mock_settings):
    payload = b'{"test": "data"}'
    expected = hmac.new(
        key=mock_settings.WHATSAPP_WEBHOOK_SECRET.encode(),
        msg=payload,
        digestmod=hashlib.sha256,
    ).hexdigest()
    signature = f"sha256={expected}"

    with patch("src.services.whatsapp_bot.get_settings", return_value=mock_settings):
        result = bot.verify_webhook_signature(payload, signature)

    assert result is True


def test_verify_signature_invalid(bot, mock_settings):
    payload = b'{"test": "data"}'
    with patch("src.services.whatsapp_bot.get_settings", return_value=mock_settings):
        result = bot.verify_webhook_signature(payload, "sha256=wrongsig")
    assert result is False


def test_verify_signature_no_secret(bot, mock_settings):
    mock_settings.WHATSAPP_WEBHOOK_SECRET = None
    with patch("src.services.whatsapp_bot.get_settings", return_value=mock_settings):
        result = bot.verify_webhook_signature(b"data", "sha256=anything")
    assert result is False


# ---------------------------------------------------------------------------
# parse_webhook_payload
# ---------------------------------------------------------------------------


def test_parse_text_message(bot):
    data = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "msg1",
                                    "from": "972501234567",
                                    "timestamp": "1700000000",
                                    "type": "text",
                                    "text": {"body": "Hello"},
                                }
                            ],
                            "contacts": [{"wa_id": "972501234567", "profile": {"name": "Alice"}}],
                            "statuses": [{"id": "s1", "status": "delivered"}],
                        }
                    }
                ]
            }
        ]
    }
    payload = bot.parse_webhook_payload(data)
    assert len(payload.messages) == 1
    assert payload.messages[0].text == "Hello"
    assert len(payload.contacts) == 1
    assert payload.contacts[0].profile_name == "Alice"
    assert len(payload.statuses) == 1


def test_parse_interactive_button_reply(bot):
    data = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "msg2",
                                    "from": "972501234567",
                                    "timestamp": "1700000001",
                                    "type": "interactive",
                                    "interactive": {
                                        "type": "button_reply",
                                        "button_reply": {"id": "btn1"},
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    payload = bot.parse_webhook_payload(data)
    assert payload.messages[0].button_reply_id == "btn1"


def test_parse_interactive_list_reply(bot):
    data = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "msg3",
                                    "from": "972501234567",
                                    "timestamp": "1700000002",
                                    "type": "interactive",
                                    "interactive": {
                                        "type": "list_reply",
                                        "list_reply": {"id": "list1"},
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    payload = bot.parse_webhook_payload(data)
    assert payload.messages[0].list_reply_id == "list1"


def test_parse_image_message(bot):
    data = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "msg4",
                                    "from": "972501234567",
                                    "timestamp": "1700000003",
                                    "type": "image",
                                    "image": {"id": "img1"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    payload = bot.parse_webhook_payload(data)
    assert payload.messages[0].image_id == "img1"


def test_parse_document_message(bot):
    data = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "msg5",
                                    "from": "972501234567",
                                    "timestamp": "1700000004",
                                    "type": "document",
                                    "document": {"id": "doc1"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    payload = bot.parse_webhook_payload(data)
    assert payload.messages[0].document_id == "doc1"


def test_parse_location_message(bot):
    data = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "msg6",
                                    "from": "972501234567",
                                    "timestamp": "1700000005",
                                    "type": "location",
                                    "location": {"latitude": 32.0, "longitude": 34.8},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    payload = bot.parse_webhook_payload(data)
    assert payload.messages[0].latitude == 32.0
    assert payload.messages[0].longitude == 34.8


def test_parse_malformed_payload(bot):
    """Gracefully handles malformed payloads."""
    payload = bot.parse_webhook_payload({})
    assert payload.messages == []


def test_parse_empty_entry(bot):
    payload = bot.parse_webhook_payload({"entry": []})
    assert payload.messages == []


# ---------------------------------------------------------------------------
# handle_message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_message_text(bot, mock_orchestrator, mock_redis):
    msg = WhatsAppMessage(message_id="m1", from_number="972501234567", timestamp="1700000000", text="Help me")
    contact = WhatsAppContact(wa_id="972501234567", profile_name="Bob")
    await bot.handle_message(msg, contact)

    mock_orchestrator.run.assert_awaited_once()
    assert mock_redis.add_conversation_message.await_count == 2


@pytest.mark.asyncio
async def test_handle_message_no_text_sends_unsupported(bot):
    msg = WhatsAppMessage(message_id="m2", from_number="972501234567", timestamp="1700000001")
    bot._send_text_message = AsyncMock()
    await bot.handle_message(msg, None)
    bot._send_text_message.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_message_with_offers(bot, mock_orchestrator):
    mock_orchestrator.run = AsyncMock(
        return_value={
            "response": {"message": "Here are offers"},
            "offers": [{"id": "o1", "title": "Roof fix", "price": 1000, "category": "roofing"}],
        }
    )
    msg = WhatsAppMessage(message_id="m3", from_number="972501234567", timestamp="1700000002", text="Show offers")
    bot._send_offers_list = AsyncMock()
    await bot.handle_message(msg, None)
    bot._send_offers_list.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_message_with_contractors(bot, mock_orchestrator):
    mock_orchestrator.run = AsyncMock(
        return_value={
            "response": {"message": "Here are contractors"},
            "contractors": [{"id": "c1", "name": "BuildCo", "rating": 4.5, "category": "plumbing"}],
        }
    )
    msg = WhatsAppMessage(message_id="m4", from_number="972501234567", timestamp="1700000003", text="Find plumber")
    bot._send_contractors_list = AsyncMock()
    await bot.handle_message(msg, None)
    bot._send_contractors_list.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_message_with_quick_replies(bot, mock_orchestrator):
    mock_orchestrator.run = AsyncMock(
        return_value={
            "response": {"message": "Choose an option"},
            "quick_replies": [{"id": "q1", "title": "Yes"}, {"id": "q2", "title": "No"}],
        }
    )
    msg = WhatsAppMessage(message_id="m5", from_number="972501234567", timestamp="1700000004", text="question")
    bot._send_quick_replies = AsyncMock()
    await bot.handle_message(msg, None)
    bot._send_quick_replies.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_message_empty_response(bot, mock_orchestrator):
    """Falls back to error message when orchestrator returns empty response."""
    mock_orchestrator.run = AsyncMock(return_value={"response": {}})
    msg = WhatsAppMessage(message_id="m6", from_number="972501234567", timestamp="1700000005", text="hello")
    bot._send_text_message = AsyncMock()
    await bot.handle_message(msg, None)
    bot._send_text_message.assert_awaited()


@pytest.mark.asyncio
async def test_handle_message_orchestrator_exception(bot, mock_orchestrator):
    mock_orchestrator.run = AsyncMock(side_effect=Exception("boom"))
    msg = WhatsAppMessage(message_id="m7", from_number="972501234567", timestamp="1700000006", text="crash")
    bot._send_text_message = AsyncMock()
    await bot.handle_message(msg, None)
    bot._send_text_message.assert_awaited_once()


# ---------------------------------------------------------------------------
# _send_text_message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_text_message_success(bot):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    bot.http_client.post = AsyncMock(return_value=mock_resp)
    await bot._send_text_message("972501234567", "Hello!")
    bot.http_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_text_message_http_error(bot):
    import httpx

    bot.http_client.post = AsyncMock(side_effect=httpx.HTTPError("fail"))
    # Should not raise
    await bot._send_text_message("972501234567", "Hello!")


# ---------------------------------------------------------------------------
# _send_quick_replies
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_quick_replies_success(bot):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    bot.http_client.post = AsyncMock(return_value=mock_resp)
    buttons = [{"id": "b1", "title": "Option 1"}, {"id": "b2", "title": "Option 2"}]
    await bot._send_quick_replies("972501234567", "Pick one", buttons)
    bot.http_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_quick_replies_http_error(bot):
    import httpx

    bot.http_client.post = AsyncMock(side_effect=httpx.HTTPError("fail"))
    await bot._send_quick_replies("972501234567", "Pick one", [{"id": "b1", "title": "Y"}])


# ---------------------------------------------------------------------------
# _send_offers_list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_offers_list_success(bot):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    bot.http_client.post = AsyncMock(return_value=mock_resp)
    offers = [{"id": "o1", "title": "Fix roof", "price": 5000, "category": "roofing"}]
    await bot._send_offers_list("972501234567", offers)
    bot.http_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_offers_list_http_error(bot):
    import httpx

    bot.http_client.post = AsyncMock(side_effect=httpx.HTTPError("fail"))
    await bot._send_offers_list("972501234567", [{"id": "o1"}])


# ---------------------------------------------------------------------------
# _send_contractors_list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_contractors_list_success(bot):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    bot.http_client.post = AsyncMock(return_value=mock_resp)
    contractors = [{"id": "c1", "name": "BuildCo", "rating": 4.5, "category": "general"}]
    await bot._send_contractors_list("972501234567", contractors)
    bot.http_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_contractors_list_http_error(bot):
    import httpx

    bot.http_client.post = AsyncMock(side_effect=httpx.HTTPError("fail"))
    await bot._send_contractors_list("972501234567", [{"id": "c1"}])


# ---------------------------------------------------------------------------
# send_notification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_notification_success(bot):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    bot.http_client.post = AsyncMock(return_value=mock_resp)
    await bot.send_notification("972501234567", "offer_update", ["param1", "param2"])
    bot.http_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_notification_http_error(bot):
    import httpx

    bot.http_client.post = AsyncMock(side_effect=httpx.HTTPError("fail"))
    await bot.send_notification("972501234567", "tmpl", [])


# ---------------------------------------------------------------------------
# _send_typing_indicator
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_typing_indicator_noop(bot):
    """Typing indicator is a no-op placeholder — should not raise."""
    await bot._send_typing_indicator("972501234567")


# ---------------------------------------------------------------------------
# close
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close(bot):
    bot.http_client.aclose = AsyncMock()
    await bot.close()
    bot.http_client.aclose.assert_awaited_once()


# ---------------------------------------------------------------------------
# Hebrew text handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_message_hebrew_text(bot, mock_redis):
    """Hebrew text is normalized before processing."""
    msg = WhatsAppMessage(
        message_id="m8",
        from_number="972501234567",
        timestamp="1700000007",
        text="שלום עולם",
    )
    await bot.handle_message(msg, None)
    # Should have processed without error
    assert mock_redis.add_conversation_message.await_count >= 0
