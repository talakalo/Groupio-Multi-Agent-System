"""Unit tests for the payments API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole


def _make_user(role: UserRole = UserRole.RESIDENT) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        building_id="b1",
        created_at=now,
        updated_at=now,
    )


def _make_payment(**kwargs) -> dict:
    now = datetime.now(UTC)
    base = {
        "id": "pay-1",
        "user_id": "user-1",
        "offer_id": "o1",
        "amount": 1000.0,
        "currency": "ILS",
        "status": "pending",
        "transaction_id": None,
        "created_at": now.isoformat(),
    }
    base.update(kwargs)
    return base


class TestGetMyPayments:
    def test_get_my_payments_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.list_payments_for_user = AsyncMock(return_value=[_make_payment()])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/my")
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)
        finally:
            app.dependency_overrides.clear()

    def test_get_my_payments_empty(self):
        user = _make_user()
        db = AsyncMock()
        db.list_payments_for_user = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/my")
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            app.dependency_overrides.clear()


class TestGetPayment:
    def test_get_payment_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_payment = AsyncMock(return_value=_make_payment())

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/pay-1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_payment_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_payment = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_payment_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_payment = AsyncMock(return_value=_make_payment(user_id="other-user"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/pay-1")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestGetInvoice:
    def test_get_invoice_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_invoice = AsyncMock(
            return_value={
                "id": "inv-1",
                "offer_id": "o1",
                "total": 5000.0,
                "currency": "ILS",
                "status": "pending",
                "payment_type": "escrow",
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        db.list_payments_for_user = AsyncMock(return_value=[_make_payment(invoice_id="inv-1")])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/invoices/inv-1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_invoice_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_invoice = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/invoices/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_get_invoice_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_invoice = AsyncMock(return_value={"id": "inv-1", "offer_id": "o1"})
        db.list_payments_for_user = AsyncMock(return_value=[])  # user has no payments for this invoice

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/invoices/inv-1")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestDownloadInvoicePdf:
    def test_download_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_invoice = AsyncMock(
            return_value={
                "id": "inv-1",
                "offer_id": "o1",
                "amount": 5000.0,
                "currency": "ILS",
                "items": [],
            }
        )
        db.list_payments_for_user = AsyncMock(return_value=[_make_payment(invoice_id="inv-1")])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/invoices/inv-1/pdf")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_download_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_invoice = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/invoices/missing/pdf")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_download_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_invoice = AsyncMock(return_value={"id": "inv-1", "offer_id": "o1"})
        db.list_payments_for_user = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/invoices/inv-1/pdf")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestContractorEarnings:
    def test_contractor_earnings_ok(self):
        base = _make_user(role=UserRole.CONTRACTOR)
        user = base.model_copy(update={"contractor_id": "ctr-1"})
        db = AsyncMock()
        db.list_invoices_for_contractor = AsyncMock(
            return_value=[
                {
                    "id": "inv-1",
                    "offer_id": "o1",
                    "status": "pending",
                    "payment_type": "escrow",
                    "total": 100.0,
                    "currency": "ILS",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "paid_at": None,
                },
                {
                    "id": "inv-2",
                    "offer_id": "o2",
                    "status": "paid",
                    "payment_type": "direct",
                    "total": 200.0,
                    "currency": "ILS",
                    "created_at": "2026-01-02T00:00:00+00:00",
                    "paid_at": "2026-01-03T00:00:00+00:00",
                },
            ]
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/contractor/earnings")
            assert resp.status_code == 200
            data = resp.json()
            assert data["pending_total"] == 100.0
            assert data["completed_total"] == 200.0
            assert data["held_escrow_total"] == 100.0
            assert len(data["recent"]) == 2
        finally:
            app.dependency_overrides.clear()

    def test_contractor_earnings_forbidden_resident(self):
        user = _make_user(role=UserRole.RESIDENT)
        db = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/contractor/earnings")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_contractor_earnings_missing_contractor_profile(self):
        base = _make_user(role=UserRole.CONTRACTOR)
        user = base.model_copy(update={"contractor_id": None})
        db = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.payments.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/payments/contractor/earnings")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestStripeWebhookPaymentIntent:
    """Stripe webhook applies payment + invoice updates via a single DB helper."""

    def test_payment_intent_succeeded_calls_update_payment_and_invoice_for_webhook(self):
        db = AsyncMock()
        db.get_payment_by_transaction = AsyncMock(
            return_value={
                "id": "pay-1",
                "user_id": "user-1",
                "invoice_id": "inv-1",
                "transaction_id": "pi_abc",
            }
        )
        db.update_payment_and_invoice_for_webhook = AsyncMock()

        fake_settings = MagicMock()
        fake_settings.STRIPE_WEBHOOK_SECRET = ""
        fake_settings.ENVIRONMENT = "development"

        from src.api.main import app

        with (
            patch("src.api.routes.payments.get_postgres_client", return_value=db),
            patch("src.api.routes.payments.get_settings", return_value=fake_settings),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/payments/webhook/stripe",
                json={
                    "type": "payment_intent.succeeded",
                    "data": {"object": {"id": "pi_abc"}},
                },
            )

        assert resp.status_code == 200
        assert resp.json().get("status") == "processed"
        db.update_payment_and_invoice_for_webhook.assert_awaited_once_with(
            "pay-1",
            "inv-1",
            "succeeded",
            "paid",
        )
