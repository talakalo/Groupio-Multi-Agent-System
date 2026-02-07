"""Unit tests for input validation utilities."""

import pytest

from src.utils.validators import (
    sanitize_input,
    validate_category,
    validate_channel,
    validate_email,
    validate_intent,
    validate_message_request,
    validate_phone,
    validate_region,
    validate_sql_query,
    validate_user_id,
)


def test_validate_phone_valid():
    """Test valid Israeli phone numbers."""
    assert validate_phone("0501234567") is True
    assert validate_phone("050-1234567") is True
    assert validate_phone("+972501234567") is True
    assert validate_phone("+972-50-1234567") is True


def test_validate_phone_invalid():
    """Test invalid phone numbers."""
    assert validate_phone("123") is False
    assert validate_phone("") is False
    assert validate_phone("abcdefghij") is False


def test_validate_email_valid():
    """Test valid emails."""
    assert validate_email("user@example.com") is True
    assert validate_email("test.user@domain.co.il") is True


def test_validate_email_invalid():
    """Test invalid emails."""
    assert validate_email("not-an-email") is False
    assert validate_email("@domain.com") is False
    assert validate_email("") is False


def test_validate_category():
    """Test category validation."""
    assert validate_category("ac_installation") is True
    assert validate_category("kitchen") is True
    assert validate_category("invalid_category") is False


def test_validate_region():
    """Test region validation."""
    assert validate_region("center") is True
    assert validate_region("tel_aviv") is True
    assert validate_region("invalid_region") is False


def test_validate_intent():
    """Test intent validation."""
    assert validate_intent("contractor_search") is True
    assert validate_intent("pricing_question") is True
    assert validate_intent("nonexistent") is False


def test_validate_channel():
    """Test channel validation."""
    assert validate_channel("web") is True
    assert validate_channel("whatsapp") is True
    assert validate_channel("telegram") is False


def test_sanitize_input_basic():
    """Test basic input sanitization."""
    assert sanitize_input("  hello  ") == "hello"
    assert sanitize_input("test\x00input") == "testinput"


def test_sanitize_input_max_length():
    """Test input truncation."""
    long_text = "a" * 10000
    result = sanitize_input(long_text, max_length=100)
    assert len(result) == 100


def test_sanitize_input_preserves_newlines():
    """Test that newlines and tabs are preserved."""
    text = "line1\nline2\ttab"
    assert sanitize_input(text) == text


def test_validate_sql_only_select():
    """Test that only SELECT queries are allowed."""
    valid, _ = validate_sql_query("SELECT * FROM users")
    assert valid is True

    valid, reason = validate_sql_query("DELETE FROM users")
    assert valid is False
    assert "SELECT" in reason


def test_validate_sql_blocks_dangerous():
    """Test that dangerous SQL keywords are blocked."""
    dangerous = [
        "SELECT * FROM users; DROP TABLE users",
        "SELECT * FROM users; DELETE FROM users",
        "SELECT * FROM users; UPDATE users SET admin=true",
    ]
    for sql in dangerous:
        valid, _ = validate_sql_query(sql)
        assert valid is False


def test_validate_sql_blocks_comments():
    """Test that SQL comments are blocked."""
    valid, _ = validate_sql_query("SELECT * FROM users -- drop table")
    assert valid is False


def test_validate_message_request_valid():
    """Test valid message request."""
    data = {"user_id": "user_123", "message": "Hello", "channel": "web"}
    valid, reason = validate_message_request(data)
    assert valid is True


def test_validate_message_request_missing_user():
    """Test missing user_id."""
    data = {"message": "Hello"}
    valid, _ = validate_message_request(data)
    assert valid is False


def test_validate_message_request_missing_message():
    """Test missing message."""
    data = {"user_id": "user_123"}
    valid, _ = validate_message_request(data)
    assert valid is False


def test_validate_message_request_invalid_channel():
    """Test invalid channel."""
    data = {"user_id": "user_123", "message": "Hello", "channel": "telegram"}
    valid, _ = validate_message_request(data)
    assert valid is False
