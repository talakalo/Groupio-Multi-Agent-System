"""Unit tests for the contractors API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role: UserRole = UserRole.RESIDENT, contractor_id: str | None = None) -> UserInDB:
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
        contractor_id=contractor_id,
        created_at=now,
        updated_at=now,
    )


def _make_contractor(**kwargs) -> dict:
    now = datetime.now(UTC)
    base = {
        "id": "c1",
        "business_name": "Best Plumber",
        "contact_name": "Bob",
        "email": "bob@plumber.com",
        "phone": "0501234567",
        "categories": ["plumbing"],
        "regions": ["center"],
        "description": (
            "Professional plumber with over 10 years of experience in residential and commercial plumbing services"
        ),
        "verification_status": "pending",
        "trust_score": 80,
        "average_rating": 4.5,
        "total_jobs": 10,
        "years_experience": 10,
        "employee_count": 3,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# GET /contractors/
# ---------------------------------------------------------------------------


class TestListContractors:
    def test_list_contractors_ok(self):
        db = AsyncMock()
        db.list_contractors = AsyncMock(return_value=([_make_contractor()], 1))

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/contractors/")

        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_list_contractors_with_filters(self):
        db = AsyncMock()
        db.list_contractors = AsyncMock(return_value=([], 0))

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(
                "/api/v1/contractors/?category=plumbing&region=center&min_trust_score=70&verification_status=verified"
            )

        assert resp.status_code == 200
        filters = db.list_contractors.call_args[1]["filters"]
        assert filters.get("min_trust_score") == 70.0


# ---------------------------------------------------------------------------
# POST /contractors/search
# ---------------------------------------------------------------------------


class TestSearchContractors:
    def test_search_with_query(self):
        db = AsyncMock()
        db.get_contractors_by_ids = AsyncMock(return_value=[_make_contractor()])
        embeddings = AsyncMock()
        embeddings.embed_text = AsyncMock(return_value=[0.1, 0.2])
        vs = AsyncMock()
        vs.search = AsyncMock(return_value=[{"id": "c1", "score": 0.9}])

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            with patch("src.api.routes.contractors.get_embedding_client", return_value=embeddings):
                with patch("src.api.routes.contractors.get_vector_store", return_value=vs):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/contractors/search",
                        json={"query": "plumber", "page": 1, "page_size": 10},
                    )

        assert resp.status_code == 200

    def test_search_without_query(self):
        db = AsyncMock()
        db.list_contractors = AsyncMock(return_value=([_make_contractor()], 1))

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/contractors/search",
                json={"query": "", "page": 1, "page_size": 10},
            )

        assert resp.status_code == 200

    def test_search_without_query_with_filters(self):
        db = AsyncMock()
        db.list_contractors = AsyncMock(return_value=([_make_contractor()], 1))

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/contractors/search",
                json={
                    "query": "",
                    "categories": ["plumbing"],
                    "regions": ["center"],
                    "min_trust_score": 50.0,
                    "min_rating": 4.0,
                    "verification_status": "verified",
                    "page": 1,
                    "page_size": 10,
                },
            )

        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /contractors/{contractor_id}
# ---------------------------------------------------------------------------


class TestGetContractor:
    def test_get_contractor_ok(self):
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/contractors/c1")

        assert resp.status_code == 200

    def test_get_contractor_not_found(self):
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=None)

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/contractors/missing")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /contractors/{contractor_id}
# ---------------------------------------------------------------------------


class TestUpdateContractor:
    def test_update_contractor_by_owner(self):
        user = _make_user(contractor_id="c1")
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())
        db.update_contractor = AsyncMock(return_value=_make_contractor(business_name="Updated"))
        embeddings = AsyncMock()
        embeddings.embed_text = AsyncMock(return_value=[0.1, 0.2])
        vs = AsyncMock()
        vs.upsert = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                with patch("src.api.routes.contractors.get_embedding_client", return_value=embeddings):
                    with patch("src.api.routes.contractors.get_vector_store", return_value=vs):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.put(
                            "/api/v1/contractors/c1",
                            json={"business_name": "Updated"},
                        )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_contractor_not_found(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/contractors/missing", json={"business_name": "Updated Name"})
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_update_contractor_unauthorized(self):
        user = _make_user(role=UserRole.RESIDENT, contractor_id=None)
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/contractors/c1", json={"business_name": "Updated Name"})
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /contractors/{contractor_id}/reviews
# ---------------------------------------------------------------------------


class TestContractorReviews:
    def test_get_reviews_ok(self):
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())
        db.get_contractor_reviews = AsyncMock(return_value=([{"id": "r1", "rating": 5}], 1))

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/contractors/c1/reviews")

        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_get_reviews_contractor_not_found(self):
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=None)

        from src.api.main import app

        with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/contractors/missing/reviews")

        assert resp.status_code == 404

    def test_add_review_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())
        db.has_user_completed_offer_with_contractor = AsyncMock(return_value=True)
        db.create_review = AsyncMock(
            return_value={
                "id": "r1",
                "contractor_id": "c1",
                "user_id": "user-1",
                "offer_id": "o1",
                "rating": 5,
                "comment": "Great!",
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        db.update_contractor_rating = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        _review_payload = {
            "id": "r1",
            "contractor_id": "c1",
            "user_id": "user-1",
            "offer_id": "o1",
            "rating": 5,
            "comment": "Great!",
            "created_at": datetime.now(UTC).isoformat(),
        }
        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/contractors/c1/reviews", json=_review_payload)
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_add_review_no_completed_offer(self):
        user = _make_user()
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())
        db.has_user_completed_offer_with_contractor = AsyncMock(return_value=False)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        _review_payload2 = {
            "id": "r2",
            "contractor_id": "c1",
            "user_id": "user-1",
            "offer_id": "o1",
            "rating": 5,
            "comment": "Great!",
            "created_at": datetime.now(UTC).isoformat(),
        }
        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/contractors/c1/reviews", json=_review_payload2)
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /contractors/{contractor_id}/stats
# ---------------------------------------------------------------------------


class TestContractorStats:
    def test_get_stats_by_admin(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())
        db.get_contractor_stats = AsyncMock(
            return_value={
                "total_jobs": 10,
                "completed_jobs": 8,
                "cancelled_jobs": 2,
                "average_rating": 4.5,
                "total_revenue": 50000,
                "trust_score": 80,
            }
        )

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/contractors/c1/stats")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_get_stats_unauthorized(self):
        user = _make_user(role=UserRole.RESIDENT, contractor_id=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        db = AsyncMock()
        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/api/v1/contractors/c1/stats")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /contractors/{contractor_id}/verify
# ---------------------------------------------------------------------------


class TestVerifyContractor:
    def test_verify_ok(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=_make_contractor())
        db.update_contractor = AsyncMock(return_value=_make_contractor(verification_status="verified"))

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/contractors/c1/verify?status=verified")
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_verify_not_found(self):
        user = _make_user(role=UserRole.ADMIN)
        db = AsyncMock()
        db.get_contractor = AsyncMock(return_value=None)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/contractors/missing/verify?status=verified")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_verify_resident_forbidden(self):
        user = _make_user(role=UserRole.RESIDENT)
        db = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/contractors/c1/verify?status=verified")
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /contractors/ create
# ---------------------------------------------------------------------------


class TestCreateContractor:
    def test_create_contractor_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)
        db.create_contractor = AsyncMock(return_value=_make_contractor())
        embeddings = AsyncMock()
        embeddings.embed_text = AsyncMock(return_value=[0.1, 0.2])
        vs = AsyncMock()
        vs.upsert = AsyncMock()
        graph = AsyncMock()
        graph.create_contractor_node = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                with patch("src.api.routes.contractors.get_embedding_client", return_value=embeddings):
                    with patch("src.api.routes.contractors.get_vector_store", return_value=vs):
                        with patch("src.api.routes.contractors.get_graph_store", return_value=graph):
                            client = TestClient(app, raise_server_exceptions=False)
                            resp = client.post(
                                "/api/v1/contractors/",
                                json={
                                    "business_name": "Best Plumber",
                                    "contact_name": "Bob",
                                    "email": "bob@plumber.com",
                                    "phone": "0501234567",
                                    "categories": ["plumbing"],
                                    "regions": ["center"],
                                    "description": (
                                        "Professional plumber with over 10 years of experience"
                                        " in residential and commercial work"
                                    ),
                                    "years_experience": 10,
                                    "employee_count": 3,
                                    "password": "securepassword123",
                                },
                            )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_create_contractor_email_exists(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value={"id": "existing"})

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.contractors.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/contractors/",
                    json={
                        "business_name": "Best Plumber",
                        "contact_name": "Bob",
                        "email": "existing@test.com",
                        "phone": "0501234567",
                        "categories": ["plumbing"],
                        "regions": ["center"],
                        "description": (
                            "Professional plumber with over 10 years of experience in residential and commercial work"
                        ),
                        "years_experience": 10,
                        "employee_count": 3,
                        "password": "securepassword123",
                    },
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()
