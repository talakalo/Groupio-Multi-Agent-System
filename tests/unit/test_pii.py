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
        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIn0."
            "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        )
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
