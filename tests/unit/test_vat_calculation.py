"""Unit tests for Israeli VAT (מע"מ 18%) calculation.

Covers:
- VAT_RATE constant in the payments route module (0.18)
- InvoiceService default tax_rate is 0.18
- InvoiceService calculates tax, platform_fee, total correctly at 18%
- InvoiceService stores the ``tax`` key (DB column name)
- postgres.PostgresClient.create_payment merges subtotal/tax_rate/tax_amount
  into provider_data JSON so VAT fields survive even though the payments
  table has no dedicated tax columns.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VAT_RATE = 0.18  # canonical value for all assertions below


# ---------------------------------------------------------------------------
# 1. VAT_RATE constant in the payments route
# ---------------------------------------------------------------------------


class TestVATRateConstant:
    """The route module exports VAT_RATE = 0.18."""

    def test_vat_rate_is_18_percent(self):
        """VAT_RATE constant equals 0.18 (Israeli מע"מ since 2025)."""
        from src.api.routes.payments import VAT_RATE as route_vat_rate

        assert route_vat_rate == pytest.approx(0.18)


# ---------------------------------------------------------------------------
# 2. InvoiceService — default tax_rate
# ---------------------------------------------------------------------------


class TestInvoiceServiceVAT:
    """InvoiceService uses 18% VAT by default."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.create_invoice = AsyncMock(side_effect=lambda data: data)
        db.get_next_invoice_number = AsyncMock(return_value="00001")
        return db

    @pytest.fixture
    def svc(self, mock_db):
        from src.services.invoice import InvoiceService

        with patch("src.services.invoice.get_postgres_client", return_value=mock_db):
            yield InvoiceService()

    @pytest.mark.asyncio
    async def test_default_tax_rate_is_18_percent(self, svc, mock_db):
        """create_invoice defaults to tax_rate=0.18."""
        await svc.create_invoice(offer_id="off_1", contractor_id="con_1", subtotal=1000)

        call_data = mock_db.create_invoice.call_args[0][0]
        assert call_data["tax_rate"] == pytest.approx(0.18)

    @pytest.mark.asyncio
    async def test_18pct_tax_calculation_is_correct(self, svc, mock_db):
        """Tax = 18% of subtotal; total = subtotal + tax + platform_fee."""
        await svc.create_invoice(
            offer_id="off_1",
            contractor_id="con_1",
            subtotal=1000,
            tax_rate=0.18,
            platform_fee_rate=0.05,
        )

        call_data = mock_db.create_invoice.call_args[0][0]
        assert call_data["subtotal"] == 1000
        assert call_data["tax"] == pytest.approx(180.0)        # 18%
        assert call_data["platform_fee"] == pytest.approx(50.0)  # 5%
        assert call_data["total"] == pytest.approx(1230.0)      # 1000+180+50

    @pytest.mark.asyncio
    async def test_db_data_uses_tax_column_key(self, svc, mock_db):
        """Data passed to DB uses 'tax' key (matching the invoices.tax column)."""
        await svc.create_invoice(offer_id="off_1", contractor_id="con_1", subtotal=500)

        call_data = mock_db.create_invoice.call_args[0][0]
        assert "tax" in call_data, "invoice data must contain 'tax' key for the DB column"

    @pytest.mark.asyncio
    async def test_invoice_number_format(self, svc, mock_db):
        """Invoice number follows INV-{year}-{seq} format."""
        import datetime

        result = await svc.generate_invoice_number()
        year = datetime.datetime.now(datetime.timezone.utc).year
        assert result == f"INV-{year}-00001"

    @pytest.mark.asyncio
    async def test_old_17pct_rate_still_accepted(self, svc, mock_db):
        """Passing an explicit 17% rate still works (backward-compat for existing invoices)."""
        await svc.create_invoice(
            offer_id="off_2",
            contractor_id="con_2",
            subtotal=1000,
            tax_rate=0.17,
        )

        call_data = mock_db.create_invoice.call_args[0][0]
        assert call_data["tax_rate"] == pytest.approx(0.17)
        assert call_data["tax"] == pytest.approx(170.0)


# ---------------------------------------------------------------------------
# 3. postgres.PostgresClient.create_payment — VAT merged into provider_data
# ---------------------------------------------------------------------------


class TestPostgresCreatePaymentVAT:
    """VAT fields are merged into provider_data when persisting a payment."""

    @pytest.fixture
    def pg_client(self):
        """Create a PostgresClient without a real DB connection."""
        from src.databases.postgres import PostgresClient

        client = PostgresClient.__new__(PostgresClient)
        # Disable the supabase path so we hit the raw-SQL branch
        client._use_supabase_client = MagicMock(return_value=False)
        return client

    @pytest.mark.asyncio
    async def test_vat_fields_merged_into_provider_data(self, pg_client):
        """subtotal/tax_rate/tax_amount are encoded in the provider_data JSON arg."""
        captured_args: list = []

        async def mock_pg_execute(sql, *args):
            captured_args.extend(args)

        async def mock_get_payment(payment_id):
            return {"id": payment_id}

        pg_client._pg_execute = mock_pg_execute
        pg_client.get_payment = mock_get_payment

        payment_data = {
            "id": "pay-vat-1",
            "user_id": "u-1",
            "amount": 118.0,
            "subtotal": 100.0,
            "tax_rate": 0.18,
            "tax_amount": 18.0,
            "currency": "ILS",
            "status": "pending",
            "created_at": "2026-03-13T10:00:00+00:00",
        }

        await pg_client.create_payment(payment_data)

        # provider_data is the 10th positional argument ($10) in the INSERT
        assert len(captured_args) >= 10, "expected at least 10 SQL args"
        provider_data_json = captured_args[9]
        provider_data = json.loads(provider_data_json)

        assert provider_data["subtotal"] == pytest.approx(100.0)
        assert provider_data["tax_rate"] == pytest.approx(0.18)
        assert provider_data["tax_amount"] == pytest.approx(18.0)

    @pytest.mark.asyncio
    async def test_existing_provider_data_is_preserved(self, pg_client):
        """Existing provider_data keys are not overwritten by VAT merging."""
        captured_args: list = []

        async def mock_pg_execute(sql, *args):
            captured_args.extend(args)

        async def mock_get_payment(payment_id):
            return {"id": payment_id}

        pg_client._pg_execute = mock_pg_execute
        pg_client.get_payment = mock_get_payment

        payment_data = {
            "id": "pay-vat-2",
            "user_id": "u-1",
            "amount": 118.0,
            "subtotal": 100.0,
            "tax_rate": 0.18,
            "tax_amount": 18.0,
            "provider_data": {"stripe_pi": "pi_abc123"},
            "currency": "ILS",
            "status": "pending",
            "created_at": "2026-03-13T10:00:00+00:00",
        }

        await pg_client.create_payment(payment_data)

        provider_data_json = captured_args[9]
        provider_data = json.loads(provider_data_json)

        # Both original data and VAT fields must be present
        assert provider_data["stripe_pi"] == "pi_abc123"
        assert provider_data["subtotal"] == pytest.approx(100.0)
        assert provider_data["tax_amount"] == pytest.approx(18.0)

    @pytest.mark.asyncio
    async def test_payment_without_vat_fields_still_works(self, pg_client):
        """Payments without VAT fields (e.g. legacy data) don't crash."""
        captured_args: list = []

        async def mock_pg_execute(sql, *args):
            captured_args.extend(args)

        async def mock_get_payment(payment_id):
            return {"id": payment_id}

        pg_client._pg_execute = mock_pg_execute
        pg_client.get_payment = mock_get_payment

        payment_data = {
            "id": "pay-legacy",
            "user_id": "u-1",
            "amount": 1000.0,
            "currency": "ILS",
            "status": "pending",
            "created_at": "2026-03-13T10:00:00+00:00",
        }

        await pg_client.create_payment(payment_data)  # must not raise

        provider_data_json = captured_args[9]
        provider_data = json.loads(provider_data_json)
        # No VAT keys (none were supplied)
        assert "subtotal" not in provider_data
        assert "tax_amount" not in provider_data


# ---------------------------------------------------------------------------
# 4. postgres.create_invoice — default tax_rate fixed from 0.17 → 0.18
# ---------------------------------------------------------------------------


class TestPostgresCreateInvoiceVATDefault:
    """create_invoice in postgres layer defaults tax_rate to 0.18."""

    @pytest.fixture
    def pg_client(self):
        from src.databases.postgres import PostgresClient

        client = PostgresClient.__new__(PostgresClient)
        client._use_supabase_client = MagicMock(return_value=False)
        return client

    @pytest.mark.asyncio
    async def test_default_tax_rate_used_in_sql(self, pg_client):
        """When invoice data lacks 'tax_rate', the SQL arg defaults to 0.18."""
        captured_args: list = []

        async def mock_pg_execute(sql, *args):
            captured_args.extend(args)

        async def mock_get_invoice(inv_id):
            return {"id": inv_id}

        pg_client._pg_execute = mock_pg_execute
        pg_client.get_invoice = mock_get_invoice

        invoice_data = {
            "id": "inv-test",
            "offer_id": "off-1",
            # Deliberately no 'tax_rate' → should default to 0.18
        }

        await pg_client.create_invoice(invoice_data)

        # tax_rate is the 6th positional arg ($6) in the INSERT
        assert len(captured_args) >= 6
        tax_rate_arg = captured_args[5]
        assert tax_rate_arg == pytest.approx(0.18)

    @pytest.mark.asyncio
    async def test_tax_amount_key_fallback(self, pg_client):
        """Accepts 'tax_amount' key as alias for the 'tax' DB column."""
        captured_args: list = []

        async def mock_pg_execute(sql, *args):
            captured_args.extend(args)

        async def mock_get_invoice(inv_id):
            return {"id": inv_id}

        pg_client._pg_execute = mock_pg_execute
        pg_client.get_invoice = mock_get_invoice

        invoice_data = {
            "id": "inv-test2",
            "offer_id": "off-2",
            "subtotal": 500.0,
            "tax_amount": 90.0,   # Using the API response key, not the DB column key
        }

        await pg_client.create_invoice(invoice_data)

        # tax value is the 7th positional arg ($7)
        tax_arg = captured_args[6]
        assert tax_arg == pytest.approx(90.0)
