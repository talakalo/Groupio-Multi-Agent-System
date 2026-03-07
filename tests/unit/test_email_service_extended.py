"""Extended unit tests for EmailService."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.email import EmailService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def configured_settings():
    s = MagicMock()
    s.SMTP_HOST = "smtp.example.com"
    s.SMTP_PORT = 587
    s.SMTP_USER = "user@example.com"
    s.SMTP_PASSWORD = "secret"
    s.SMTP_FROM_EMAIL = "noreply@groupio.co.il"
    s.SMTP_FROM_NAME = "Groupio"
    return s


@pytest.fixture
def unconfigured_settings():
    s = MagicMock()
    s.SMTP_HOST = None
    s.SMTP_USER = None
    s.SMTP_PASSWORD = None
    s.SMTP_FROM_EMAIL = "noreply@groupio.co.il"
    s.SMTP_FROM_NAME = "Groupio"
    return s


@pytest.fixture
def email_service(configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        return EmailService()


@pytest.fixture
def unconfigured_email_service(unconfigured_settings):
    with patch("src.services.email.get_settings", return_value=unconfigured_settings):
        return EmailService()


# ---------------------------------------------------------------------------
# _is_configured
# ---------------------------------------------------------------------------


def test_is_configured_true(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        assert email_service._is_configured() is True


def test_is_configured_false(unconfigured_email_service, unconfigured_settings):
    with patch("src.services.email.get_settings", return_value=unconfigured_settings):
        assert unconfigured_email_service._is_configured() is False


# ---------------------------------------------------------------------------
# send_email
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_email_not_configured(unconfigured_email_service, unconfigured_settings):
    with patch("src.services.email.get_settings", return_value=unconfigured_settings):
        result = await unconfigured_email_service.send_email(
            "to@example.com", "Subject", "<p>Body</p>"
        )
    assert result is False


@pytest.mark.asyncio
async def test_send_email_success(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
            result = await email_service.send_email(
                "to@example.com", "Test Subject", "<p>Test body</p>", "Plain text"
            )
    assert result is True
    mock_thread.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_email_smtp_error(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock, side_effect=Exception("SMTP error")):
            result = await email_service.send_email(
                "to@example.com", "Subject", "<p>Body</p>"
            )
    assert result is False


@pytest.mark.asyncio
async def test_send_email_no_text_content(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_email(
                "to@example.com", "Subject", "<p>HTML only</p>"
            )
    assert result is True


# ---------------------------------------------------------------------------
# send_verification_email
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_verification_email(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_verification_email(
                "user@example.com", "Alice", "verify-token-123"
            )
    assert result is True


# ---------------------------------------------------------------------------
# send_password_reset_email
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_password_reset_email(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_password_reset_email(
                "user@example.com", "Bob", "reset-token-456"
            )
    assert result is True


# ---------------------------------------------------------------------------
# Offer lifecycle emails
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_offer_joined_below_threshold(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_joined(
                "u@example.com", "Alice", "Roof Fix", 3, 10, "offer-1"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_joined_above_threshold(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_joined(
                "u@example.com", "Alice", "Roof Fix", 15, 10, "offer-1"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_left(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_left(
                "u@example.com", "Bob", "Roof Fix", "offer-1"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_threshold_reached(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_threshold_reached(
                "u@example.com", "Carol", "Plumbing", 12, 15, "offer-2"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_cancelled_with_reason(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_cancelled(
                "u@example.com", "Dave", "Roof Fix", reason="Insufficient participants"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_cancelled_no_reason(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_cancelled(
                "u@example.com", "Dave", "Roof Fix"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_matched(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_matched(
                "u@example.com", "Eve", "Roof Fix", "BuildCo Ltd", "offer-1"
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_at_risk(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_at_risk(
                "u@example.com", "Frank", "Roof Fix", "offer-1", current_count=7, min_count=10
            )
    assert result is True


@pytest.mark.asyncio
async def test_send_offer_approved(email_service, configured_settings):
    with patch("src.services.email.get_settings", return_value=configured_settings):
        with patch("asyncio.to_thread", new_callable=AsyncMock):
            result = await email_service.send_offer_approved(
                "u@example.com", "Grace", "Roof Fix", "offer-3"
            )
    assert result is True
