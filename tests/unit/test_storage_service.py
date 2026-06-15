"""Unit tests for the StorageService."""

from unittest.mock import patch

import pytest

from src.services.storage import StorageError, StorageService

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def storage():
    """Create a StorageService with Supabase disabled (local fallback)."""
    with patch("src.services.storage.get_settings") as mock_settings:
        mock_settings.return_value.SUPABASE_URL = ""
        mock_settings.return_value.SUPABASE_KEY = ""
        # _local_signed_url calls get_settings().JWT_SECRET_KEY.encode(); provide
        # a real string so hmac.new() receives bytes instead of a MagicMock.
        mock_settings.return_value.JWT_SECRET_KEY = "x" * 40
        svc = StorageService()
        yield svc


# ------------------------------------------------------------------
# Validation tests
# ------------------------------------------------------------------


def test_validate_file_success(storage):
    """Valid bucket, filename, size, and content_type passes validation."""
    # Should not raise
    storage.validate_file("contractor-docs", "license.pdf", 1024, "application/pdf")


def test_validate_file_unknown_bucket(storage):
    """Unknown bucket raises StorageError."""
    with pytest.raises(StorageError, match="Unknown bucket"):
        storage.validate_file("nonexistent-bucket", "file.pdf", 1024, "application/pdf")


def test_validate_file_too_large(storage):
    """File size exceeding 20 MB raises StorageError."""
    too_large = 20 * 1024 * 1024 + 1
    with pytest.raises(StorageError, match="File too large"):
        storage.validate_file("contractor-docs", "big.pdf", too_large, "application/pdf")


def test_validate_file_empty(storage):
    """Zero-byte file raises StorageError."""
    with pytest.raises(StorageError, match="Empty file"):
        storage.validate_file("contractor-docs", "empty.pdf", 0, "application/pdf")


def test_validate_file_wrong_type(storage):
    """Disallowed content_type raises StorageError."""
    with pytest.raises(StorageError, match="not allowed"):
        storage.validate_file("invoices", "sheet.xlsx", 500, "application/vnd.ms-excel")


def test_validate_file_infers_type(storage):
    """When content_type is None, type is inferred from extension."""
    # .pdf → application/pdf, which is allowed for contractor-docs
    storage.validate_file("contractor-docs", "contract.pdf", 2048, None)


# ------------------------------------------------------------------
# Upload / signed URL / delete – local fallback
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_local_fallback(storage, tmp_path, monkeypatch):
    """Local fallback upload writes file and returns local path."""
    monkeypatch.chdir(tmp_path)

    # Use real PDF magic bytes so the magic-byte validation passes
    pdf_data = b"%PDF-1.4 fake content for testing"
    result = await storage.upload(
        bucket="contractor-docs",
        file_data=pdf_data,
        file_name="doc.pdf",
        content_type="application/pdf",
    )

    assert "storage_path" in result
    assert result["public_url"].startswith("/uploads/contractor-docs/")
    # Verify the file was actually written
    local_file = tmp_path / "uploads" / "contractor-docs" / result["storage_path"]
    assert local_file.read_bytes() == pdf_data


@pytest.mark.asyncio
async def test_get_signed_url_local(storage):
    """Local fallback returns an HMAC-signed path for development access."""
    url = await storage.get_signed_url("contractor-docs", "2026/01/abc.pdf")
    # _local_signed_url returns /local-files/{path}?expires=<ts>&sig=<hmac>
    assert url.startswith("/local-files/2026/01/abc.pdf?expires=")
    assert "&sig=" in url


@pytest.mark.asyncio
async def test_delete_local(storage, tmp_path, monkeypatch):
    """Local fallback deletes the file from disk."""
    monkeypatch.chdir(tmp_path)

    # Create a file to delete
    target = tmp_path / "uploads" / "contractor-docs" / "2026" / "01" / "abc.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"data")

    await storage.delete("contractor-docs", "2026/01/abc.pdf")
    assert not target.exists()


# ------------------------------------------------------------------
# Singleton
# ------------------------------------------------------------------


def test_singleton_accessor():
    """get_storage_service() returns the same instance on repeated calls."""
    import src.services.storage as mod

    # Reset the singleton so our test starts clean
    mod._storage = None

    with patch("src.services.storage.get_settings") as mock_settings:
        mock_settings.return_value.SUPABASE_URL = ""
        mock_settings.return_value.SUPABASE_KEY = ""

        first = mod.get_storage_service()
        second = mod.get_storage_service()
        assert first is second

    # Cleanup
    mod._storage = None
