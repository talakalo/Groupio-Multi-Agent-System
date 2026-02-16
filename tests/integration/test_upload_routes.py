"""Tests for file upload API routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.middleware.auth import get_current_user
from src.services.storage import StorageError


@pytest.fixture
def mock_user():
    """Mock authenticated resident user."""
    return MagicMock(
        id="user-123",
        email="test@example.com",
        role="resident",
        is_active=True,
    )


@pytest.fixture
def mock_admin_user():
    """Mock authenticated admin user."""
    return MagicMock(
        id="admin-001",
        email="admin@example.com",
        role="admin",
        is_active=True,
    )


@pytest.fixture
def client(mock_user):
    """Create test client with auth dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    """Mock PostgreSQL client at the upload routes module level."""
    with patch("src.api.routes.uploads.get_postgres_client") as mock:
        db = AsyncMock()
        mock.return_value = db
        yield db


@pytest.fixture
def mock_storage():
    """Mock storage service used by upload routes."""
    with patch("src.api.routes.uploads.get_storage_service") as mock_get:
        storage = MagicMock()
        storage.validate_file = MagicMock()  # sync method – no side effect = passes
        storage.upload = AsyncMock(
            return_value={
                "storage_path": "2026/01/abc123.pdf",
                "public_url": "https://storage.example.com/architecture-plans/2026/01/abc123.pdf",
            }
        )
        storage.get_signed_url = AsyncMock(return_value="https://signed-url.example.com/file")
        storage.delete = AsyncMock()
        mock_get.return_value = storage
        yield storage


class TestUploadArchitecture:
    """Tests for POST /api/v1/uploads/architecture."""

    def test_upload_architecture_success(self, client, mock_db, mock_storage):
        """Upload a valid architecture plan PDF and verify response."""
        mock_db.create_file_upload = AsyncMock()

        response = client.post(
            "/api/v1/uploads/architecture",
            files={"file": ("plan.pdf", b"fake pdf content", "application/pdf")},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["analysis_status"] == "pending"
        assert data["file_name"] == "plan.pdf"
        assert data["storage_path"] == "2026/01/abc123.pdf"
        mock_db.create_file_upload.assert_awaited_once()

    def test_upload_architecture_invalid_type(self, client, mock_db, mock_storage):
        """Uploading a disallowed file type (.exe) should return 400."""
        mock_storage.validate_file.side_effect = StorageError(
            "File type 'application/x-msdownload' not allowed for bucket 'architecture-plans'."
        )

        response = client.post(
            "/api/v1/uploads/architecture",
            files={"file": ("malware.exe", b"bad content", "application/x-msdownload")},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"]


class TestUploadContractorDoc:
    """Tests for POST /api/v1/uploads/contractor-docs."""

    def test_upload_contractor_doc_success(self, client, mock_db, mock_storage):
        """Upload a contractor document and verify response."""
        mock_db.create_file_upload = AsyncMock()

        response = client.post(
            "/api/v1/uploads/contractor-docs",
            files={"file": ("license.pdf", b"fake pdf content", "application/pdf")},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "storage_path" in data
        mock_db.create_file_upload.assert_awaited_once()


class TestUploadAvatar:
    """Tests for POST /api/v1/uploads/avatar."""

    def test_upload_avatar_success(self, client, mock_db, mock_storage):
        """Upload an avatar image and verify response."""
        mock_db.update_user = AsyncMock()

        response = client.post(
            "/api/v1/uploads/avatar",
            files={"file": ("avatar.png", b"fake image bytes", "image/png")},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "avatar_url" in data
        mock_db.update_user.assert_awaited_once()


class TestGetFile:
    """Tests for GET /api/v1/uploads/{file_id}."""

    @pytest.fixture
    def sample_file_record(self):
        return {
            "id": "file-001",
            "user_id": "user-123",
            "bucket": "architecture-plans",
            "file_name": "plan.pdf",
            "file_type": "application/pdf",
            "file_size": 12345,
            "storage_path": "2026/01/abc123.pdf",
            "building_id": "building-123",
            "analysis_status": "pending",
        }

    def test_get_file_success(self, client, mock_db, mock_storage, sample_file_record):
        """Owner can retrieve file metadata with a signed download URL."""
        mock_db.get_file_upload = AsyncMock(return_value=sample_file_record)

        response = client.get(
            "/api/v1/uploads/file-001",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "download_url" in data
        assert data["id"] == "file-001"
        mock_storage.get_signed_url.assert_awaited_once()

    def test_get_file_not_found(self, client, mock_db, mock_storage):
        """Request for a non-existent file returns 404."""
        mock_db.get_file_upload = AsyncMock(return_value=None)

        response = client.get(
            "/api/v1/uploads/nonexistent-id",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 404

    def test_get_file_access_denied(self, mock_db, mock_storage, sample_file_record):
        """Non-owner non-admin user cannot access the file (403)."""
        mock_db.get_file_upload = AsyncMock(return_value=sample_file_record)

        other_user = MagicMock(
            id="user-other",
            email="other@example.com",
            role="resident",
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: other_user
        other_client = TestClient(app)

        try:
            response = other_client.get(
                "/api/v1/uploads/file-001",
                headers={"Authorization": "Bearer test-token"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestDeleteFile:
    """Tests for DELETE /api/v1/uploads/{file_id}."""

    @pytest.fixture
    def sample_file_record(self):
        return {
            "id": "file-001",
            "user_id": "user-123",
            "bucket": "architecture-plans",
            "file_name": "plan.pdf",
            "file_type": "application/pdf",
            "file_size": 12345,
            "storage_path": "2026/01/abc123.pdf",
            "building_id": "building-123",
            "analysis_status": "pending",
        }

    def test_delete_file_success(self, client, mock_db, mock_storage, sample_file_record):
        """Owner can delete their own file."""
        mock_db.get_file_upload = AsyncMock(return_value=sample_file_record)
        mock_db.delete_file_upload = AsyncMock()

        response = client.delete(
            "/api/v1/uploads/file-001",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        mock_storage.delete.assert_awaited_once()
        mock_db.delete_file_upload.assert_awaited_once_with("file-001")

    def test_delete_file_access_denied(self, mock_db, mock_storage, sample_file_record):
        """Non-owner non-admin user cannot delete the file (403)."""
        mock_db.get_file_upload = AsyncMock(return_value=sample_file_record)

        other_user = MagicMock(
            id="user-other",
            email="other@example.com",
            role="resident",
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: other_user
        other_client = TestClient(app)

        try:
            response = other_client.delete(
                "/api/v1/uploads/file-001",
                headers={"Authorization": "Bearer test-token"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestListUploads:
    """Tests for GET /api/v1/uploads/."""

    def test_list_uploads(self, client, mock_db):
        """Listing uploads returns items for the current user."""
        uploads = [
            {"id": "file-001", "file_name": "plan.pdf", "bucket": "architecture-plans"},
            {"id": "file-002", "file_name": "avatar.png", "bucket": "avatars"},
        ]
        mock_db.list_file_uploads = AsyncMock(return_value=uploads)

        response = client.get(
            "/api/v1/uploads/",
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert data["total"] == 2
        assert len(data["items"]) == 2
        mock_db.list_file_uploads.assert_awaited_once()
