"""Tests for payment API routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user


@pytest.fixture
def mock_user():
    """Mock authenticated resident user."""
    return MagicMock(
        id="user-123",
        email="test@example.com",
        role="resident",
        is_active=True,
    )


@pytest.fixture
def client(mock_user):
    """Create test client with auth dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def unauth_client():
    """Test client without auth override (for webhook tests)."""
    return TestClient(app)


@pytest.fixture
def mock_db():
    """Mock PostgreSQL client at the payments route module level."""
    with patch("src.api.routes.payments.get_postgres_client") as mock:
        db = AsyncMock()
        # db.transaction() is decorated with @asynccontextmanager, so it must
        # return an async context manager, not a bare coroutine.  AsyncMock()
        # attributes are themselves AsyncMocks (callable → coroutine), which
        # do NOT satisfy the `async with` protocol.  Use a regular MagicMock
        # wrapping an AsyncMock so `async with db.transaction() as conn` works.
        _txn_cm = AsyncMock()
        db.transaction = MagicMock(return_value=_txn_cm)
        mock.return_value = db
        yield db


@pytest.fixture
def mock_offer():
    """Sample offer returned by the DB."""
    return {
        "id": "offer-100",
        "title": "AC Installation",
        "building_id": "building-123",
        "price_per_unit": 100.0,
        "status": "pending",
    }


@pytest.fixture
def mock_payment_record():
    """Sample payment record from the DB."""
    return {
        "id": "pay-001",
        "user_id": "user-123",
        "offer_id": "offer-100",
        "invoice_id": "inv-001",
        "amount": 100.0,
        "currency": "ILS",
        "status": "succeeded",
        "transaction_id": "txn_123",
        "created_at": "2026-01-15T10:00:00+00:00",
    }


@pytest.fixture
def mock_invoice():
    """Sample invoice record from the DB."""
    return {
        "id": "inv-001",
        "user_id": "user-123",
        "offer_id": "offer-100",
        "amount": 100.0,
        "currency": "ILS",
        "status": "paid",
        "issued_at": "2026-01-15T10:00:00+00:00",
        "due_date": "2026-02-15T10:00:00+00:00",
        "items": [{"description": "AC Installation", "quantity": 1, "unit_price": 100.0}],
    }


# ---------------------------------------------------------------------------
# GET /api/v1/payments/my
# ---------------------------------------------------------------------------


class TestGetMyPayments:
    """Tests for GET /api/v1/payments/my."""

    def test_get_my_payments(self, client, mock_db, mock_payment_record):
        """Current user can list their own payments (paginated — PERF-9)."""
        mock_db.list_payments_for_user_paginated = AsyncMock(return_value=([mock_payment_record], 1))

        response = client.get(
            "/api/v1/payments/my",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert data["total"] == 1
        assert data["page"] == 1
        assert len(data["payments"]) == 1
        assert data["payments"][0]["id"] == "pay-001"
        assert data["payments"][0]["status"] == "succeeded"


# ---------------------------------------------------------------------------
# POST /api/v1/payments/initiate
# ---------------------------------------------------------------------------


class TestInitiatePayment:
    """Tests for POST /api/v1/payments/initiate."""

    @patch("src.messaging.outbox_helpers.try_enqueue_invoice_created_event", new_callable=AsyncMock)
    def test_initiate_payment_success(self, mock_enqueue_invoice, client, mock_db, mock_offer):
        """Successful payment initiation creates invoice, payment, and calls provider."""
        mock_db.get_offer = AsyncMock(return_value=mock_offer)
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.get_invoice_for_offer = AsyncMock(return_value=None)
        mock_db.create_invoice = AsyncMock()
        mock_db.create_payment = AsyncMock()
        mock_db.update_invoice = AsyncMock()

        with patch("src.api.routes.payments.get_payment_provider") as mock_pp:
            provider = AsyncMock()
            provider.create_charge = AsyncMock(
                return_value={
                    "transaction_id": "txn_123",
                    "status": "succeeded",
                    "amount": 100,
                }
            )
            mock_pp.return_value = provider

            response = client.post(
                "/api/v1/payments/initiate",
                json={"offer_id": "offer-100", "payment_method_id": None},
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "succeeded"
        assert data["offer_id"] == "offer-100"
        assert data["transaction_id"] == "txn_123"
        mock_db.create_invoice.assert_awaited_once()
        mock_db.create_payment.assert_awaited_once()
        mock_enqueue_invoice.assert_awaited_once()
        kw = mock_enqueue_invoice.await_args.kwargs
        assert kw["offer_id"] == "offer-100"
        assert kw["user_id"] == "user-123"
        assert "conn" in kw
        assert "invoice_id" in kw

    @patch("src.messaging.outbox_helpers.try_enqueue_invoice_created_event", new_callable=AsyncMock)
    def test_initiate_payment_reuses_invoice_does_not_enqueue_created(
        self, mock_enqueue_invoice, client, mock_db, mock_offer, mock_invoice
    ):
        """When an invoice already exists, invoices.created outbox hook must not run."""
        inv = {**mock_invoice, "subtotal": 84.75, "tax_amount": 15.25, "amount": 100.0, "payment_type": "direct"}
        mock_db.get_offer = AsyncMock(return_value=mock_offer)
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.get_invoice_for_offer = AsyncMock(return_value=inv)
        mock_db.create_invoice = AsyncMock()
        mock_db.create_payment = AsyncMock()

        with patch("src.api.routes.payments.get_payment_provider") as mock_pp:
            provider = AsyncMock()
            provider.create_charge = AsyncMock(
                return_value={"transaction_id": "txn_999", "status": "processing", "amount": 100}
            )
            mock_pp.return_value = provider

            response = client.post(
                "/api/v1/payments/initiate",
                json={"offer_id": "offer-100", "payment_method_id": None},
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 200
        mock_db.create_invoice.assert_not_called()
        mock_enqueue_invoice.assert_not_called()

    def test_initiate_payment_offer_not_found(self, client, mock_db):
        """Initiating payment for a non-existent offer returns 404."""
        mock_db.get_offer = AsyncMock(return_value=None)

        with patch("src.api.routes.payments.get_payment_provider"):
            response = client.post(
                "/api/v1/payments/initiate",
                json={"offer_id": "nonexistent", "payment_method_id": None},
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 404

    def test_initiate_payment_not_participant(self, client, mock_db, mock_offer):
        """User who hasn't joined the offer gets 403."""
        mock_db.get_offer = AsyncMock(return_value=mock_offer)
        mock_db.has_user_joined_offer = AsyncMock(return_value=False)

        with patch("src.api.routes.payments.get_payment_provider"):
            response = client.post(
                "/api/v1/payments/initiate",
                json={"offer_id": "offer-100", "payment_method_id": None},
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/v1/payments/{payment_id}
# ---------------------------------------------------------------------------


class TestGetPayment:
    """Tests for GET /api/v1/payments/{payment_id}."""

    def test_get_payment_success(self, client, mock_db, mock_payment_record):
        """Owner can fetch a single payment by ID."""
        mock_db.get_payment = AsyncMock(return_value=mock_payment_record)

        response = client.get(
            "/api/v1/payments/pay-001",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "pay-001"

    def test_get_payment_not_found(self, client, mock_db):
        """Requesting a non-existent payment returns 404."""
        mock_db.get_payment = AsyncMock(return_value=None)

        response = client.get(
            "/api/v1/payments/nonexistent",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 404

    def test_get_payment_unauthorized(self, mock_db, mock_payment_record):
        """User cannot access another user's payment (403)."""
        mock_db.get_payment = AsyncMock(return_value=mock_payment_record)

        other_user = MagicMock(
            id="user-other",
            email="other@example.com",
            role="resident",
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: other_user
        other_client = TestClient(app)

        try:
            response = other_client.get(
                "/api/v1/payments/pay-001",
                headers={"Authorization": "Bearer test-token"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /api/v1/payments/webhook
# ---------------------------------------------------------------------------


class TestPaymentWebhook:
    """Tests for POST /api/v1/payments/webhook (no auth required)."""

    @pytest.fixture(autouse=True)
    def dev_settings(self):
        """Patch settings so the webhook runs in development mode, skipping signature verification."""
        mock_settings = MagicMock()
        mock_settings.PAYMENT_WEBHOOK_SECRET = None
        mock_settings.ENVIRONMENT = "development"
        with patch("src.api.routes.payments.get_settings", return_value=mock_settings):
            yield mock_settings

    def test_webhook_payment_succeeded(self, unauth_client, mock_db, mock_payment_record):
        """Webhook with payment.succeeded updates payment status."""
        mock_db.get_payment_by_transaction = AsyncMock(return_value=mock_payment_record)
        mock_db.update_payment_and_invoice_for_webhook = AsyncMock()

        response = unauth_client.post(
            "/api/v1/payments/webhook",
            json={
                "transaction_id": "txn_123",
                "event_type": "payment.succeeded",
                "status": "succeeded",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"
        assert data["new_status"] == "succeeded"
        mock_db.update_payment_and_invoice_for_webhook.assert_awaited_once_with(
            "pay-001",
            "inv-001",
            "succeeded",
            "paid",
        )

    def test_webhook_missing_fields(self, unauth_client, mock_db):
        """Webhook without transaction_id or event_type returns 400."""
        response = unauth_client.post(
            "/api/v1/payments/webhook",
            json={"some_field": "some_value"},
        )

        assert response.status_code == 400
        assert "Missing" in response.json()["detail"]

    def test_webhook_unknown_transaction(self, unauth_client, mock_db):
        """Webhook for an unknown transaction returns status=ignored."""
        mock_db.get_payment_by_transaction = AsyncMock(return_value=None)

        response = unauth_client.post(
            "/api/v1/payments/webhook",
            json={
                "transaction_id": "txn_unknown",
                "event_type": "payment.succeeded",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ignored"


# ---------------------------------------------------------------------------
# GET /api/v1/payments/invoices/{invoice_id}
# ---------------------------------------------------------------------------


class TestGetInvoice:
    """Tests for GET /api/v1/payments/invoices/{invoice_id}."""

    def test_get_invoice(self, client, mock_db, mock_invoice, mock_payment_record):
        """Owner can fetch invoice details."""
        mock_db.get_invoice = AsyncMock(return_value=mock_invoice)
        mock_db.list_payments_for_user = AsyncMock(return_value=[mock_payment_record])

        response = client.get(
            "/api/v1/payments/invoices/inv-001",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "inv-001"
        assert data["amount"] == 100.0

    def test_get_invoice_not_found(self, client, mock_db):
        """Requesting a non-existent invoice returns 404."""
        mock_db.get_invoice = AsyncMock(return_value=None)

        response = client.get(
            "/api/v1/payments/invoices/nonexistent",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/payments/invoices/{invoice_id}/pdf
# ---------------------------------------------------------------------------


class TestDownloadInvoicePdf:
    """Tests for GET /api/v1/payments/invoices/{invoice_id}/pdf."""

    def test_download_invoice_pdf(self, client, mock_db, mock_invoice, mock_payment_record):
        """PDF endpoint returns downloadable HTML invoice."""
        mock_db.get_invoice = AsyncMock(return_value=mock_invoice)
        mock_db.list_payments_for_user = AsyncMock(return_value=[mock_payment_record])

        response = client.get(
            "/api/v1/payments/invoices/inv-001/pdf",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "inv-001" in response.text
