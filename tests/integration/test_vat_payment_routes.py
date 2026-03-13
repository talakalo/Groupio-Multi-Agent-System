"""Integration tests for Israeli VAT (מע"מ 18%) in payment routes.

Covers the full HTTP layer for:
- POST /payments/initiate  — VAT calculation, provider charge, response fields
- GET  /payments/my        — VAT fields in payment list (stored & back-calculated)
- GET  /payments/invoices/{id}          — VAT fields in invoice response
- GET  /payments/invoices/{id}/pdf      — Hebrew VAT rows in the HTML invoice

All DB calls are mocked; the tests exercise route logic, schema serialisation,
and HTML generation end-to-end.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

VAT_RATE = 0.18
PRICE_PER_UNIT = 1000.0       # offer base price
EXPECTED_TAX = round(PRICE_PER_UNIT * VAT_RATE, 2)   # 180.00
EXPECTED_TOTAL = round(PRICE_PER_UNIT + EXPECTED_TAX, 2)  # 1180.00


@pytest.fixture
def mock_user():
    return MagicMock(id="u-vat", email="vat@test.com", role="resident", is_active=True)


@pytest.fixture
def client(mock_user):
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    """Mock postgres client injected into payments route."""
    with patch("src.api.routes.payments.get_postgres_client") as mock:
        db = AsyncMock()
        _txn_cm = AsyncMock()
        db.transaction = MagicMock(return_value=_txn_cm)
        mock.return_value = db
        yield db


@pytest.fixture
def mock_offer():
    return {
        "id": "offer-vat",
        "title": "AC Installation",
        "building_id": "bld-1",
        "price_per_unit": PRICE_PER_UNIT,
        "status": "active",
    }


@pytest.fixture
def mock_provider():
    """Mock payment provider that succeeds immediately."""
    with patch("src.api.routes.payments.get_payment_provider") as mock_pp:
        provider = AsyncMock()
        provider.create_charge = AsyncMock(
            return_value={
                "transaction_id": "txn_vat_001",
                "status": "succeeded",
                "amount": EXPECTED_TOTAL,
                "client_secret": None,
            }
        )
        mock_pp.return_value = provider
        yield provider


# ---------------------------------------------------------------------------
# POST /payments/initiate — VAT calculation
# ---------------------------------------------------------------------------


class TestInitiatePaymentVAT:
    """Verify VAT is computed correctly when initiating a payment."""

    def _setup_db(self, db, offer):
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.get_contractor = AsyncMock(return_value=None)
        db.get_invoice_for_offer = AsyncMock(return_value=None)
        db.create_invoice = AsyncMock()
        db.create_payment = AsyncMock()
        db.update_invoice = AsyncMock()

    def test_response_includes_vat_fields(self, client, mock_db, mock_offer, mock_provider):
        """Response must contain subtotal, tax_rate, tax_amount, and amount."""
        self._setup_db(mock_db, mock_offer)

        resp = client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "subtotal" in data
        assert "tax_rate" in data
        assert "tax_amount" in data
        assert "amount" in data

    def test_vat_arithmetic_is_correct(self, client, mock_db, mock_offer, mock_provider):
        """subtotal + 18% VAT = amount; tax_rate == 0.18."""
        self._setup_db(mock_db, mock_offer)

        resp = client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        data = resp.json()

        assert data["subtotal"] == pytest.approx(PRICE_PER_UNIT)
        assert data["tax_rate"] == pytest.approx(VAT_RATE)
        assert data["tax_amount"] == pytest.approx(EXPECTED_TAX)
        assert data["amount"] == pytest.approx(EXPECTED_TOTAL)

    def test_provider_charged_with_inclusive_total(self, client, mock_db, mock_offer, mock_provider):
        """Payment provider receives the VAT-inclusive total, not just the base price."""
        self._setup_db(mock_db, mock_offer)

        client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        mock_provider.create_charge.assert_awaited_once()
        charged_amount = mock_provider.create_charge.call_args.kwargs.get(
            "amount", mock_provider.create_charge.call_args[0][0]
        )
        # Accept both positional (amount=X) and keyword calling conventions
        call_kwargs = mock_provider.create_charge.call_args[1]
        call_args = mock_provider.create_charge.call_args[0]
        amount_charged = call_kwargs.get("amount") if call_kwargs else call_args[0]

        assert amount_charged == pytest.approx(EXPECTED_TOTAL), (
            f"Provider should be charged {EXPECTED_TOTAL} (incl. VAT) "
            f"not {PRICE_PER_UNIT} (excl. VAT)"
        )

    def test_invoice_data_contains_both_tax_keys(self, client, mock_db, mock_offer, mock_provider):
        """Invoice data passed to DB has both 'tax_amount' (API key) and 'tax' (DB column)."""
        self._setup_db(mock_db, mock_offer)

        client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        mock_db.create_invoice.assert_awaited_once()
        invoice_arg = mock_db.create_invoice.call_args[0][0]

        assert "tax_amount" in invoice_arg, "invoice_data must have 'tax_amount' for the API"
        assert "tax" in invoice_arg, "invoice_data must have 'tax' for the DB column"
        assert invoice_arg["tax"] == pytest.approx(EXPECTED_TAX)
        assert invoice_arg["tax_amount"] == pytest.approx(EXPECTED_TAX)

    def test_invoice_data_subtotal_and_total(self, client, mock_db, mock_offer, mock_provider):
        """Invoice data has correct subtotal (ex-VAT) and amount/total (incl-VAT)."""
        self._setup_db(mock_db, mock_offer)

        client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        invoice_arg = mock_db.create_invoice.call_args[0][0]
        assert invoice_arg["subtotal"] == pytest.approx(PRICE_PER_UNIT)
        assert invoice_arg["tax_rate"] == pytest.approx(VAT_RATE)
        assert invoice_arg["amount"] == pytest.approx(EXPECTED_TOTAL)

    def test_payment_data_contains_vat_fields(self, client, mock_db, mock_offer, mock_provider):
        """Payment record passed to DB includes subtotal, tax_rate, tax_amount."""
        self._setup_db(mock_db, mock_offer)

        client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        mock_db.create_payment.assert_awaited_once()
        payment_arg = mock_db.create_payment.call_args[0][0]

        assert payment_arg["subtotal"] == pytest.approx(PRICE_PER_UNIT)
        assert payment_arg["tax_rate"] == pytest.approx(VAT_RATE)
        assert payment_arg["tax_amount"] == pytest.approx(EXPECTED_TAX)
        assert payment_arg["amount"] == pytest.approx(EXPECTED_TOTAL)

    def test_existing_invoice_vat_fields_reused(self, client, mock_db, mock_offer, mock_provider):
        """When an invoice already exists, its VAT fields are used for the charge."""
        existing_invoice = {
            "id": "inv-existing",
            "offer_id": "offer-vat",
            "subtotal": 800.0,
            "tax_rate": 0.18,
            "tax_amount": 144.0,
            "amount": 944.0,
            "payment_type": "escrow",
            "status": "pending",
        }
        mock_db.get_offer = AsyncMock(return_value=mock_offer)
        mock_db.is_user_in_building = AsyncMock(return_value=True)
        mock_db.get_contractor = AsyncMock(return_value=None)
        mock_db.get_invoice_for_offer = AsyncMock(return_value=existing_invoice)
        mock_db.create_invoice = AsyncMock()
        mock_db.create_payment = AsyncMock()
        mock_db.update_invoice = AsyncMock()

        resp = client.post(
            "/api/v1/payments/initiate",
            json={"offer_id": "offer-vat"},
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        data = resp.json()
        # Provider should charge the existing invoice total (944), not recalculate
        amount_charged = mock_provider.create_charge.call_args[1].get(
            "amount"
        ) or mock_provider.create_charge.call_args[0][0]
        assert amount_charged == pytest.approx(944.0)
        # New invoice must NOT be created (one already exists)
        mock_db.create_invoice.assert_not_awaited()


# ---------------------------------------------------------------------------
# GET /payments/my — VAT fields in payment list
# ---------------------------------------------------------------------------


class TestGetMyPaymentsVAT:
    """GET /payments/my returns VAT fields, back-calculating when necessary."""

    def test_stored_vat_fields_returned_directly(self, client, mock_db):
        """When DB record has subtotal/tax_amount, they are returned as-is."""
        payment_with_vat = {
            "id": "pay-full",
            "user_id": "u-vat",
            "offer_id": "offer-1",
            "amount": 1180.0,
            "subtotal": 1000.0,
            "tax_rate": 0.18,
            "tax_amount": 180.0,
            "currency": "ILS",
            "status": "succeeded",
            "transaction_id": "txn_abc",
            "created_at": datetime.now(UTC).isoformat(),
        }
        mock_db.list_payments_for_user = AsyncMock(return_value=[payment_with_vat])

        resp = client.get("/api/v1/payments/my", headers={"Authorization": "Bearer tok"})

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        p = data[0]
        assert p["amount"] == pytest.approx(1180.0)
        assert p["subtotal"] == pytest.approx(1000.0)
        assert p["tax_rate"] == pytest.approx(0.18)
        assert p["tax_amount"] == pytest.approx(180.0)

    def test_vat_back_calculated_when_missing(self, client, mock_db):
        """When DB record has only 'amount', subtotal & tax are back-calculated."""
        legacy_payment = {
            "id": "pay-legacy",
            "user_id": "u-vat",
            "offer_id": "offer-1",
            "amount": 1180.0,   # total only — no subtotal/tax fields
            "currency": "ILS",
            "status": "succeeded",
            "created_at": datetime.now(UTC).isoformat(),
        }
        mock_db.list_payments_for_user = AsyncMock(return_value=[legacy_payment])

        resp = client.get("/api/v1/payments/my", headers={"Authorization": "Bearer tok"})

        assert resp.status_code == 200
        data = resp.json()
        p = data[0]
        # Back-calculated values (1180 / 1.18 = 1000)
        assert p["subtotal"] == pytest.approx(1000.0, abs=1.0)
        assert p["tax_amount"] == pytest.approx(180.0, abs=1.0)
        assert p["amount"] == pytest.approx(1180.0)

    def test_vat_fields_present_for_all_payments(self, client, mock_db):
        """Every payment in the list exposes subtotal, tax_rate, tax_amount, amount."""
        payments = [
            {
                "id": f"pay-{i}",
                "user_id": "u-vat",
                "offer_id": "offer-1",
                "amount": 590.0 * i,
                "currency": "ILS",
                "status": "succeeded",
                "created_at": datetime.now(UTC).isoformat(),
            }
            for i in range(1, 4)
        ]
        mock_db.list_payments_for_user = AsyncMock(return_value=payments)

        resp = client.get("/api/v1/payments/my", headers={"Authorization": "Bearer tok"})

        assert resp.status_code == 200
        for item in resp.json():
            assert "subtotal" in item
            assert "tax_rate" in item
            assert "tax_amount" in item
            assert "amount" in item


# ---------------------------------------------------------------------------
# GET /payments/invoices/{id} — VAT fields in invoice response
# ---------------------------------------------------------------------------


class TestGetInvoiceVAT:
    """GET /invoices/{id} response includes VAT breakdown fields."""

    def test_stored_vat_fields_returned(self, client, mock_db):
        """Invoice with stored VAT fields returns them directly."""
        invoice = {
            "id": "inv-vat",
            "offer_id": "offer-1",
            "subtotal": 2000.0,
            "tax_rate": 0.18,
            "tax_amount": 360.0,
            "total": 2360.0,
            "currency": "ILS",
            "status": "paid",
            "payment_type": "direct",
            "created_at": datetime.now(UTC).isoformat(),
        }
        payment_ref = {
            "id": "pay-x",
            "user_id": "u-vat",
            "invoice_id": "inv-vat",
        }
        mock_db.get_invoice = AsyncMock(return_value=invoice)
        mock_db.list_payments_for_user = AsyncMock(return_value=[payment_ref])

        resp = client.get(
            "/api/v1/payments/invoices/inv-vat",
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["subtotal"] == pytest.approx(2000.0)
        assert data["tax_rate"] == pytest.approx(0.18)
        assert data["tax_amount"] == pytest.approx(360.0)
        assert data["amount"] == pytest.approx(2360.0)

    def test_vat_back_calculated_when_only_total_stored(self, client, mock_db):
        """Legacy invoice with only 'amount' field gets VAT back-calculated."""
        legacy_invoice = {
            "id": "inv-legacy",
            "offer_id": "offer-1",
            "amount": 1180.0,   # total only, no subtotal/tax_amount
            "currency": "ILS",
            "status": "pending",
            "payment_type": "escrow",
            "created_at": datetime.now(UTC).isoformat(),
        }
        payment_ref = {"id": "pay-y", "user_id": "u-vat", "invoice_id": "inv-legacy"}
        mock_db.get_invoice = AsyncMock(return_value=legacy_invoice)
        mock_db.list_payments_for_user = AsyncMock(return_value=[payment_ref])

        resp = client.get(
            "/api/v1/payments/invoices/inv-legacy",
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["amount"] == pytest.approx(1180.0)
        # Back-calculated
        assert data["subtotal"] == pytest.approx(1000.0, abs=1.0)
        assert data["tax_amount"] == pytest.approx(180.0, abs=1.0)

    def test_invoice_response_always_has_vat_fields(self, client, mock_db):
        """Invoice response schema always includes all four price fields."""
        invoice = {
            "id": "inv-z",
            "offer_id": "offer-1",
            "total": 500.0,
            "currency": "ILS",
            "status": "pending",
            "created_at": datetime.now(UTC).isoformat(),
        }
        payment_ref = {"id": "pay-z", "user_id": "u-vat", "invoice_id": "inv-z"}
        mock_db.get_invoice = AsyncMock(return_value=invoice)
        mock_db.list_payments_for_user = AsyncMock(return_value=[payment_ref])

        resp = client.get(
            "/api/v1/payments/invoices/inv-z",
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        data = resp.json()
        for field in ("subtotal", "tax_rate", "tax_amount", "amount"):
            assert field in data, f"InvoiceResponse must contain '{field}'"


# ---------------------------------------------------------------------------
# GET /payments/invoices/{id}/pdf — Hebrew VAT rows in HTML invoice
# ---------------------------------------------------------------------------


class TestInvoicePDFVAT:
    """The HTML invoice PDF contains proper Hebrew VAT rows and correct amounts."""

    @pytest.fixture
    def vat_invoice(self):
        return {
            "id": "inv-pdf",
            "offer_id": "offer-1",
            "invoice_number": "INV-2026-00001",
            "subtotal": 1000.0,
            "tax_rate": 0.18,
            "tax_amount": 180.0,
            "total": 1180.0,
            "currency": "ILS",
            "status": "paid",
            "created_at": "2026-03-13T10:00:00+00:00",
            "items": [
                {
                    "description": "התקנת מזגן",
                    "quantity": 1,
                    "unit_price": 1000.0,
                    "tax_amount": 180.0,
                    "total": 1180.0,
                }
            ],
        }

    @pytest.fixture
    def pdf_client(self, client, mock_db, vat_invoice):
        payment_ref = {"id": "pay-pdf", "user_id": "u-vat", "invoice_id": "inv-pdf"}
        mock_db.get_invoice = AsyncMock(return_value=vat_invoice)
        mock_db.list_payments_for_user = AsyncMock(return_value=[payment_ref])
        return client

    def test_pdf_returns_html(self, pdf_client):
        """PDF endpoint returns HTTP 200 with text/html content-type."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")

    def test_pdf_has_hebrew_invoice_title(self, pdf_client):
        """HTML contains the Hebrew title 'חשבונית מס'."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "חשבונית מס" in resp.text

    def test_pdf_has_hebrew_vat_label(self, pdf_client):
        """HTML contains 'מע\"מ' (Hebrew for VAT)."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "מע" in resp.text  # 'מע"מ' contains 'מע' — avoids quote escaping issues

    def test_pdf_has_subtotal_label(self, pdf_client):
        """HTML shows 'לפני מע\"מ' (before VAT) label."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "לפני" in resp.text

    def test_pdf_has_total_label(self, pdf_client):
        """HTML shows 'סה\"כ' (total) label."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "סה" in resp.text  # 'סה"כ' — avoids quote escaping

    def test_pdf_shows_18_percent(self, pdf_client):
        """HTML explicitly shows '18%' VAT rate."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "18%" in resp.text

    def test_pdf_shows_subtotal_amount(self, pdf_client):
        """HTML contains the pre-VAT subtotal amount (1,000.00)."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        # 1000.00 formatted — check for the number in some form
        assert "1,000.00" in resp.text

    def test_pdf_shows_tax_amount(self, pdf_client):
        """HTML contains the VAT amount (180.00)."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "180.00" in resp.text

    def test_pdf_shows_total_amount(self, pdf_client):
        """HTML contains the VAT-inclusive total (1,180.00)."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "1,180.00" in resp.text

    def test_pdf_has_invoice_number(self, pdf_client):
        """HTML contains the formatted invoice number."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "INV-2026-00001" in resp.text

    def test_pdf_has_legal_note_about_vat_law(self, pdf_client):
        """HTML contains the legal reference to the Israeli VAT law."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        # Legal note references the VAT regulation year 1975
        assert "1975" in resp.text

    def test_pdf_contains_groupio_branding(self, pdf_client):
        """HTML contains the Groupio platform name."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert "Groupio" in resp.text

    def test_pdf_is_rtl(self, pdf_client):
        """HTML document has RTL direction attribute."""
        resp = pdf_client.get(
            "/api/v1/payments/invoices/inv-pdf/pdf",
            headers={"Authorization": "Bearer tok"},
        )
        assert 'dir="rtl"' in resp.text or "dir='rtl'" in resp.text

    def test_pdf_without_items_shows_fallback(self, client, mock_db):
        """Invoice with no items uses a fallback row with the total amount."""
        invoice_no_items = {
            "id": "inv-noitems",
            "offer_id": "offer-1",
            "subtotal": 500.0,
            "tax_rate": 0.18,
            "tax_amount": 90.0,
            "total": 590.0,
            "currency": "ILS",
            "status": "pending",
            "created_at": "2026-03-13T10:00:00+00:00",
            "items": [],
        }
        payment_ref = {"id": "pay-ni", "user_id": "u-vat", "invoice_id": "inv-noitems"}
        mock_db.get_invoice = AsyncMock(return_value=invoice_no_items)
        mock_db.list_payments_for_user = AsyncMock(return_value=[payment_ref])

        resp = client.get(
            "/api/v1/payments/invoices/inv-noitems/pdf",
            headers={"Authorization": "Bearer tok"},
        )

        assert resp.status_code == 200
        assert "590.00" in resp.text   # total is rendered somewhere in the page


# ---------------------------------------------------------------------------
# Agent handover: router → payment agent for VAT-related queries
# ---------------------------------------------------------------------------


class TestPaymentAgentVATHandover:
    """Verify the payment agent correctly handles VAT/invoice queries and agent state."""

    @pytest.fixture
    def payment_agent(self):
        with (
            patch("src.agents.base.get_llm_client") as mock_llm,
            patch("src.agents.base.get_rag_pipeline") as mock_rag,
            patch("src.agents.payment.get_postgres_client") as mock_pg,
        ):
            mock_llm.return_value = AsyncMock()
            mock_rag.return_value = AsyncMock()
            mock_db = AsyncMock()
            mock_db.list_payments_for_user = AsyncMock(return_value=[])
            mock_pg.return_value = mock_db

            from src.agents.payment import PaymentAgent

            agent = PaymentAgent()
            agent.llm_client = AsyncMock()
            yield agent, mock_db

    @pytest.fixture
    def payment_state(self, sample_agent_state):
        state = dict(sample_agent_state)
        state["current_agent"] = "payment"
        return state

    @pytest.mark.asyncio
    async def test_invoice_request_for_vat_query(self, payment_agent, payment_state):
        """Message asking about 'חשבונית' is classified as invoice_request."""
        agent, mock_db = payment_agent
        payment_state["messages"] = [
            {"role": "user", "content": "אני רוצה לקבל את החשבונית שלי עם פירוט המע\"מ"}
        ]
        payment_state["offer_id"] = "offer-vat-1"

        mock_db.get_invoice_for_offer = AsyncMock(
            return_value={
                "id": "inv-001",
                "offer_id": "offer-vat-1",
                "subtotal": 1000.0,
                "tax_rate": 0.18,
                "tax_amount": 180.0,
                "total": 1180.0,
            }
        )
        agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": "החשבונית שלך מצורפת, כולל פירוט מע\"מ 18%.",
                "usage": {"input_tokens": 80, "output_tokens": 30},
            }
        )

        result = await agent.run(payment_state)

        action = result["actions_taken"][0]
        assert action["action"] == "invoice_request"
        assert action["details"]["invoice_found"] is True
        assert action["response"]["invoice"]["id"] == "inv-001"

    @pytest.mark.asyncio
    async def test_payment_status_after_vat_payment(self, payment_agent, payment_state):
        """Query about payment status works after a VAT-inclusive payment."""
        agent, mock_db = payment_agent
        payment_state["messages"] = [{"role": "user", "content": "מה סטטוס התשלום שלי?"}]

        mock_db.list_payments_for_user = AsyncMock(
            return_value=[
                {
                    "id": "pay-vat-done",
                    "amount": 1180.0,
                    "subtotal": 1000.0,
                    "tax_rate": 0.18,
                    "tax_amount": 180.0,
                    "status": "succeeded",
                    "offer_id": "offer-vat-1",
                    "created_at": "2026-03-13",
                }
            ]
        )
        agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": "תשלומך הושלם. שילמת ₪1,180 (כולל מע\"מ).",
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )

        result = await agent.run(payment_state)

        action = result["actions_taken"][0]
        assert action["action"] == "payment_status_check"
        assert action["details"]["payments_found"] == 1

    @pytest.mark.asyncio
    async def test_router_routes_payment_query_to_payment_agent(
        self, payment_state, sample_agent_state
    ):
        """Router classifies 'מע\"מ' payment query → routes to payment agent."""
        with (
            patch("src.agents.base.get_llm_client") as mock_llm,
            patch("src.agents.base.get_rag_pipeline") as mock_rag,
        ):
            mock_llm.return_value = AsyncMock()
            mock_rag.return_value = AsyncMock()

            from src.agents.router import RouterAgent

            router = RouterAgent()
            router.llm_client = AsyncMock()
            router.llm_client.create_structured_output = AsyncMock(
                return_value={
                    "intent": "payment_query",
                    "entities": {"topic": "vat"},
                    "confidence": 0.92,
                    "clarifying_question": None,
                    "suggested_agent": "payment",
                }
            )

            state = dict(sample_agent_state)
            state["messages"] = [
                {"role": "user", "content": "כמה מע\"מ שילמתי על ההזמנה שלי?"}
            ]

            result = await router.run(state)

            assert result["current_agent"] == "payment"
            assert result["intent"] == "payment_query"
