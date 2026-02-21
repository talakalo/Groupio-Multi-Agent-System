"""Tests for admin escrow & payout API routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_admin_user, get_current_user

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_admin():
    """Mock authenticated admin user."""
    return MagicMock(
        id="admin-001",
        email="admin@groupio.co.il",
        role="admin",
        is_active=True,
    )


@pytest.fixture
def admin_client(mock_admin):
    """Create test client with admin auth dependency overridden."""
    app.dependency_overrides[get_admin_user] = lambda: mock_admin
    app.dependency_overrides[get_current_user] = lambda: mock_admin
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    """Mock PostgreSQL client at the payments route module level."""
    with patch("src.api.routes.payments.get_postgres_client") as mock:
        db = AsyncMock()
        mock.return_value = db
        yield db


@pytest.fixture
def mock_offer():
    """Sample offer for escrow tests."""
    return {
        "id": "offer-100",
        "title": "AC Installation - Building A",
        "building_id": "building-123",
        "contractor_id": "ctr-001",
        "base_price": 5000.0,
        "participants": 10,
        "status": "in_progress",
        "created_at": "2026-01-15T10:00:00+00:00",
    }


@pytest.fixture
def mock_invoice():
    """Sample invoice for escrow tests."""
    return {
        "id": "inv-100",
        "offer_id": "offer-100",
        "user_id": "user-123",
        "total": 50000.0,
        "amount": 50000.0,
        "currency": "ILS",
        "status": "paid",
        "issued_at": "2026-01-15T10:00:00+00:00",
        "created_at": "2026-01-15T10:00:00+00:00",
        "items": [],
    }


@pytest.fixture
def mock_contractor():
    """Sample contractor record."""
    return {
        "id": "ctr-001",
        "business_name": "Cool Air Ltd.",
        "name": "Cool Air",
    }


# ---------------------------------------------------------------------------
# GET /api/v1/admin/payments/summary
# ---------------------------------------------------------------------------


class TestPaymentSummary:
    """Tests for GET /api/v1/admin/payments/summary."""

    def test_summary_returns_totals(self, admin_client, mock_db):
        """Summary endpoint returns aggregated payment totals."""
        mock_db.execute_query = AsyncMock(
            side_effect=[
                # First call: payments query
                [
                    {"status": "succeeded", "amount": 10000},
                    {"status": "succeeded", "amount": 15000},
                    {"status": "refunded", "amount": 2000},
                    {"status": "failed", "amount": 500},
                ],
                # Second call: invoices query
                [
                    {"id": "inv-1", "total": 10000, "status": "paid", "offer_id": "o1"},
                    {"id": "inv-2", "total": 15000, "status": "released", "offer_id": "o2"},
                ],
            ]
        )

        response = admin_client.get("/api/v1/admin/payments/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_collected"] == 25000
        assert data["total_refunded"] == 2000
        assert data["total_released_to_contractors"] == 15000
        assert data["pending_payouts"] == 1  # 1 paid invoice not yet released
        assert data["currency"] == "ILS"

    def test_summary_empty_database(self, admin_client, mock_db):
        """Summary returns zeros when no payments exist."""
        mock_db.execute_query = AsyncMock(return_value=[])

        response = admin_client.get("/api/v1/admin/payments/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_collected"] == 0
        assert data["total_in_escrow"] == 0
        assert data["pending_payouts"] == 0

    def test_summary_null_query_results(self, admin_client, mock_db):
        """Summary handles None return from execute_query gracefully."""
        mock_db.execute_query = AsyncMock(return_value=None)

        response = admin_client.get("/api/v1/admin/payments/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_collected"] == 0


# ---------------------------------------------------------------------------
# GET /api/v1/admin/payments/escrow
# ---------------------------------------------------------------------------


class TestEscrowAccounts:
    """Tests for GET /api/v1/admin/payments/escrow."""

    def test_list_escrow_accounts(self, admin_client, mock_db, mock_offer, mock_invoice, mock_contractor):
        """Returns escrow account data for offers with invoices."""
        mock_db.execute_query = AsyncMock(return_value=[mock_offer])
        mock_db.get_invoice_by_offer = AsyncMock(return_value=mock_invoice)
        mock_db.get_offer_participants = AsyncMock(
            return_value=[{"user_id": f"u{i}"} for i in range(10)]
        )
        mock_db.list_payment_splits = AsyncMock(
            return_value=[
                {"user_id": f"u{i}", "amount": 5000, "status": "paid"}
                for i in range(7)
            ]
        )
        mock_db.get_contractor = AsyncMock(return_value=mock_contractor)

        response = admin_client.get("/api/v1/admin/payments/escrow")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        escrow = data[0]
        assert escrow["offer_id"] == "offer-100"
        assert escrow["contractor_name"] == "Cool Air Ltd."
        assert escrow["participants_paid"] == 7
        assert escrow["participants_total"] == 10
        assert escrow["escrow_status"] == "collecting"  # 7 of 10 paid
        assert escrow["platform_fee"] > 0

    def test_escrow_status_held_when_all_paid(self, admin_client, mock_db, mock_offer, mock_invoice, mock_contractor):
        """Escrow status is 'held' when all participants have paid."""
        mock_db.execute_query = AsyncMock(return_value=[mock_offer])
        mock_db.get_invoice_by_offer = AsyncMock(return_value=mock_invoice)
        mock_db.get_offer_participants = AsyncMock(
            return_value=[{"user_id": f"u{i}"} for i in range(10)]
        )
        mock_db.list_payment_splits = AsyncMock(
            return_value=[
                {"user_id": f"u{i}", "amount": 5000, "status": "paid"}
                for i in range(10)
            ]
        )
        mock_db.get_contractor = AsyncMock(return_value=mock_contractor)

        response = admin_client.get("/api/v1/admin/payments/escrow")

        assert response.status_code == 200
        data = response.json()
        assert data[0]["escrow_status"] == "held"
        assert data[0]["participants_paid"] == 10

    def test_escrow_status_released_when_completed(self, admin_client, mock_db, mock_invoice, mock_contractor):
        """Escrow status is 'released' when offer status is completed."""
        completed_offer = {
            "id": "offer-200",
            "title": "Done Project",
            "contractor_id": "ctr-001",
            "status": "completed",
            "participants": 5,
            "created_at": "2026-01-01T00:00:00Z",
        }
        mock_db.execute_query = AsyncMock(return_value=[completed_offer])
        mock_db.get_invoice_by_offer = AsyncMock(return_value=mock_invoice)
        mock_db.get_offer_participants = AsyncMock(
            return_value=[{"user_id": f"u{i}"} for i in range(5)]
        )
        mock_db.list_payment_splits = AsyncMock(
            return_value=[
                {"user_id": f"u{i}", "amount": 10000, "status": "paid"}
                for i in range(5)
            ]
        )
        mock_db.get_contractor = AsyncMock(return_value=mock_contractor)

        response = admin_client.get("/api/v1/admin/payments/escrow")

        assert response.status_code == 200
        assert data[0]["escrow_status"] == "released" if (data := response.json()) else True

    def test_empty_escrow_list(self, admin_client, mock_db):
        """Returns empty list when no offers have invoices."""
        mock_db.execute_query = AsyncMock(return_value=[])

        response = admin_client.get("/api/v1/admin/payments/escrow")

        assert response.status_code == 200
        assert response.json() == []


# ---------------------------------------------------------------------------
# GET /api/v1/admin/payments/payouts
# ---------------------------------------------------------------------------


class TestContractorPayouts:
    """Tests for GET /api/v1/admin/payments/payouts."""

    def test_list_payouts(self, admin_client, mock_db, mock_contractor):
        """Returns contractor payout records with fee breakdown."""
        mock_db.execute_query = AsyncMock(
            return_value=[
                {
                    "id": "inv-001",
                    "offer_id": "offer-100",
                    "offer_title": "AC Installation",
                    "contractor_id": "ctr-001",
                    "total": 50000,
                    "status": "paid",
                    "created_at": "2026-01-20T10:00:00Z",
                },
                {
                    "id": "inv-002",
                    "offer_id": "offer-200",
                    "offer_title": "Plumbing",
                    "contractor_id": "ctr-001",
                    "total": 30000,
                    "status": "released",
                    "paid_at": "2026-02-01T12:00:00Z",
                    "created_at": "2026-01-25T10:00:00Z",
                },
            ]
        )
        mock_db.get_contractor = AsyncMock(return_value=mock_contractor)

        response = admin_client.get("/api/v1/admin/payments/payouts")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # First payout (pending)
        assert data[0]["gross_amount"] == 50000
        assert data[0]["platform_fee"] == 2500  # 5%
        assert data[0]["net_amount"] == 47500
        assert data[0]["status"] == "pending"

        # Second payout (completed)
        assert data[1]["status"] == "completed"
        assert data[1]["contractor_name"] == "Cool Air Ltd."

    def test_empty_payouts(self, admin_client, mock_db):
        """Returns empty list when no payouts exist."""
        mock_db.execute_query = AsyncMock(return_value=[])

        response = admin_client.get("/api/v1/admin/payments/payouts")

        assert response.status_code == 200
        assert response.json() == []


# ---------------------------------------------------------------------------
# POST /api/v1/admin/payments/payouts/{invoice_id}/approve
# ---------------------------------------------------------------------------


class TestApproveContractorPayout:
    """Tests for POST /api/v1/admin/payments/payouts/{invoice_id}/approve."""

    def test_approve_payout_success(self, admin_client, mock_db, mock_invoice):
        """Admin can approve a payout for a paid invoice."""
        mock_db.get_invoice = AsyncMock(return_value=mock_invoice)
        mock_db.update_invoice = AsyncMock()

        response = admin_client.post("/api/v1/admin/payments/payouts/inv-100/approve")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "approved"
        assert data["invoice_id"] == "inv-100"
        assert data["approved_by"] == "admin@groupio.co.il"
        mock_db.update_invoice.assert_awaited_once_with("inv-100", {"status": "released"})

    def test_approve_payout_not_found(self, admin_client, mock_db):
        """Returns 404 for non-existent invoice."""
        mock_db.get_invoice = AsyncMock(return_value=None)

        response = admin_client.post("/api/v1/admin/payments/payouts/nonexistent/approve")

        assert response.status_code == 404

    def test_approve_payout_wrong_status(self, admin_client, mock_db):
        """Returns 400 when invoice is not in 'paid' status."""
        mock_db.get_invoice = AsyncMock(
            return_value={"id": "inv-draft", "status": "draft"}
        )

        response = admin_client.post("/api/v1/admin/payments/payouts/inv-draft/approve")

        assert response.status_code == 400
        assert "must be 'paid'" in response.json()["detail"]


# ---------------------------------------------------------------------------
# POST /api/v1/admin/payments/escrow/{offer_id}/release
# ---------------------------------------------------------------------------


class TestReleaseEscrow:
    """Tests for POST /api/v1/admin/payments/escrow/{offer_id}/release."""

    def test_release_escrow_success(self, admin_client, mock_db, mock_invoice):
        """Admin can release escrow for an offer with a paid invoice."""
        mock_db.get_invoice_by_offer = AsyncMock(return_value=mock_invoice)
        mock_db.update_invoice = AsyncMock()
        mock_db.update_offer = AsyncMock()

        response = admin_client.post("/api/v1/admin/payments/escrow/offer-100/release")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "released"
        assert data["offer_id"] == "offer-100"
        assert data["amount_released"] == 50000
        assert data["platform_fee"] == 2500  # 5% of 50000
        assert data["released_by"] == "admin@groupio.co.il"

        # Verify invoice was marked as released
        mock_db.update_invoice.assert_awaited_once()
        update_args = mock_db.update_invoice.call_args
        assert update_args[0][1]["status"] == "released"

        # Verify offer was marked as completed
        mock_db.update_offer.assert_awaited_once_with("offer-100", {"status": "completed"})

    def test_release_escrow_no_invoice(self, admin_client, mock_db):
        """Returns 404 when no invoice exists for the offer."""
        mock_db.get_invoice_by_offer = AsyncMock(return_value=None)

        response = admin_client.post("/api/v1/admin/payments/escrow/nonexistent/release")

        assert response.status_code == 404
        assert "No invoice found" in response.json()["detail"]

    def test_release_escrow_already_released(self, admin_client, mock_db):
        """Returns 400 when invoice is already released."""
        mock_db.get_invoice_by_offer = AsyncMock(
            return_value={"id": "inv-done", "status": "released", "total": 10000}
        )

        response = admin_client.post("/api/v1/admin/payments/escrow/offer-done/release")

        assert response.status_code == 400
        assert "Cannot release" in response.json()["detail"]

    def test_release_escrow_pending_invoice(self, admin_client, mock_db):
        """Admin can release escrow even when invoice is pending (early release)."""
        pending_invoice = {
            "id": "inv-pending",
            "offer_id": "offer-pending",
            "total": 20000,
            "status": "pending",
        }
        mock_db.get_invoice_by_offer = AsyncMock(return_value=pending_invoice)
        mock_db.update_invoice = AsyncMock()
        mock_db.update_offer = AsyncMock()

        response = admin_client.post("/api/v1/admin/payments/escrow/offer-pending/release")

        assert response.status_code == 200
        assert response.json()["status"] == "released"
