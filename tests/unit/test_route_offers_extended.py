"""Unit tests for the offers API routes (extended coverage)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

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
        building_id="b1",
        created_at=now,
        updated_at=now,
    )


def _make_offer(**kwargs) -> dict:
    now = datetime.now(UTC)
    base = {
        "id": "o1",
        "title": "Solar Panels Deal",
        "description": "Group buy for solar panels",
        "category": "electrical",
        "base_price": 5000.0,
        "building_id": "b1",
        "created_by": "user-1",
        "status": "draft",
        "current_participants": 0,
        "min_participants": 5,
        "max_participants": 50,
        "deadline": None,
        "pricing_tiers": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    base.update(kwargs)
    return base


def _client(user, mock_db):
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.api.routes.offers.get_postgres_client", return_value=mock_db):
            yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# _get_current_discount_percent helper (tested indirectly)
# ---------------------------------------------------------------------------


def test_get_current_discount_percent_helper():
    """Verify helper is importable and returns best discount for participant count."""
    from src.api.routes.offers import _get_current_discount_percent

    offer = {
        "pricing_tiers": [
            {"min": 5, "discount_percent": 10},
            {"min": 10, "discount_percent": 20},
            {"min": 20, "discount_percent": 30},
        ]
    }
    assert _get_current_discount_percent(offer, 0) == 0
    assert _get_current_discount_percent(offer, 5) == 10
    assert _get_current_discount_percent(offer, 10) == 20
    assert _get_current_discount_percent(offer, 25) == 30


# ---------------------------------------------------------------------------
# GET /offers/
# ---------------------------------------------------------------------------


class TestListOffers:
    def test_list_offers_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.list_offers = AsyncMock(return_value=([_make_offer()], 1))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/?building_id=b1&status=draft")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /offers/{offer_id}
# ---------------------------------------------------------------------------


class TestGetOffer:
    def test_get_offer_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/o1")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_offer_not_found(self):
        user = _make_user()
        db = AsyncMock()
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


# ---------------------------------------------------------------------------
# PUT /offers/{offer_id}
# ---------------------------------------------------------------------------


class TestUpdateOffer:
    def test_update_offer_by_creator(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(created_by="user-1", status="pending"))
        db.update_offer = AsyncMock(return_value=_make_offer(title="Updated"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/o1", json={"title": "Updated Title"})
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_offer_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/missing", json={"title": "Updated Offer Title"})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_update_offer_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(created_by="other-user", status="pending"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/o1", json={"title": "Updated Offer Title"})
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_update_completed_offer_blocked(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(created_by="user-1", status="completed"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/offers/o1", json={"title": "Updated Offer Title"})
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /offers/
# ---------------------------------------------------------------------------


class TestCreateOffer:
    def test_create_offer_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value={"id": "b1", "name": "Tower A"})
        db.is_user_in_building = AsyncMock(return_value=True)
        db.create_offer = AsyncMock(return_value=_make_offer())

        embeddings = AsyncMock()
        embeddings.embed_text = AsyncMock(return_value=[0.1, 0.2])
        vs = AsyncMock()
        vs.upsert = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                with patch("src.api.routes.offers.get_embedding_client", return_value=embeddings):
                    with patch("src.api.routes.offers.get_vector_store", return_value=vs):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/offers/",
                            json={
                                "title": "Solar Panels Deal",
                                "description": "Group buy for solar panels",
                                "category": "electrical",
                                "base_price": 5000.0,
                                "min_participants": 5,
                                "max_participants": 50,
                                "building_id": "b1",
                                "created_by": "user-1",
                            },
                        )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_create_offer_building_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/",
                    json={
                        "title": "Test Offer",
                        "description": "Test offer description",
                        "category": "electrical",
                        "base_price": 5000.0,
                        "building_id": "b-missing",
                        "created_by": "user-1",
                    },
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_create_offer_not_resident(self):
        user = _make_user()
        db = AsyncMock()
        db.get_building = AsyncMock(return_value={"id": "b1"})
        db.is_user_in_building = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/",
                    json={
                        "title": "Test Offer Title",
                        "description": "Test offer description for building",
                        "category": "electrical",
                        "base_price": 5000.0,
                        "building_id": "b1",
                        "created_by": "user-1",
                    },
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /offers/{offer_id}/join
# ---------------------------------------------------------------------------


class TestJoinOffer:
    def test_join_offer_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="pending"))
        db.has_user_joined_offer = AsyncMock(return_value=False)
        db.join_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                with patch("src.api.routes.offers.get_whatsapp_bot", return_value=AsyncMock()):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/offers/o1/join", json={"user_id": "user-1", "unit_count": 1})
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_join_offer_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/missing/join", json={"user_id": "user-1", "unit_count": 1})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_join_offer_already_joined(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="pending"))
        db.has_user_joined_offer = AsyncMock(return_value=True)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/o1/join", json={"user_id": "user-1", "unit_count": 1})
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /offers/{offer_id}/leave
# ---------------------------------------------------------------------------


class TestLeaveOffer:
    def test_leave_offer_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="pending"))
        db.has_user_joined_offer = AsyncMock(return_value=True)
        db.leave_offer = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/o1/leave")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_leave_offer_not_joined(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="pending"))
        db.has_user_joined_offer = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/o1/leave")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /offers/{offer_id}
# ---------------------------------------------------------------------------


class TestDeleteOffer:
    def test_delete_offer_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(created_by="user-1", status="draft"))
        db.get_offer_participants = AsyncMock(return_value=[])
        db.update_offer = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                with patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.delete("/api/v1/offers/o1")
            assert resp.status_code == 200
            assert resp.json()["status"] == "cancelled"
        finally:
            app.dependency_overrides.clear()

    def test_delete_offer_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/offers/missing")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_delete_offer_unauthorized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(created_by="other", status="draft"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/offers/o1")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_delete_completed_offer_blocked(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(created_by="user-1", status="completed"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.delete("/api/v1/offers/o1")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /offers/{offer_id}/participants
# ---------------------------------------------------------------------------


class TestGetParticipants:
    def test_get_participants_admin(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.get_offer_participants = AsyncMock(
            return_value=[{"user_id": "user-1", "email": "a@b.com", "full_name": "A"}]
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/o1/participants")
            assert resp.status_code == 200
            assert "participants" in resp.json()
        finally:
            app.dependency_overrides.clear()

    def test_get_participants_resident_anonymized(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.get_offer_participants = AsyncMock(
            return_value=[{"user_id": "user-1", "email": "a@b.com", "unit_number": "4A"}]
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/o1/participants")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_participants_offer_not_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/offers/missing/participants")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /offers/{offer_id}/start-matching
# ---------------------------------------------------------------------------


class TestStartMatching:
    def test_start_matching_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(
            return_value=_make_offer(
                status="pending",
                current_participants=10,
                min_participants=5,
                building_id="b1",
            )
        )
        db.update_offer = AsyncMock()

        mock_orchestrator = AsyncMock()
        mock_orchestrator.run = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                with patch(
                    "src.api.routes.offers.get_orchestrator",
                    return_value=mock_orchestrator,
                ):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/offers/o1/start-matching")
            assert resp.status_code == 200
            assert resp.json()["status"] == "matching_started"
        finally:
            app.dependency_overrides.clear()

    def test_start_matching_offer_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/missing/start-matching")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_start_matching_not_pending(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="draft"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/o1/start-matching")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_start_matching_not_enough_participants(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="pending", current_participants=2, min_participants=5))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/o1/start-matching")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /offers/{offer_id}/match
# ---------------------------------------------------------------------------


class TestMatchContractor:
    def test_match_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="matching"))
        db.get_contractor = AsyncMock(return_value={"id": "c1", "business_name": "Best Plumber"})
        db.update_offer = AsyncMock(return_value=_make_offer(status="matched"))
        db.get_offer_participants = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                with patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/offers/o1/match",
                        json={"contractor_id": "c1", "final_price": 4500.0},
                    )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_match_offer_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/missing/match", json={"contractor_id": "c1", "final_price": 4500.0})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_match_contractor_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer(status="matching"))
        db.get_contractor = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/offers/o1/match", json={"contractor_id": "missing", "final_price": 4500.0})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_match_resident_forbidden(self):
        user = _make_user()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/api/v1/offers/o1/match", json={"contractor_id": "c1", "final_price": 4500.0})
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /offers/{offer_id}/resolve-undersubscription
# ---------------------------------------------------------------------------


class TestResolveUndersubscription:
    def test_extend_deadline_ok(self):

        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.update_offer = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/o1/resolve-undersubscription",
                    params={
                        "action": "extend_deadline",
                        "new_deadline": "2030-01-01T00:00:00+00:00",
                    },
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_lower_minimum_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.update_offer = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/o1/resolve-undersubscription",
                    params={"action": "lower_minimum", "new_minimum": 3},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_cancel_with_refund_ok(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())
        db.update_offer = AsyncMock()
        db.get_offer_participants = AsyncMock(return_value=[])

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                with patch("src.api.routes.offers.get_email_service", return_value=AsyncMock()):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/offers/o1/resolve-undersubscription",
                        params={"action": "cancel_with_refund"},
                    )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_resolve_offer_not_found(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/offers/missing/resolve-undersubscription",
                    params={"action": "lower_minimum", "new_minimum": 3},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_resolve_resident_forbidden(self):
        user = _make_user()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/offers/o1/resolve-undersubscription",
                params={"action": "lower_minimum", "new_minimum": 3},
            )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_extend_deadline_missing_param(self):
        admin = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_offer = AsyncMock(return_value=_make_offer())

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with patch("src.api.routes.offers.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                # No new_deadline provided
                resp = client.post(
                    "/api/v1/offers/o1/resolve-undersubscription",
                    params={"action": "extend_deadline"},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()
