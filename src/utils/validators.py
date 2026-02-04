"""Input validation utilities."""

import re
from typing import Any


def validate_user_id(user_id: str) -> bool:
    """Validate user ID format."""
    return bool(user_id and isinstance(user_id, str) and len(user_id) <= 100)


def validate_building_id(building_id: str) -> bool:
    """Validate building ID format."""
    return bool(building_id and isinstance(building_id, str) and len(building_id) <= 100)


def validate_phone(phone: str) -> bool:
    """Validate Israeli phone number format."""
    pattern = r"^(\+972|0)\d{1,2}\d{7}$"
    cleaned = re.sub(r"[-\s]", "", phone)
    return bool(re.match(pattern, cleaned))


def validate_email(email: str) -> bool:
    """Basic email validation."""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


VALID_CATEGORIES = {
    "ac_installation",
    "ac_maintenance",
    "kitchen",
    "electrical",
    "plumbing",
    "heating",
    "renovations",
    "painting",
    "flooring",
    "windows",
}

VALID_REGIONS = {
    "center",
    "tel_aviv",
    "jerusalem",
    "haifa",
    "north",
    "south",
    "sharon",
    "shfela",
}

VALID_INTENTS = {
    "contractor_search",
    "pricing_question",
    "order_status",
    "complaint",
    "contractor_verification",
    "analytics_query",
    "general_info",
    "technical_support",
}

VALID_CHANNELS = {"web", "whatsapp", "app", "email"}


def validate_category(category: str) -> bool:
    """Check if category is valid."""
    return category in VALID_CATEGORIES


def validate_region(region: str) -> bool:
    """Check if region is valid."""
    return region in VALID_REGIONS


def validate_intent(intent: str) -> bool:
    """Check if intent is valid."""
    return intent in VALID_INTENTS


def validate_channel(channel: str) -> bool:
    """Check if channel is valid."""
    return channel in VALID_CHANNELS


def sanitize_input(text: str, max_length: int = 5000) -> str:
    """Sanitize user input to prevent injection attacks.

    - Truncates to max_length
    - Removes control characters
    - Strips leading/trailing whitespace
    """
    if not isinstance(text, str):
        return ""

    # Truncate
    text = text[:max_length]

    # Remove control characters (keep newlines and tabs)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Strip
    text = text.strip()

    return text


def validate_sql_query(sql: str) -> tuple[bool, str]:
    """Basic SQL query validation to prevent dangerous operations.

    Returns (is_valid, reason).
    """
    sql_upper = sql.upper().strip()

    # Only allow SELECT queries
    if not sql_upper.startswith("SELECT"):
        return False, "Only SELECT queries are allowed"

    # Block dangerous keywords
    dangerous = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "EXEC"]
    for keyword in dangerous:
        if re.search(rf"\b{keyword}\b", sql_upper):
            return False, f"Keyword '{keyword}' is not allowed"

    # Check for comment injection
    if "--" in sql or "/*" in sql:
        return False, "SQL comments are not allowed"

    return True, "OK"


def validate_message_request(data: dict[str, Any]) -> tuple[bool, str]:
    """Validate the incoming message request payload."""
    if not data.get("user_id"):
        return False, "user_id is required"

    if not validate_user_id(data["user_id"]):
        return False, "Invalid user_id format"

    if not data.get("message"):
        return False, "message is required"

    message = data["message"]
    if not isinstance(message, str) or len(message) > 5000:
        return False, "message must be a string of max 5000 characters"

    channel = data.get("channel", "web")
    if not validate_channel(channel):
        return False, f"Invalid channel: {channel}"

    return True, "OK"
