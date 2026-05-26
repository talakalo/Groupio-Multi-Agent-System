"""Contractor membership Stripe Checkout session (POST /contractors/me/membership/checkout-session)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user
from src.config.settings import Settings
from src.models.user import UserInDB, UserRole


def _contractor_user() -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="user-contractor-1",
        email="contractor@example.com",
        full_name="Contractor Test",
        phone="0501234567",
        role=UserRole.CONTRACTOR,
        contractor_id="ctr-checkout-1",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


def _settings_stripe_membership() -> Settings:
    return Settings(
        ENVIRONMENT="development",
        PAYMENT_PROVIDER="stripe",
        STRIPE_SECRET_KEY="sk_test_fake",
        STRIPE_WEBHOOK_SECRET="whsec_fake",
        STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID="price_test_membership",
        FRONTEND_URL="https://app.example.com",
        JWT_SECRET_KEY="x" * 40,
    )


@pytest.fixture
def client_contractor():
    app.dependency_overrides[get_current_user] = _contractor_user
    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def test_membership_checkout_requires_stripe_provider(client_contractor: TestClient) -> None:
    with patch("src.api.routes.contractors.get_settings") as gs:
        gs.return_value = Settings(
            ENVIRONMENT="development",
            PAYMENT_PROVIDER="mock",
            JWT_SECRET_KEY="x" * 40,
        )
        r = client_contractor.post("/api/v1/contractors/me/membership/checkout-session", json={})
    assert r.status_code == 400
    assert "stripe" in r.json()["detail"].lower()


def test_membership_checkout_requires_price_id(client_contractor: TestClient) -> None:
    s = _settings_stripe_membership()
    s.STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID = ""
    with patch("src.api.routes.contractors.get_settings", return_value=s):
        r = client_contractor.post("/api/v1/contractors/me/membership/checkout-session", json={})
    assert r.status_code == 503


def test_membership_checkout_creates_session_with_metadata(client_contractor: TestClient) -> None:
    import stripe

    fake_session = MagicMock()
    fake_session.id = "cs_test_123"
    fake_session.url = "https://checkout.stripe.com/c/pay/cs_test_123"

    with (
        patch("src.api.routes.contractors.get_settings", return_value=_settings_stripe_membership()),
        patch.object(
            stripe.checkout.Session,
            "create_async",
            new_callable=AsyncMock,
            return_value=fake_session,
        ) as create_mock,
    ):
        r = client_contractor.post(
            "/api/v1/contractors/me/membership/checkout-session",
            json={},
        )

    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == "cs_test_123"
    assert data["url"] == "https://checkout.stripe.com/c/pay/cs_test_123"

    call = create_mock.call_args
    assert call is not None
    kwargs = call.kwargs
    assert kwargs["mode"] == "subscription"
    assert kwargs["metadata"]["contractor_id"] == "ctr-checkout-1"
    assert kwargs["subscription_data"]["metadata"]["contractor_id"] == "ctr-checkout-1"
    assert kwargs["client_reference_id"] == "ctr-checkout-1"
    line = kwargs["line_items"][0]
    assert line["price"] == "price_test_membership"
    assert line["quantity"] == 1


def test_membership_checkout_rejects_bad_redirect(client_contractor: TestClient) -> None:
    with patch("src.api.routes.contractors.get_settings", return_value=_settings_stripe_membership()):
        r = client_contractor.post(
            "/api/v1/contractors/me/membership/checkout-session",
            json={"success_url": "https://evil.example.com/ok"},
        )
    assert r.status_code == 400
