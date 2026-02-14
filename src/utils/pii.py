"""PII redaction utilities for log sanitization.

Redacts emails, phone numbers, Israeli IDs, credit-card numbers, and JWTs
from arbitrary text so that log output never contains raw personally
identifiable information.
"""

import re

# -- Compiled patterns (module-level for performance) --

_EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")

# Israeli mobile/landline (05x-xxx-xxxx, 0x-xxx-xxxx, +972-…)
_PHONE_RE = re.compile(r"(?:\+972|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}")

# Israeli ID number: 9 digits
_ISRAELI_ID_RE = re.compile(r"\b\d{9}\b")

# Credit-card numbers (13-19 digits, optionally separated by spaces/dashes)
_CC_RE = re.compile(r"\b(?:\d[\s-]?){13,19}\b")

# JWT tokens (three base64url segments separated by dots)
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")

# Aggregate list for ordered application
_PII_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (_JWT_RE, "[REDACTED_JWT]"),
    (_EMAIL_RE, "[REDACTED_EMAIL]"),
    (_CC_RE, "[REDACTED_CC]"),
    (_PHONE_RE, "[REDACTED_PHONE]"),
    (_ISRAELI_ID_RE, "[REDACTED_ID]"),
]


def redact_pii(text: str) -> str:
    """Return *text* with all recognised PII patterns replaced by placeholders.

    The function is **pure** (no side-effects) and safe to call from any
    thread or async context.
    """
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
