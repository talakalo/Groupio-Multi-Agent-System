"""Unit tests for the offers API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
        created_at=now,
        updated_at=now,
    )


def _make_offer(**kwargs) -> dict:
    base = {
        "id": "offer-1",
        "title": "AC Install",
        "description": "Group AC installation for the building.",
        "category": "ac_installation",
        "base_price": 5000.0,
        "min_participants": 5,
        "max_participants": 20,
        "current_participants": 0,
        "building_id": "b1",
        "created_by": "user-1",
        "status": "draft",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    base.update(kwargs)
    return base


def _client(user: UserInDB, db: MagicMock):
    """Return a configured TestClient with auth + DB patched."""
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    client = TestClient(app, raise_server_exceptions=False)
    return client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestListOffers:
    def test_list_offers_returns_200(self):
        user = _make_user()
        db = MagicMock()
        db.get_building_ids_for_user = AsyncMock(return_value=["b1"])
        db.list_offers = AsyncMock(return_value=([_make_offer()], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 1
            assert len(data["items"]) == 1
        finally:
            app.dependency_overrides.clear()

    def test_list_offers_with_filters(self):
        user = _make_user()
        db = MagicMock()
        db.get_building_ids_for_user = AsyncMock(return_value=["b1"])
        db.list_offers = AsyncMock(return_value=([], 0))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/?status=draft&category=ac_installation")
            assert resp.status_code == 200
            assert resp.json()["total"] == 0
        finally:
            app.dependency_overrides.clear()


class TestGetOffer:
    def test_get_offer_found(self):
        user = _make_user()
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/offer-1")
            assert resp.status_code == 200
            assert resp.json()["id"] == "offer-1"
        finally:
            app.dependency_overrides.clear()

    def test_get_offer_not_found(self):
        user = _make_user()
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestUpdateOffer:
    def test_update_offer_by_creator(self):
        user = _make_user()
        offer = _make_offer(created_by="user-1", status="draft")
        updated = _make_offer(created_by="user-1", status="draft", title="New Title")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.update_offer = AsyncMock(return_value=updated)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/offer-1", json={"title": "New Title"})
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_offer_not_authorized(self):
        user = _make_user()
        offer = _make_offer(created_by="other-user", status="draft")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/offer-1", json={"title": "New"})
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_update_completed_offer_blocked(self):
        user = _make_user()
        offer = _make_offer(created_by="user-1", status="completed")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/offer-1", json={"title": "New"})
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_update_offer_not_found(self):
        user = _make_user()
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/missing", json={"title": "New"})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestDeleteOffer:
    def test_cancel_draft_offer(self):
        user = _make_user()
        offer = _make_offer(created_by="user-1", status="draft")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.update_offer = AsyncMock(return_value=offer)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/offers/offer-1")
            assert resp.status_code == 200
            assert resp.json()["status"] == "cancelled"
        finally:
            app.dependency_overrides.clear()

    def test_cancel_active_offer_blocked(self):
        user = _make_user()
        offer = _make_offer(created_by="user-1", status="matching")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/offers/offer-1")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestJoinOffer:
    def test_join_offer_success(self):
        user = _make_user()
        offer = _make_offer(status="pending", current_participants=3, max_participants=20)
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)
        db.join_offer = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with (
                patch("src.api.routes.offers.get_postgres_client", return_value=db),
                patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()),
                patch("src.api.routes.offers.get_whatsapp_bot", return_value=AsyncMock()),
            ):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/offer-1/join",
                    json={"user_id": "user-1", "unit_count": 1},
                )
            assert resp.status_code == 200
            assert resp.json()["status"] == "joined"
        finally:
            app.dependency_overrides.clear()

    def test_join_offer_already_joined(self):
        user = _make_user()
        offer = _make_offer(status="pending")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=True)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/offer-1/join",
                    json={"user_id": "user-1", "unit_count": 1},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_join_offer_at_capacity(self):
        user = _make_user()
        offer = _make_offer(status="pending", current_participants=20, max_participants=20)
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=True)
        db.has_user_joined_offer = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/offer-1/join",
                    json={"user_id": "user-1", "unit_count": 1},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_join_offer_not_resident(self):
        user = _make_user()
        offer = _make_offer(status="pending")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.is_user_in_building = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/offer-1/join",
                    json={"user_id": "user-1", "unit_count": 1},
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestLeaveOffer:
    def test_leave_offer_success(self):
        user = _make_user()
        offer = _make_offer(status="pending")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.has_user_joined_offer = AsyncMock(return_value=True)
        db.leave_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with (
                patch("src.api.routes.offers.get_postgres_client", return_value=db),
                patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()),
                patch("src.api.routes.offers.get_whatsapp_bot", return_value=AsyncMock()),
            ):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/offer-1/leave")
            assert resp.status_code == 200
            assert resp.json()["status"] == "left"
        finally:
            app.dependency_overrides.clear()

    def test_leave_offer_not_participant(self):
        user = _make_user()
        offer = _make_offer(status="pending")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.has_user_joined_offer = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/offer-1/leave")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestPublishOffer:
    def test_publish_draft_offer(self):
        user = _make_user()
        offer = _make_offer(created_by="user-1", status="draft")
        published = _make_offer(created_by="user-1", status="pending")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)
        db.update_offer = AsyncMock(return_value=published)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/offer-1/publish")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_publish_non_draft_rejected(self):
        user = _make_user()
        offer = _make_offer(created_by="user-1", status="pending")
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=offer)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/offer-1/publish")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


class TestGetParticipants:
    def test_get_participants(self):
        user = _make_user()
        db = MagicMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.is_user_in_building = AsyncMock(return_value=True)
        db.get_offer_participants = AsyncMock(return_value=[{"user_id": "u1"}, {"user_id": "u2"}])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/offer-1/participants")
            assert resp.status_code == 200
            assert resp.json()["total"] == 2
        finally:
            app.dependency_overrides.clear()
