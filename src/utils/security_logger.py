"""Dedicated security event logger.

All events are emitted at WARNING level to a ``security`` logger so they can
be routed to a separate sink (SIEM, PagerDuty, CloudWatch Logs Insights, etc.)
independently of the application info-level logs.

Usage::

    from src.utils.security_logger import security_event
    security_event.failed_login("user@example.com", ip="1.2.3.4")
"""

import logging

_log = logging.getLogger("security")


class _SecurityLogger:
    """Namespace for security event helpers."""

    def failed_login(self, identifier: str, ip: str | None = None) -> None:
        _log.warning("FAILED_LOGIN identifier=%s ip=%s", identifier, ip)

    def account_locked(self, identifier: str, ip: str | None = None) -> None:
        _log.warning("ACCOUNT_LOCKED identifier=%s ip=%s", identifier, ip)

    def account_temporarily_locked(self, identifier: str, ip: str | None = None) -> None:
        _log.warning("ACCOUNT_TEMPORARILY_LOCKED identifier=%s ip=%s", identifier, ip)

    def privilege_escalation_attempt(self, identifier: str, requested_role: str, ip: str | None = None) -> None:
        _log.warning(
            "PRIVILEGE_ESCALATION_ATTEMPT identifier=%s requested_role=%s ip=%s",
            identifier,
            requested_role,
            ip,
        )

    def password_reset_requested(self, identifier: str, ip: str | None = None) -> None:
        _log.warning("PASSWORD_RESET_REQUESTED identifier=%s ip=%s", identifier, ip)

    def suspicious_token(self, reason: str, ip: str | None = None) -> None:
        _log.warning("SUSPICIOUS_TOKEN reason=%s ip=%s", reason, ip)


security_event = _SecurityLogger()
