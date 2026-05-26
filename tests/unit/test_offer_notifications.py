"""Unit tests verifying that offer lifecycle routes fire email notifications.

Each test mocks the DB, the email service, and the WhatsApp bot; asserts that
the appropriate email method is scheduled via BackgroundTasks; and confirms the
HTTP response is correct regardless of notification outcome.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC)


def _make_user(
    role: UserRole = UserRole.RESIDENT,
    user_id: str = "u1",
    email: str | None = "resident@example.com",
    phone: str = "0501234567",
) -> UserInDB:
    # Use model_construct to bypass EmailStr validation so tests can pass email=None
    # to exercise the `if current_user.email:` branch in routes.
    return UserInDB.model_construct(
        id=user_id,
        email=email,
        full_name="Test User",
        phone=phone,
        role=role,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=_now(),
        updated_at=_now(),
    )


def _make_offer(**kwargs) -> dict:
    base = {
        "id": "offer-1",
        "title": "Group AC Installation",
        "description": "AC for the whole building.",
        "category": "ac_installation",
        "base_price": 5000.0,
        "min_participants": 3,
        "max_participants": 20,
        "current_participants": 1,
        "building_id": "bld-1",
        "created_by": "u1",
        "status": "pending",
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
        "pricing_tiers": [
            {"min_participants": 3, "max_participants": 20, "discount_percent": 10, "price_per_unit": 4500.0}
        ],
    }
    base.update(kwargs)
    return base


def _make_participant(user_id: str = "u1", email: str = "resident@example.com") -> dict:
    return {
        "id": "part-1",
        "user_id": user_id,
        "offer_id": "offer-1",
        "email": email,
        "full_name": "Test User",
        "unit_count": 1,
        "joined_at": _now().isoformat(),
    }


def _patched_client(user: UserInDB) -> TestClient:
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# join_offer → send_offer_joined
# ---------------------------------------------------------------------------


class TestJoinNotification:
    def test_join_sends_offer_joined_email(self):
        """Joining a non-threshold offer queues send_offer_joined (direct email path)."""
        user = _make_user()
        offer = _make_offer(current_participants=1, min_participants=5)

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)
        db.join_offer = AsyncMock()

        email_svc = MagicMock()
        email_svc.send_offer_joined = AsyncMock(return_value=True)
        email_svc.send_offer_threshold_reached = AsyncMock(return_value=True)

        fake_settings = MagicMock()
        fake_settings.ENABLE_NOTIFICATION_QUEUE = False
        fake_settings.ENABLE_OUTBOX = False

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=MagicMock()),
            patch("src.api.routes.offers.get_settings", return_value=fake_settings),
        ):
            client = _patched_client(user)
            resp = client.post("/api/v1/offers/offer-1/join", json={"unit_count": 1})

        assert resp.status_code == 200
        assert resp.json()["status"] == "joined"
        email_svc.send_offer_joined.assert_called_once_with(
            to_email=user.email,
            user_name=user.full_name,
            offer_title=offer["title"],
            current_participants=2,
            min_participants=offer["min_participants"],
            offer_id="offer-1",
        )

    def test_join_at_threshold_broadcasts_to_all_participants(self):
        """When join pushes count to min_participants, all participants are notified."""
        user = _make_user()
        # current_participants=2, min_participants=3 → joining pushes it to 3
        offer = _make_offer(current_participants=2, min_participants=3)

        participant_a = _make_participant(user_id="u1", email="a@example.com")
        participant_b = _make_participant(user_id="u2", email="b@example.com")
        participant_c = _make_participant(user_id="u3", email="c@example.com")
        all_participants = [participant_a, participant_b, participant_c]

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)
        db.join_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=all_participants)

        email_svc = MagicMock()
        email_svc.send_offer_joined = AsyncMock(return_value=True)
        email_svc.send_offer_threshold_reached = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=MagicMock()),
        ):
            client = _patched_client(user)
            resp = client.post("/api/v1/offers/offer-1/join", json={"unit_count": 1})

        assert resp.status_code == 200
        # Threshold broadcast fired for each participant
        assert email_svc.send_offer_threshold_reached.call_count == 3
        called_emails = {call.kwargs["to_email"] for call in email_svc.send_offer_threshold_reached.call_args_list}
        assert called_emails == {"a@example.com", "b@example.com", "c@example.com"}

    def test_join_notification_failure_doesnt_block_join(self):
        """Even if email service raises, the join endpoint returns 200."""
        user = _make_user()
        offer = _make_offer(current_participants=0, min_participants=5)

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)
        db.join_offer = AsyncMock()

        broken_email_svc = MagicMock()
        broken_email_svc.send_offer_joined = AsyncMock(side_effect=RuntimeError("SMTP down"))
        broken_email_svc.send_offer_threshold_reached = AsyncMock()

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=broken_email_svc),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=MagicMock()),
        ):
            client = _patched_client(user)
            resp = client.post("/api/v1/offers/offer-1/join", json={"unit_count": 1})

        # Join DB write succeeded; email failure is fire-and-forget
        assert resp.status_code == 200
        assert resp.json()["status"] == "joined"

    def test_join_no_email_skips_notification(self):
        """When the user has no email, send_offer_joined is never called."""
        user = _make_user(email=None)
        offer = _make_offer(current_participants=0, min_participants=5)

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)
        db.join_offer = AsyncMock()

        email_svc = MagicMock()
        email_svc.send_offer_joined = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=MagicMock()),
        ):
            client = _patched_client(user)
            resp = client.post("/api/v1/offers/offer-1/join", json={"unit_count": 1})

        assert resp.status_code == 200
        email_svc.send_offer_joined.assert_not_called()


# ---------------------------------------------------------------------------
# leave_offer → send_offer_left
# ---------------------------------------------------------------------------


class TestLeaveNotification:
    def test_leave_sends_offer_left_email(self):
        """Leaving an offer queues send_offer_left."""
        user = _make_user()
        offer = _make_offer(status="pending", current_participants=5)

        updated_offer = _make_offer(status="pending", current_participants=4)

        db = MagicMock()
        db.get_offer = AsyncMock(side_effect=[offer, updated_offer])
        db.has_user_joined_offer = AsyncMock(return_value=True)
        db.leave_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=[])

        email_svc = MagicMock()
        email_svc.send_offer_left = AsyncMock(return_value=True)
        email_svc.send_offer_at_risk = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=MagicMock()),
        ):
            client = _patched_client(user)
            resp = client.post("/api/v1/offers/offer-1/leave")

        assert resp.status_code == 200
        email_svc.send_offer_left.assert_called_once_with(
            to_email=user.email,
            user_name=user.full_name,
            offer_title=offer["title"],
            offer_id="offer-1",
        )

    def test_leave_no_email_skips_notification(self):
        """User with no email doesn't queue send_offer_left."""
        user = _make_user(email=None)
        offer = _make_offer(status="pending", current_participants=5)
        updated_offer = _make_offer(status="pending", current_participants=4)

        db = MagicMock()
        db.get_offer = AsyncMock(side_effect=[offer, updated_offer])
        db.has_user_joined_offer = AsyncMock(return_value=True)
        db.leave_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=[])

        email_svc = MagicMock()
        email_svc.send_offer_left = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
            patch("src.api.routes.offers.get_whatsapp_bot", return_value=MagicMock()),
        ):
            client = _patched_client(user)
            resp = client.post("/api/v1/offers/offer-1/leave")

        assert resp.status_code == 200
        email_svc.send_offer_left.assert_not_called()


# ---------------------------------------------------------------------------
# delete_offer → send_offer_cancelled (per participant)
# ---------------------------------------------------------------------------


class TestCancelNotification:
    def test_cancel_notifies_all_participants(self):
        """Cancelling a draft offer queues send_offer_cancelled for each participant."""
        user = _make_user()
        offer = _make_offer(status="pending", created_by=user.id)

        participants = [
            _make_participant(user_id="u2", email="p1@example.com"),
            _make_participant(user_id="u3", email="p2@example.com"),
        ]

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.get_offer_participants = AsyncMock(return_value=participants)
        db.update_offer = AsyncMock(return_value={**offer, "status": "cancelled"})

        email_svc = MagicMock()
        email_svc.send_offer_cancelled = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
        ):
            client = _patched_client(user)
            resp = client.delete("/api/v1/offers/offer-1")

        assert resp.status_code == 200
        assert email_svc.send_offer_cancelled.call_count == 2
        notified = {call.kwargs["to_email"] for call in email_svc.send_offer_cancelled.call_args_list}
        assert notified == {"p1@example.com", "p2@example.com"}

    def test_cancel_skips_participants_without_email(self):
        """Participants with no email are silently skipped."""
        user = _make_user()
        offer = _make_offer(status="pending", created_by=user.id)

        participants = [
            _make_participant(user_id="u2", email="good@example.com"),
            {**_make_participant(user_id="u3"), "email": ""},  # no email
        ]

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.get_offer_participants = AsyncMock(return_value=participants)
        db.update_offer = AsyncMock(return_value={**offer, "status": "cancelled"})

        email_svc = MagicMock()
        email_svc.send_offer_cancelled = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
        ):
            client = _patched_client(user)
            resp = client.delete("/api/v1/offers/offer-1")

        assert resp.status_code == 200
        assert email_svc.send_offer_cancelled.call_count == 1
        email_svc.send_offer_cancelled.assert_called_once_with(
            to_email="good@example.com",
            user_name="Test User",
            offer_title=offer["title"],
        )


# ---------------------------------------------------------------------------
# match_contractor → send_offer_matched (per participant)
# ---------------------------------------------------------------------------


class TestMatchNotification:
    def test_match_notifies_all_participants(self):
        """Matching a contractor queues send_offer_matched for each participant."""
        admin = _make_user(role=UserRole.ADMIN, user_id="admin-1", email="admin@example.com")
        offer = _make_offer(status="pending")
        contractor = {
            "id": "c1",
            "business_name": "AC Masters",
        }
        updated_offer = {**offer, "status": "matched", "matched_contractor_id": "c1"}

        participants = [
            _make_participant(user_id="u2", email="p1@example.com"),
            _make_participant(user_id="u3", email="p2@example.com"),
        ]

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.get_contractor = AsyncMock(return_value=contractor)
        db.update_offer = AsyncMock(return_value=updated_offer)
        db.get_offer_participants = AsyncMock(return_value=participants)

        email_svc = MagicMock()
        email_svc.send_offer_matched = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
        ):
            client = _patched_client(admin)
            resp = client.post(
                "/api/v1/offers/offer-1/match",
                json={"contractor_id": "c1", "final_price": 4500.0},
            )

        assert resp.status_code == 200
        assert email_svc.send_offer_matched.call_count == 2

        # Verify contractor name is passed correctly
        for call in email_svc.send_offer_matched.call_args_list:
            assert call.kwargs["contractor_name"] == "AC Masters"
            assert call.kwargs["offer_id"] == "offer-1"

    def test_match_notification_failure_doesnt_block_match(self):
        """If participant fetch raises, the match still succeeds."""
        admin = _make_user(role=UserRole.ADMIN, user_id="admin-1", email="admin@example.com")
        offer = _make_offer(status="pending")
        contractor = {"id": "c1", "business_name": "AC Masters"}
        updated_offer = {**offer, "status": "matched", "matched_contractor_id": "c1"}

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.get_contractor = AsyncMock(return_value=contractor)
        db.update_offer = AsyncMock(return_value=updated_offer)
        db.get_offer_participants = AsyncMock(side_effect=RuntimeError("DB unavailable"))

        email_svc = MagicMock()
        email_svc.send_offer_matched = AsyncMock(return_value=True)

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
        ):
            client = _patched_client(admin)
            resp = client.post(
                "/api/v1/offers/offer-1/match",
                json={"contractor_id": "c1", "final_price": 4500.0},
            )

        # DB write succeeded; notification fetch error is swallowed
        assert resp.status_code == 200
        email_svc.send_offer_matched.assert_not_called()

    def test_match_non_admin_forbidden(self):
        """A plain resident cannot match a contractor."""
        user = _make_user(role=UserRole.RESIDENT)
        offer = _make_offer(status="pending")

        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.get_contractor = AsyncMock(return_value={"id": "c1", "business_name": "AC"})

        email_svc = MagicMock()
        email_svc.send_offer_matched = AsyncMock()

        with (
            patch("src.api.routes.offers.get_postgres_client", return_value=db),
            patch("src.api.routes.offers.get_email_service", return_value=email_svc),
        ):
            client = _patched_client(user)
            resp = client.post(
                "/api/v1/offers/offer-1/match",
                json={"contractor_id": "c1", "final_price": 4500.0},
            )

        assert resp.status_code == 403
        email_svc.send_offer_matched.assert_not_called()
