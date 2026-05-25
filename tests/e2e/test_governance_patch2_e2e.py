"""End-to-end API-level tests for AI governance Patch 2.

These tests simulate full user journeys through the system, exercising
multiple layers (auth middleware → route → DB → payment provider).

Coverage:
  1. Full refund governance flow:
       resident triggers refund → pending decision created (no money moved)
       → admin approves → provider.refund() called → payment updated
  2. Reject flow: admin rejects → no execution, subsequent approve blocked
  3. Agent mode change via admin API → next refund request uses new mode
  4. WhatsApp unverified user → degrade-safe response, no orchestration
  5. WhatsApp verified user → orchestration invoked
  6. WhatsApp unknown phone → orchestration invoked (no user found = allowed)
"""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_admin_user, get_current_user
from src.models.user import UserInDB, UserRole


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _make_user(
    role: UserRole = UserRole.RESIDENT,
    is_active: bool = True,
    is_verified: bool = True,
    uid: str = "user-1",
    phone: str = "0501234567",  # Israeli mobile format required by UserInDB validator
) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id=uid,
        email="user@example.com",
        full_name="Test User",
        phone=phone,
        role=role,
        hashed_password="hashed",
        is_active=is_active,
        is_verified=is_verified,
        preferred_language="he",
        building_id="b1",
        created_at=now,
        updated_at=now,
    )


def _make_admin(uid: str = "admin-1") -> UserInDB:
    return _make_user(role=UserRole.ADMIN, is_verified=True, uid=uid)


def _whatsapp_payload(phone: str = "972501234567", text: str = "שלום") -> bytes:
    """Build a minimal WhatsApp webhook payload matching Meta's format."""
    body = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [{"from": phone, "text": {"body": text}}]
                        }
                    }
                ]
            }
        ]
    }
    return json.dumps(body).encode()


def _whatsapp_sig(secret: str, payload_bytes: bytes) -> str:
    """Compute WhatsApp HMAC-SHA256 signature."""
    return "sha256=" + hmac_mod.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


# ===========================================================================
# 1. Full refund governance flow (gated → approve → executed)
# ===========================================================================


class TestFullRefundGovernanceFlow:
    """End-to-end: refund request → pending decision → admin approve → executed.

    Demonstrates the full safety boundary:
    1. Resident requests refund in gated mode → no money moves, decision queued
    2. Admin approves the decision → provider.refund() is called exactly once
    3. Payment and invoice records updated in DB
    4. Audit trail written for both queuing and approval
    """

    async def test_gated_refund_creates_pending_decision_and_no_refund(self):
        """Step 1: Agent queues decision; provider is not touched."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "gated"

        db_rows = [{"key": "PAYMENT_AGENT_MODE", "value": "gated"}]
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)
        mock_db.list_payments_for_user = AsyncMock(
            return_value=[{"id": "pay-1", "status": "succeeded", "amount": 500.0}]
        )
        mock_db.create_pending_decision = AsyncMock(return_value={"id": "decision-1"})

        provider = AsyncMock()
        provider.refund = AsyncMock()

        agent = PaymentAgent()
        state = {
            "user_id": "user-1",
            "conversation_id": "conv-1",
            "messages": [{"role": "user", "content": "החזר כסף"}],
            "actions_taken": [],
        }
        llm_result = {"content": [{"type": "text", "text": "הבקשה קיבלנו ומעובדת"}]}

        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            # payment.py top-level import:
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            # base.py._enqueue_pending_decision uses a function-local import:
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
            patch.object(agent, "_call_llm", new_callable=AsyncMock, return_value=llm_result),
        ):
            result_state = await agent._handle_refund_request(state, "user-1", "החזר כסף")

        # Money has NOT moved
        provider.refund.assert_not_awaited()
        # Pending decision was created
        mock_db.create_pending_decision.assert_awaited_once()
        created_record = mock_db.create_pending_decision.await_args.args[0]
        assert created_record["action_type"] == "refund_request"
        assert created_record["status"] == "pending"
        assert result_state["needs_human"] is True

    def test_admin_approve_executes_refund_and_updates_records(self):
        """Step 2: Admin approves the queued decision → refund executed."""
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

        try:
            pending_decision = {
                "id": "decision-1",
                "agent_name": "payment",
                "action_type": "refund_request",
                "status": "pending",
                "payload": {
                    "payment_id": "pay-1",
                    "transaction_id": "txn-abc",
                    "amount": 500.0,
                },
            }
            payment_record = {"id": "pay-1", "status": "succeeded", "invoice_id": "inv-1", "amount": 500.0}

            db = AsyncMock()
            db.get_pending_decision = AsyncMock(return_value=pending_decision)
            db.update_pending_decision = AsyncMock(return_value={**pending_decision, "status": "approved"})
            db.get_payment = AsyncMock(return_value=payment_record)
            db.update_payment = AsyncMock(return_value={**payment_record, "status": "refunded"})
            db.update_invoice = AsyncMock(return_value={})
            db.create_audit_log = AsyncMock(return_value={})

            provider = AsyncMock()
            provider.refund = AsyncMock(return_value={"refund_id": "ref-xyz", "status": "refunded"})

            with (
                patch("src.api.routes.admin.get_postgres_client", return_value=db),
                patch("src.services.payment.get_payment_provider", return_value=provider),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/api/v1/admin/agents/pending-decisions/decision-1/approve",
                    params={"note": "approved after review"},
                )

            assert resp.status_code == 200
            # Refund executed exactly once
            provider.refund.assert_awaited_once_with(transaction_id="txn-abc", amount=500.0)
            # Payment and invoice updated
            db.update_payment.assert_awaited_once()
            db.update_invoice.assert_awaited_once_with("inv-1", {"status": "refunded"})
            # Audit logs written (approval decision + refund execution)
            assert db.create_audit_log.await_count >= 2
        finally:
            app.dependency_overrides.clear()


# ===========================================================================
# 2. Reject flow: no execution, subsequent approve blocked
# ===========================================================================


class TestRefundRejectFlow:
    """End-to-end: admin rejects refund decision → no execution → approve blocked.

    Reject is a terminal state. The approve route must return 409 afterward,
    and provider.refund() must never be called.
    """

    def test_reject_then_approve_returns_409_no_refund(self):
        """Approve after reject is permanently blocked with HTTP 409."""
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

        try:
            # Decision is in 'rejected' state (simulates state after a reject call)
            rejected_decision = {
                "id": "decision-1",
                "agent_name": "payment",
                "action_type": "refund_request",
                "status": "rejected",
                "payload": {"payment_id": "pay-1", "transaction_id": "txn-abc", "amount": 500.0},
            }

            db = AsyncMock()
            db.get_pending_decision = AsyncMock(return_value=rejected_decision)
            db.create_audit_log = AsyncMock(return_value={})

            provider = AsyncMock()
            provider.refund = AsyncMock()

            with (
                patch("src.api.routes.admin.get_postgres_client", return_value=db),
                patch("src.services.payment.get_payment_provider", return_value=provider),
            ):
                client = TestClient(app)
                approve_resp = client.post(
                    "/api/v1/admin/agents/pending-decisions/decision-1/approve"
                )

            assert approve_resp.status_code == 409
            provider.refund.assert_not_awaited()
        finally:
            app.dependency_overrides.clear()

    def test_reject_writes_audit_log_with_correct_action(self):
        """Reject call creates audit_log entry with action='reject_pending_decision'."""
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

        try:
            pending_decision = {
                "id": "decision-1",
                "agent_name": "payment",
                "action_type": "refund_request",
                "status": "pending",
                "payload": {"payment_id": "pay-1"},
            }

            db = AsyncMock()
            db.get_pending_decision = AsyncMock(return_value=pending_decision)
            db.update_pending_decision = AsyncMock(return_value={**pending_decision, "status": "rejected"})
            db.create_audit_log = AsyncMock(return_value={})

            with patch("src.api.routes.admin.get_postgres_client", return_value=db):
                client = TestClient(app)
                resp = client.post(
                    "/api/v1/admin/agents/pending-decisions/decision-1/reject",
                    params={"note": "user not eligible"},
                )

            assert resp.status_code == 200
            db.create_audit_log.assert_awaited_once()
            audit_entry = db.create_audit_log.await_args.args[0]
            assert audit_entry["action"] == "reject_pending_decision"
            assert "user not eligible" in audit_entry["details"].get("decision_note", "")
        finally:
            app.dependency_overrides.clear()


# ===========================================================================
# 3. Agent mode change via admin settings → next invocation uses new mode
# ===========================================================================


class TestAgentModeChangePersistence:
    """Changing PAYMENT_AGENT_MODE via PUT /admin/settings takes effect immediately.

    Pre-Patch-2: GET /admin/agents/autonomy read from env @lru_cache (stale).
    Pre-Patch-2: Payment agent read from env @lru_cache (stale).
    Post-Patch-2: Both read from system_settings DB, reflecting live changes.
    """

    def test_put_settings_then_get_autonomy_shows_new_value(self):
        """After PUT /admin/settings, GET /admin/agents/autonomy returns the new mode."""
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

        try:
            # Simulate: after PUT, DB contains the new mode
            db_rows_after_put = [{"key": "PAYMENT_AGENT_MODE", "value": "auto"}]
            db = AsyncMock()
            db.get_system_settings = AsyncMock(return_value=db_rows_after_put)
            db.upsert_system_setting = AsyncMock(return_value={})
            db.create_audit_log = AsyncMock(return_value={})

            # Env still says gated (cached, not restarted)
            env_settings = MagicMock()
            env_settings.MATCHING_AGENT_MODE = "gated"
            env_settings.PRICING_AGENT_MODE = "gated"
            env_settings.VETTING_AGENT_MODE = "gated"
            env_settings.OUTREACH_AGENT_MODE = "gated"
            env_settings.PAYMENT_AGENT_MODE = "gated"

            with (
                patch("src.api.routes.admin.get_postgres_client", return_value=db),
                patch("src.config.settings.get_settings", return_value=env_settings),
            ):
                client = TestClient(app)
                get_resp = client.get("/api/v1/admin/agents/autonomy")

            assert get_resp.status_code == 200
            data = get_resp.json()
            # Must show DB value ("auto"), not env value ("gated")
            assert data["payment"] == "auto", (
                f"Expected 'auto' from DB but got {data['payment']!r}. "
                "This indicates GET /admin/agents/autonomy still reads from env cache."
            )
        finally:
            app.dependency_overrides.clear()

    async def test_next_refund_invocation_uses_db_mode_not_env(self):
        """After mode change to 'auto' in DB, the next refund uses auto (no gated queue)."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "gated"  # env is stale

        db_rows = [{"key": "PAYMENT_AGENT_MODE", "value": "auto"}]  # DB has new mode
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)

        agent = PaymentAgent()
        state = {
            "user_id": "user-1",
            "messages": [{"role": "user", "content": "refund"}],
            "actions_taken": [],
        }

        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            patch.object(agent, "_handle_refund_auto", new_callable=AsyncMock, return_value=state) as mock_auto,
            patch.object(agent, "_handle_refund_gated", new_callable=AsyncMock, return_value=state) as mock_gated,
        ):
            await agent._handle_refund_request(state, "user-1", "refund")

        mock_auto.assert_awaited_once()
        mock_gated.assert_not_awaited()


# ===========================================================================
# 4. WhatsApp verification gate
# ===========================================================================


class TestWhatsAppVerificationGate:
    """WhatsApp webhook must check is_verified before invoking the orchestrator.

    Pre-Patch-2: every WhatsApp message — even from unverified users — was
    forwarded to the orchestrator with no verification check.
    Post-Patch-2: unverified registered users receive a Hebrew degrade message
    and orchestration is skipped entirely.
    """

    WHATSAPP_SECRET = "test-webhook-secret"

    def _post_whatsapp(self, client: TestClient, phone: str, text: str) -> object:
        payload_bytes = _whatsapp_payload(phone=phone, text=text)
        sig = _whatsapp_sig(self.WHATSAPP_SECRET, payload_bytes)
        return client.post(
            "/api/v1/webhooks/whatsapp",
            content=payload_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": sig,
            },
        )

    def test_unverified_user_receives_degrade_safe_response(self):
        """Unverified registered user: no orchestration, degrade message scheduled."""
        # UserInDB phone must be Israeli format; WhatsApp uses international format.
        unverified_user = _make_user(is_verified=False, phone="0501234567")

        mock_db = AsyncMock()
        mock_db.get_building_by_phone = AsyncMock(return_value="b1")
        mock_db.get_user_by_phone = AsyncMock(return_value=unverified_user)

        mock_settings = MagicMock()
        mock_settings.WHATSAPP_WEBHOOK_SECRET = self.WHATSAPP_SECRET
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        mock_orchestrator = MagicMock()
        mock_orchestrator.run = AsyncMock()

        with (
            patch("src.api.routes.webhooks.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.webhooks.get_settings", return_value=mock_settings),
            patch("src.api.routes.webhooks.get_orchestrator", return_value=mock_orchestrator),
            patch("src.api.routes.webhooks._send_whatsapp_reply", new_callable=AsyncMock),
        ):
            client = TestClient(app)
            resp = self._post_whatsapp(client, "972501234567", "החזר כסף")

        assert resp.status_code == 200
        assert resp.json()["status"] == "unverified"
        mock_orchestrator.run.assert_not_awaited()

    def test_verified_user_triggers_orchestration(self):
        """Verified registered user: orchestration is invoked normally."""
        verified_user = _make_user(is_verified=True, phone="0509876543")

        mock_db = AsyncMock()
        mock_db.get_building_by_phone = AsyncMock(return_value="b1")
        mock_db.get_user_by_phone = AsyncMock(return_value=verified_user)

        mock_settings = MagicMock()
        mock_settings.WHATSAPP_WEBHOOK_SECRET = self.WHATSAPP_SECRET
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        mock_orchestrator = MagicMock()
        mock_orchestrator.run = AsyncMock(
            return_value={"response": {"message": "שלום, איך אפשר לעזור?"}}
        )

        with (
            patch("src.api.routes.webhooks.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.webhooks.get_settings", return_value=mock_settings),
            patch("src.api.routes.webhooks.get_orchestrator", return_value=mock_orchestrator),
            patch("src.api.routes.webhooks._send_whatsapp_reply", new_callable=AsyncMock),
        ):
            client = TestClient(app)
            resp = self._post_whatsapp(client, "972509876543", "שלום")

        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"
        mock_orchestrator.run.assert_awaited_once()

    def test_unknown_phone_triggers_orchestration(self):
        """Phone not linked to any user: orchestration proceeds (no account = no block)."""
        mock_db = AsyncMock()
        mock_db.get_building_by_phone = AsyncMock(return_value=None)
        mock_db.get_user_by_phone = AsyncMock(return_value=None)  # no user

        mock_settings = MagicMock()
        mock_settings.WHATSAPP_WEBHOOK_SECRET = self.WHATSAPP_SECRET
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        mock_orchestrator = MagicMock()
        mock_orchestrator.run = AsyncMock(
            return_value={"response": {"message": "ברוכים הבאים"}}
        )

        with (
            patch("src.api.routes.webhooks.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.webhooks.get_settings", return_value=mock_settings),
            patch("src.api.routes.webhooks.get_orchestrator", return_value=mock_orchestrator),
            patch("src.api.routes.webhooks._send_whatsapp_reply", new_callable=AsyncMock),
        ):
            client = TestClient(app)
            resp = self._post_whatsapp(client, "972509999999", "שלום")

        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"
        mock_orchestrator.run.assert_awaited_once()

    def test_invalid_whatsapp_signature_rejected(self):
        """Tampered or missing signature returns HTTP 403 before any processing."""
        mock_db = AsyncMock()
        mock_db.get_building_by_phone = AsyncMock(return_value=None)
        mock_db.get_user_by_phone = AsyncMock(return_value=None)

        mock_settings = MagicMock()
        mock_settings.WHATSAPP_WEBHOOK_SECRET = self.WHATSAPP_SECRET
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        mock_orchestrator = MagicMock()
        mock_orchestrator.run = AsyncMock()

        with (
            patch("src.api.routes.webhooks.get_postgres_client", return_value=mock_db),
            patch("src.api.routes.webhooks.get_settings", return_value=mock_settings),
            patch("src.api.routes.webhooks.get_orchestrator", return_value=mock_orchestrator),
        ):
            payload_bytes = _whatsapp_payload("972501234567", "test")
            client = TestClient(app)
            resp = client.post(
                "/api/v1/webhooks/whatsapp",
                content=payload_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-Hub-Signature-256": "sha256=invalidsignature",
                },
            )

        assert resp.status_code == 403
        mock_orchestrator.run.assert_not_awaited()
