"""Publishable environment payment rules (staging/production)."""

import pytest
from pydantic import ValidationError

from src.config.settings import Settings


def _staging_base(**kwargs: object) -> dict:
    return {
        "ENVIRONMENT": "staging",
        "JWT_SECRET_KEY": "x" * 40,
        "PAYMENT_WEBHOOK_SECRET": "a" * 32,
        "API_KEYS": ["ci-service-key"],
        "ANTHROPIC_API_KEY": "ak-test",
        "DATABASE_URL": "postgresql://postgres:postgres@127.0.0.1:5432/groupio",
        # Staging defaults ENFORCE_EMAIL_VERIFICATION=True — need Resend or SMTP
        "RESEND_API_KEY": "re_test_ci_dummy",
        **kwargs,
    }


def test_staging_rejects_mock_payment_provider() -> None:
    with pytest.raises(ValidationError, match="PAYMENT_PROVIDER=mock"):
        Settings(**_staging_base(PAYMENT_PROVIDER="mock"))


def test_staging_rejects_bit_paybox() -> None:
    with pytest.raises(ValidationError, match="not launch-ready"):
        Settings(
            **_staging_base(
                PAYMENT_PROVIDER="bit",
                STRIPE_SECRET_KEY="sk_test_x",
                STRIPE_WEBHOOK_SECRET="whsec_x",
            )
        )


def test_staging_requires_stripe_webhook_secret_when_stripe() -> None:
    with pytest.raises(ValidationError, match="STRIPE_WEBHOOK_SECRET"):
        Settings(
            **_staging_base(
                PAYMENT_PROVIDER="stripe",
                STRIPE_SECRET_KEY="sk_test_123",
                STRIPE_WEBHOOK_SECRET="",
            )
        )


def test_development_allows_mock() -> None:
    s = Settings(ENVIRONMENT="development", PAYMENT_PROVIDER="mock")
    assert s.PAYMENT_PROVIDER == "mock"


def test_staging_rejects_missing_email_when_verification_enforced() -> None:
    with pytest.raises(ValidationError, match="email transport"):
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
