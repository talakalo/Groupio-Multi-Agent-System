"""Tests for PII redaction utility."""

from src.utils.pii import redact_pii


class TestRedactPii:
    """Tests for the redact_pii function."""

    def test_redacts_email(self) -> None:
        assert redact_pii("user@example.com") == "[REDACTED_EMAIL]"

    def test_redacts_email_in_sentence(self) -> None:
        text = "Contact support@groupio.co.il for help"
        result = redact_pii(text)
        assert "support@groupio.co.il" not in result
        assert "[REDACTED_EMAIL]" in result

    def test_redacts_israeli_mobile(self) -> None:
        assert "[REDACTED_PHONE]" in redact_pii("Call 054-123-4567")

    def test_redacts_israeli_mobile_plus972(self) -> None:
        assert "[REDACTED_PHONE]" in redact_pii("Call +972-54-123-4567")

    def test_redacts_israeli_landline(self) -> None:
        assert "[REDACTED_PHONE]" in redact_pii("Office 03-123-4567")

    def test_redacts_israeli_id(self) -> None:
        assert "[REDACTED_ID]" in redact_pii("ID 123456789")

    def test_redacts_credit_card(self) -> None:
        assert "[REDACTED_CC]" in redact_pii("Card 4111 1111 1111 1111")

    def test_redacts_jwt(self) -> None:
        import base64

        # Build a synthetic JWT-shaped token at runtime so secret scanners
        # don't flag a hardcoded token pattern in source code.
        header = base64.b64encode(b'{"alg":"HS256","typ":"JWT"}').decode().rstrip("=")
        payload = base64.b64encode(b'{"sub":"1234567890"}').decode().rstrip("=")
        signature = "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        jwt = f"{header}.{payload}.{signature}"
        result = redact_pii(f"Bearer {jwt}")
        assert "eyJ" not in result
        assert "[REDACTED_JWT]" in result

    def test_preserves_safe_text(self) -> None:
        safe = "Request 12345: GET /api/v1/health status=200"
        assert redact_pii(safe) == safe

    def test_handles_empty_string(self) -> None:
        assert redact_pii("") == ""

    def test_multiple_pii_types(self) -> None:
        text = "User user@test.com called 054-111-2222"
        result = redact_pii(text)
        assert "[REDACTED_EMAIL]" in result
        assert "[REDACTED_PHONE]" in result
        assert "user@test.com" not in result
        assert "054-111-2222" not in result
