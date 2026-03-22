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
