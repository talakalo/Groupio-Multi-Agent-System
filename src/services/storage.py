"""File storage service using Supabase Storage (or local filesystem fallback)."""

import logging
import mimetypes
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

ALLOWED_TYPES: dict[str, set[str]] = {
    "architecture-plans": {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/heic",
        "image/webp",
    },
    "contractor-docs": {"application/pdf", "image/png", "image/jpeg"},
    "avatars": {"image/png", "image/jpeg", "image/webp"},
    "invoices": {"application/pdf"},
}

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
BUCKETS = list(ALLOWED_TYPES.keys())

# Magic bytes signatures for supported file types.
# Each entry is (mime_type, [(offset, bytes_to_match), ...])
# A file is accepted if ANY of its mime-type's signatures matches.
_MAGIC_SIGNATURES: list[tuple[str, list[tuple[int, bytes]]]] = [
    ("application/pdf", [(0, b"%PDF")]),
    ("image/png", [(0, b"\x89PNG\r\n\x1a\n")]),
    ("image/jpeg", [(0, b"\xff\xd8\xff")]),
    # WebP: "RIFF" at 0, "WEBP" at 8
    ("image/webp", [(0, b"RIFF"), (8, b"WEBP")]),
    # HEIC/HEIF: "ftyp" at offset 4
    ("image/heic", [(4, b"ftyp")]),
]


def _detect_magic_type(data: bytes) -> str | None:
    """Return MIME type detected from magic bytes, or None if unknown."""
    for mime, sigs in _MAGIC_SIGNATURES:
        if all(
            len(data) >= offset + len(magic) and data[offset : offset + len(magic)] == magic
            for offset, magic in sigs
        ):
            return mime
    return None


def _verify_magic_bytes(data: bytes, declared_content_type: str) -> bool:
    """Return True if the file's magic bytes match the declared content type.

    Prevents Content-Type spoofing where an attacker uploads a malicious file
    (e.g. an executable or HTML) with a trusted MIME type like image/jpeg.
    """
    detected = _detect_magic_type(data)
    if detected is None:
        # Unknown magic — reject to be safe
        return False
    return detected == declared_content_type


class StorageError(Exception):
    """Raised when a storage operation fails."""


class StorageService:
    """Abstract storage service with Supabase and local filesystem backends."""

    def __init__(self) -> None:
        self._supabase_client: Any = None
        settings = get_settings()
        self._use_supabase = bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)

    async def _get_client(self) -> Any:
        if self._supabase_client is None and self._use_supabase:
            from supabase import acreate_client

            settings = get_settings()
            self._supabase_client = await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._supabase_client

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate_file(
        self,
        bucket: str,
        file_name: str,
        file_size: int,
        content_type: str | None,
        file_data: bytes | None = None,
    ) -> None:
        """Raise *StorageError* if the file is not acceptable.

        When *file_data* is supplied the actual magic bytes are verified against
        the declared *content_type* to prevent Content-Type spoofing attacks.
        """
        if bucket not in ALLOWED_TYPES:
            raise StorageError(f"Unknown bucket: {bucket}")

        if file_size > MAX_FILE_SIZE:
            raise StorageError(f"File too large ({file_size} bytes). Max {MAX_FILE_SIZE}.")

        if file_size == 0:
            raise StorageError("Empty file")

        # Infer content-type from extension when not provided
        if not content_type:
            content_type, _ = mimetypes.guess_type(file_name)

        allowed = ALLOWED_TYPES[bucket]
        if content_type not in allowed:
            raise StorageError(
                f"File type '{content_type}' not allowed for bucket '{bucket}'. Allowed: {', '.join(sorted(allowed))}"
            )

        # Verify actual file magic bytes to prevent Content-Type spoofing.
        # Skip for unknown/unverifiable types (HEIC detection is less reliable).
        if file_data is not None and content_type != "image/heic":
            if not _verify_magic_bytes(file_data, content_type):
                raise StorageError(
                    f"File content does not match declared type '{content_type}'. "
                    "Upload rejected to prevent Content-Type spoofing."
                )

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------

    async def upload(
        self,
        bucket: str,
        file_data: bytes,
        file_name: str,
        content_type: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, str]:
        """Upload a file and return ``{storage_path, public_url}``."""
        self.validate_file(bucket, file_name, len(file_data), content_type, file_data=file_data)

        ext = Path(file_name).suffix
        unique_name = f"{uuid4().hex}{ext}"
        prefix = datetime.now(UTC).strftime("%Y/%m")
        storage_path = f"{prefix}/{unique_name}"

        if self._use_supabase:
            return await self._upload_supabase(bucket, storage_path, file_data, content_type)
        return await self._upload_local(bucket, storage_path, file_data)

    async def _upload_supabase(self, bucket: str, path: str, data: bytes, content_type: str | None) -> dict[str, str]:
        client = await self._get_client()
        try:
            opts: dict[str, Any] = {}
            if content_type:
                opts["content_type"] = content_type
            await client.storage.from_(bucket).upload(path, data, file_options=opts)
            public_url = client.storage.from_(bucket).get_public_url(path)
            return {"storage_path": path, "public_url": public_url}
        except Exception as exc:
            logger.error("Supabase upload failed: %s", exc)
            raise StorageError(f"Upload failed: {exc}") from exc

    async def _upload_local(self, bucket: str, path: str, data: bytes) -> dict[str, str]:
        """Fallback: write to ``./uploads/<bucket>/<path>``."""
        base = Path("uploads") / bucket / path
        base.parent.mkdir(parents=True, exist_ok=True)
        base.write_bytes(data)
        return {"storage_path": path, "public_url": f"/uploads/{bucket}/{path}"}

    # ------------------------------------------------------------------
    # Signed URL / Download
    # ------------------------------------------------------------------

    async def get_signed_url(self, bucket: str, storage_path: str, expires_in: int = 3600) -> str:
        """Return a time-limited download URL."""
        if self._use_supabase:
            client = await self._get_client()
            res = await client.storage.from_(bucket).create_signed_url(storage_path, expires_in)
            return res.get("signedURL", "")
        return await self._local_signed_url(storage_path, expires_in)

    async def create_signed_url(self, bucket: str, path: str, expires_in: int = 3600) -> str:
        """Generate a time-limited signed URL for private file access."""
        return await self.get_signed_url(bucket, path, expires_in)

    async def _local_signed_url(self, path: str, expires_in: int) -> str:
        """Generate a local HMAC-signed URL for development/testing."""
        import hashlib
        import hmac
        import time

        settings = get_settings()
        expiry = int(time.time()) + expires_in
        sig = hmac.new(
            settings.JWT_SECRET_KEY.encode(),
            f"{path}:{expiry}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return f"/local-files/{path}?expires={expiry}&sig={sig}"

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete(self, bucket: str, storage_path: str) -> None:
        if self._use_supabase:
            client = await self._get_client()
            await client.storage.from_(bucket).remove([storage_path])
        else:
            local = Path("uploads") / bucket / storage_path
            if local.exists():
                local.unlink()


_storage: StorageService | None = None


def get_storage_service() -> StorageService:
    """Singleton accessor."""
    global _storage
    if _storage is None:
        _storage = StorageService()
    return _storage
