"""Publishable environment payment rules (staging/production)."""

import logging

import pytest

from src.config.settings import Settings


def _staging_base(**kwargs: object) -> dict:
    return {
        "ENVIRONMENT": "staging",
        "JWT_SECRET_KEY": "x" * 40,
        "PAYMENT_WEBHOOK_SECRET": "a" * 32,
        "API_KEYS": "ci-service-key",
        "ANTHROPIC_API_KEY": "ak-test",
        "DATABASE_URL": "postgresql://postgres:postgres@127.0.0.1:5432/groupio",
        # Staging defaults ENFORCE_EMAIL_VERIFICATION=True — need Resend or SMTP
        "RESEND_API_KEY": "re_test_ci_dummy",
        **kwargs,
    }


def test_staging_warns_on_mock_payment_provider(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="src.config.settings"):
        Settings(**_staging_base(PAYMENT_PROVIDER="mock"))
    assert any("PAYMENT_PROVIDER=mock" in r.message for r in caplog.records)


def test_staging_warns_on_bit_paybox(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="src.config.settings"):
        Settings(
            **_staging_base(
                PAYMENT_PROVIDER="bit",
                STRIPE_SECRET_KEY="sk_test_x",
                STRIPE_WEBHOOK_SECRET="whsec_x",
            )
        )
    assert any("not launch-ready" in r.message for r in caplog.records)


def test_staging_warns_missing_stripe_webhook_secret(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="src.config.settings"):
        Settings(
            **_staging_base(
                PAYMENT_PROVIDER="stripe",
                STRIPE_SECRET_KEY="sk_test_123",
                STRIPE_WEBHOOK_SECRET="",
            )
        )
    assert any("STRIPE_WEBHOOK_SECRET" in r.message for r in caplog.records)


def test_development_allows_mock() -> None:
    s = Settings(ENVIRONMENT="development", PAYMENT_PROVIDER="mock")
    assert s.PAYMENT_PROVIDER == "mock"


def test_staging_warns_missing_email_when_verification_enforced(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="src.config.settings"):
        Settings(
            **_staging_base(
                PAYMENT_PROVIDER="stripe",
                STRIPE_SECRET_KEY="sk_test_123",
                STRIPE_WEBHOOK_SECRET="whsec_test",
                RESEND_API_KEY="",
                SMTP_HOST="",
                SMTP_USER="",
                SMTP_PASSWORD="",
                ENFORCE_EMAIL_VERIFICATION=True,
            )
        )
    assert any("email transport" in r.message for r in caplog.records)


def test_staging_allows_missing_email_when_verification_disabled() -> None:
    s = Settings(
        **_staging_base(
            PAYMENT_PROVIDER="stripe",
            STRIPE_SECRET_KEY="sk_test_123",
            STRIPE_WEBHOOK_SECRET="whsec_test",
            RESEND_API_KEY="",
            SMTP_HOST="",
            SMTP_USER="",
            SMTP_PASSWORD="",
            ENFORCE_EMAIL_VERIFICATION=False,
        )
    )
    assert s.ENFORCE_EMAIL_VERIFICATION is False


def test_staging_warns_disabled_datagov_enrichment(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="src.config.settings"):
        Settings(
            **_staging_base(
                PAYMENT_PROVIDER="stripe",
                STRIPE_SECRET_KEY="sk_test_123",
                STRIPE_WEBHOOK_SECRET="whsec_test",
                ENABLE_DATAGOV_IL="0",
            )
        )
    assert any("ENABLE_DATAGOV_IL" in r.message for r in caplog.records)


def test_staging_accepts_enabled_datagov_enrichment() -> None:
    s = Settings(
        **_staging_base(
            PAYMENT_PROVIDER="stripe",
            STRIPE_SECRET_KEY="sk_test_123",
            STRIPE_WEBHOOK_SECRET="whsec_test",
            ENABLE_DATAGOV_IL="1",
        )
    )
    assert s.ENABLE_DATAGOV_IL == "1"


def test_development_does_not_require_datagov_enrichment() -> None:
    # Local / dev boxes typically work offline; the gate only fires in
    # staging/production.
    s = Settings(ENVIRONMENT="development", ENABLE_DATAGOV_IL="0")
    assert s.ENABLE_DATAGOV_IL == "0"
