"""Integration tests for AI governance Patch 2 — HTTP-level route coverage.

Tests exercise the full FastAPI request/response cycle via TestClient.
Each test is designed to FAIL on pre-Patch-2 code and PASS after the patch.

Coverage:
  A. Unverified user is blocked at the auth middleware level (not just login)
  B. Approve pending decision: executes provider.refund() exactly once
  C. Approve pending decision: idempotency guard — no double execution
  D. Reject + subsequent approve: HTTP 409, no execution
  E. Double approve: HTTP 409 on second attempt
  F. Approve/reject both write audit_log entries
  G. Refund gated mode: pending decision created, refund NOT called
"""

from __future__ import annotations

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
) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id=uid,
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
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


def _pending_entry(
    decision_id: str = "decision-1",
    action_type: str = "refund_request",
    status: str = "pending",
    payment_id: str = "pay-1",
    transaction_id: str = "txn-abc",
    amount: float = 500.0,
) -> dict:
    return {
        "id": decision_id,
        "agent_name": "payment",
        "action_type": action_type,
        "status": status,
        "payload": {
            "payment_id": payment_id,
            "transaction_id": transaction_id,
            "amount": amount,
        },
    }


def _payment_record(payment_id: str = "pay-1", status: str = "succeeded") -> dict:
    return {
        "id": payment_id,
        "status": status,
        "invoice_id": "inv-1",
        "amount": 500.0,
    }


def _build_admin_db(
    entry: dict,
    payment: dict | None = None,
    *,
    update_decision_result: dict | None = None,
) -> AsyncMock:
    """Return a fully-configured mock DB for admin route tests."""
    db = AsyncMock()
    db.get_pending_decision = AsyncMock(return_value=entry)
    db.update_pending_decision = AsyncMock(
        return_value=update_decision_result or {**entry, "status": entry["status"]}
    )
    db.get_payment = AsyncMock(return_value=payment or _payment_record())
    db.update_payment = AsyncMock(return_value={**(payment or _payment_record()), "status": "refunded"})
    db.update_invoice = AsyncMock(return_value={})
    db.create_audit_log = AsyncMock(return_value={})
    db.get_system_settings = AsyncMock(return_value=[])
    return db


def _build_provider(refund_id: str = "ref-1") -> AsyncMock:
    provider = AsyncMock()
    provider.refund = AsyncMock(return_value={"refund_id": refund_id, "status": "refunded"})
    return provider


# ===========================================================================
# A. Email verification enforcement — middleware-level test
# ===========================================================================


class TestEmailVerificationEnforcedAtMiddleware:
    """Unverified users must be blocked BEFORE reaching any route handler.

    Pre-Patch-2: get_current_user had no is_verified check — unverified users
    with valid tokens could access any protected endpoint.
    Post-Patch-2: HTTP 403 is returned from the auth middleware.
    """

    def test_unverified_user_blocked_on_protected_payment_route(self):
        """Unverified user with a structurally valid token gets HTTP 403."""
        unverified = _make_user(is_verified=False)

        mock_payload = MagicMock()
        mock_payload.sub = "user-1"
        mock_payload.jti = "jti-abc"

        mock_redis = AsyncMock()
        mock_redis.is_token_denylisted = AsyncMock(return_value=False)

        mock_db_auth = AsyncMock()
        mock_db_auth.get_user = AsyncMock(return_value=unverified)

        mock_settings = MagicMock()
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        # Do NOT override get_current_user — let the real middleware run
        app.dependency_overrides.clear()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=mock_settings),
            patch("src.databases.redis_client.get_redis_client", return_value=mock_redis),
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db_auth),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(
                "/api/v1/payments/my",
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 403
        assert "verif" in resp.json()["detail"].lower()

    def test_verified_user_can_access_protected_route(self):
        """Verified user with a valid token is allowed through the middleware."""
        verified = _make_user(is_verified=True)

        mock_payload = MagicMock()
        mock_payload.sub = "user-1"
        mock_payload.jti = "jti-abc"

        mock_redis = AsyncMock()
        mock_redis.is_token_denylisted = AsyncMock(return_value=False)

        mock_db_auth = AsyncMock()
        mock_db_auth.get_user = AsyncMock(return_value=verified)
        mock_db_auth.list_payments_for_user = AsyncMock(return_value=[])

        mock_settings = MagicMock()
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        app.dependency_overrides.clear()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=mock_settings),
            patch("src.databases.redis_client.get_redis_client", return_value=mock_redis),
            # Auth path uses src.databases.postgres; payment route uses its own import
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db_auth),
            patch("src.api.routes.payments.get_postgres_client", return_value=mock_db_auth),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(
                "/api/v1/payments/my",
                headers={"Authorization": "Bearer fake-token"},
            )

        # 200 or a payment-level error (e.g. 404 if no data) — not 403
        assert resp.status_code != 403

    def test_unverified_admin_blocked_from_admin_routes(self):
        """Even an admin-role user is blocked if their email is not verified."""
        unverified_admin = _make_user(role=UserRole.ADMIN, is_verified=False)

        mock_payload = MagicMock()
        mock_payload.sub = unverified_admin.id
        mock_payload.jti = "jti-abc"

        mock_redis = AsyncMock()
        mock_redis.is_token_denylisted = AsyncMock(return_value=False)

        mock_db_auth = AsyncMock()
        mock_db_auth.get_user = AsyncMock(return_value=unverified_admin)

        mock_settings = MagicMock()
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True

        app.dependency_overrides.clear()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=mock_settings),
            patch("src.databases.redis_client.get_redis_client", return_value=mock_redis),
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db_auth),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(
                "/api/v1/admin/agents/autonomy",
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 403


# ===========================================================================
# B. Approve pending decision — refund execution
# ===========================================================================


class TestApproveRefundExecution:
    """Approving a refund_request pending decision must execute provider.refund().

    Pre-Patch-2: approve route only updated status in DB — no money moved.
    Post-Patch-2: provider.refund() is called, payment + invoice updated, audit logged.
    """

    def setup_method(self):
        """Override admin auth for every test in this class."""
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_approve_refund_calls_provider_refund_once(self):
        """provider.refund() called exactly once on approve."""
        entry = _pending_entry(status="pending")
        payment = _payment_record(status="succeeded")
        db = _build_admin_db(entry, payment, update_decision_result={**entry, "status": "approved"})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            resp = client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve?note=ok")

        assert resp.status_code == 200
        provider.refund.assert_awaited_once_with(transaction_id="txn-abc", amount=500.0)

    def test_approve_refund_updates_payment_status(self):
        """Payment record updated to 'refunded' after approval."""
        entry = _pending_entry(status="pending")
        payment = _payment_record(status="succeeded")
        db = _build_admin_db(entry, payment, update_decision_result={**entry, "status": "approved"})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        db.update_payment.assert_awaited_once()
        call_args = db.update_payment.await_args
        payment_id_arg = call_args.args[0]
        update_data = call_args.args[1]
        assert payment_id_arg == "pay-1"
        assert "refunded" in update_data.get("status", "")

    def test_approve_refund_updates_invoice_status(self):
        """Invoice record updated to 'refunded' after approval (when invoice_id present)."""
        entry = _pending_entry(status="pending")
        payment = _payment_record(status="succeeded")  # has invoice_id="inv-1"
        db = _build_admin_db(entry, payment, update_decision_result={**entry, "status": "approved"})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        db.update_invoice.assert_awaited_once_with("inv-1", {"status": "refunded"})

    def test_approve_writes_two_audit_log_entries(self):
        """Approve writes audit_log for the approval decision AND for the refund execution."""
        entry = _pending_entry(status="pending")
        payment = _payment_record(status="succeeded")
        db = _build_admin_db(entry, payment, update_decision_result={**entry, "status": "approved"})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        # Minimum 2 audit log calls: one for approval, one for refund execution
        assert db.create_audit_log.await_count >= 2
        actions_logged = [c.args[0]["action"] for c in db.create_audit_log.await_args_list]
        assert "approve_pending_decision" in actions_logged
        assert "refund_executed" in actions_logged

    def test_approve_non_refund_action_type_no_provider_call(self):
        """Non-refund action types do not trigger provider.refund()."""
        entry = _pending_entry(action_type="offer_match", status="pending")
        entry["payload"] = {}  # no payment_id
        db = _build_admin_db(entry, update_decision_result={**entry, "status": "approved"})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            resp = client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        assert resp.status_code == 200
        provider.refund.assert_not_awaited()


# ===========================================================================
# C. Idempotency guard — no double refund
# ===========================================================================


class TestApproveIdempotencyGuard:
    """Refund must not execute if the payment is already refunded.

    Pre-Patch-2: no idempotency guard existed.
    Post-Patch-2: payment.status == 'refunded' check prevents re-execution.
    """

    def setup_method(self):
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_already_refunded_payment_skips_provider_call(self):
        """provider.refund() is NOT called when payment.status == 'refunded'."""
        entry = _pending_entry(status="pending")
        already_refunded = _payment_record(status="refunded")  # already done
        db = _build_admin_db(entry, already_refunded, update_decision_result={**entry, "status": "approved"})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            resp = client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        assert resp.status_code == 200
        provider.refund.assert_not_awaited()

    def test_double_approve_rejected_http_409(self):
        """Second approve attempt returns HTTP 409 — decision already resolved."""
        already_approved = _pending_entry(status="approved")  # already resolved
        db = _build_admin_db(already_approved)
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            resp = client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        assert resp.status_code == 409
        provider.refund.assert_not_awaited()


# ===========================================================================
# D. Reject decision — audit log + permanent block
# ===========================================================================


class TestRejectDecision:
    """Rejecting a pending decision writes an audit log and permanently blocks it.

    Pre-Patch-2: reject route wrote no audit_log entry.
    Post-Patch-2: create_audit_log called with action='reject_pending_decision'.
    """

    def setup_method(self):
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_reject_writes_audit_log(self):
        """Rejecting calls create_audit_log with correct action."""
        entry = _pending_entry(status="pending")
        db = AsyncMock()
        db.get_pending_decision = AsyncMock(return_value=entry)
        db.update_pending_decision = AsyncMock(return_value={**entry, "status": "rejected"})
        db.create_audit_log = AsyncMock(return_value={})

        with patch("src.api.routes.admin.get_postgres_client", return_value=db):
            client = TestClient(app)
            resp = client.post(
                "/api/v1/admin/agents/pending-decisions/decision-1/reject?note=denied"
            )

        assert resp.status_code == 200
        db.create_audit_log.assert_awaited_once()
        log_data = db.create_audit_log.await_args.args[0]
        assert log_data["action"] == "reject_pending_decision"
        assert log_data["resource_id"] == "decision-1"
        assert log_data["details"]["decision_note"] == "denied"

    def test_approve_after_reject_is_409(self):
        """Approving a rejected decision raises HTTP 409."""
        already_rejected = _pending_entry(status="rejected")
        db = AsyncMock()
        db.get_pending_decision = AsyncMock(return_value=already_rejected)
        db.create_audit_log = AsyncMock(return_value={})
        provider = _build_provider()

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
        ):
            client = TestClient(app)
            resp = client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        assert resp.status_code == 409
        provider.refund.assert_not_awaited()

    def test_reject_unknown_decision_is_404(self):
        """Rejecting a non-existent decision returns HTTP 404."""
        db = AsyncMock()
        db.get_pending_decision = AsyncMock(return_value=None)
        db.create_audit_log = AsyncMock(return_value={})

        with patch("src.api.routes.admin.get_postgres_client", return_value=db):
            client = TestClient(app)
            resp = client.post("/api/v1/admin/agents/pending-decisions/nonexistent/reject")

        assert resp.status_code == 404


# ===========================================================================
# E. Provider failure is logged but does not crash the approve route
# ===========================================================================


class TestApproveProviderFailure:
    """When provider.refund() raises, the route must not return 500.

    The failure is logged in audit_log with action='refund_execution_failed'.
    The approve route still returns 200 (the decision status update succeeded).
    """

    def setup_method(self):
        admin = _make_admin()
        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_provider_failure_logged_not_crashed(self):
        """Route returns 200 and logs refund_execution_failed when provider raises."""
        entry = _pending_entry(status="pending")
        payment = _payment_record(status="succeeded")
        db = _build_admin_db(entry, payment, update_decision_result={**entry, "status": "approved"})

        failing_provider = AsyncMock()
        failing_provider.refund = AsyncMock(side_effect=RuntimeError("Stripe timeout"))

        with (
            patch("src.api.routes.admin.get_postgres_client", return_value=db),
            patch("src.services.payment.get_payment_provider", return_value=failing_provider),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/api/v1/admin/agents/pending-decisions/decision-1/approve")

        assert resp.status_code == 200  # route must not crash

        # audit log should contain both approval and failure entries
        actions_logged = [c.args[0]["action"] for c in db.create_audit_log.await_args_list]
        assert "approve_pending_decision" in actions_logged
        assert "refund_execution_failed" in actions_logged


# ===========================================================================
# F. Refund gated mode — agent queues decision, no money moved
# ===========================================================================


class TestRefundGatedMode:
    """In gated mode, the payment agent queues a pending decision and calls NO refund.

    This test verifies the agent side of the governance flow (not the approve route).
    """

    async def test_gated_mode_does_not_call_provider_refund(self):
        """In gated mode, provider.refund() is never called."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "gated"

        db_rows = [{"key": "PAYMENT_AGENT_MODE", "value": "gated"}]
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)
        mock_db.list_payments_for_user = AsyncMock(return_value=[{"id": "pay-1", "status": "succeeded", "amount": 500}])
        mock_db.create_pending_decision = AsyncMock(return_value={})

        provider = AsyncMock()
        provider.refund = AsyncMock()

        llm_result = {"content": [{"type": "text", "text": "your refund request is pending"}]}

        agent = PaymentAgent()
        state = {
            "user_id": "user-1",
            "conversation_id": "conv-1",
            "messages": [{"role": "user", "content": "אני רוצה החזר"}],
            "actions_taken": [],
        }

        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            # payment.py top-level import:
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            # base.py._enqueue_pending_decision uses a function-local import:
            patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
            patch("src.services.payment.get_payment_provider", return_value=provider),
            patch.object(agent, "_call_llm", new_callable=AsyncMock, return_value=llm_result),
        ):
            result_state = await agent._handle_refund_request(state, "user-1", "אני רוצה החזר")

        # Provider refund must NOT have been called
        provider.refund.assert_not_awaited()
        # Pending decision must have been enqueued
        mock_db.create_pending_decision.assert_awaited_once()
        # State must signal human review needed
        assert result_state.get("needs_human") is True
