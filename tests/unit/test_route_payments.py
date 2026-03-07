"""Unit tests for the payments API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

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
        db.list_payments_for_user = AsyncMock(
            return_value=[_make_payment(invoice_id="inv-1")]
        )

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
        db.list_payments_for_user = AsyncMock(
            return_value=[_make_payment(invoice_id="inv-1")]
        )

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
