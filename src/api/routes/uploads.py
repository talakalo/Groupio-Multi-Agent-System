"""File upload API routes."""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.models.user import UserInDB
from src.services.storage import StorageError, get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["uploads"])


# ------------------------------------------------------------------
# Upload architecture plan
# ------------------------------------------------------------------


@router.post("/architecture")
async def upload_architecture_plan(
    file: UploadFile = File(...),
    building_id: str | None = Query(None),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Upload a floor plan / architecture document for AI analysis."""
    storage = get_storage_service()
    data = await file.read()

    try:
        storage.validate_file(
            bucket="architecture-plans",
            file_name=file.filename or "unknown",
            file_size=len(data),
            content_type=file.content_type,
        )
    except StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await storage.upload(
        bucket="architecture-plans",
        file_data=data,
        file_name=file.filename or "upload",
        content_type=file.content_type,
        user_id=current_user.id,
    )

    # Persist metadata in DB
    db = get_postgres_client()
    file_id = str(uuid4())
    record = {
        "id": file_id,
        "user_id": current_user.id,
        "bucket": "architecture-plans",
        "file_name": file.filename or "unknown",
        "file_type": file.content_type or "application/octet-stream",
        "file_size": len(data),
        "storage_path": result["storage_path"],
        "building_id": building_id,
        "analysis_status": "pending",
    }
    await db.create_file_upload(record)

    return {
        "id": file_id,
        "file_name": file.filename,
        "storage_path": result["storage_path"],
        "public_url": result.get("public_url"),
        "analysis_status": "pending",
    }


# ------------------------------------------------------------------
# Upload contractor document
# ------------------------------------------------------------------


@router.post("/contractor-docs")
async def upload_contractor_doc(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Upload a contractor document (license, insurance, certificate)."""
    storage = get_storage_service()
    data = await file.read()

    try:
        storage.validate_file("contractor-docs", file.filename or "", len(data), file.content_type)
    except StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await storage.upload(
        bucket="contractor-docs",
        file_data=data,
        file_name=file.filename or "doc",
        content_type=file.content_type,
        user_id=current_user.id,
    )

    db = get_postgres_client()
    file_id = str(uuid4())
    await db.create_file_upload(
        {
            "id": file_id,
            "user_id": current_user.id,
            "bucket": "contractor-docs",
            "file_name": file.filename or "unknown",
            "file_type": file.content_type or "application/octet-stream",
            "file_size": len(data),
            "storage_path": result["storage_path"],
            "analysis_status": "pending",
        }
    )

    return {"id": file_id, "storage_path": result["storage_path"]}


# ------------------------------------------------------------------
# Upload avatar
# ------------------------------------------------------------------


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Upload user avatar."""
    storage = get_storage_service()
    data = await file.read()

    try:
        storage.validate_file("avatars", file.filename or "", len(data), file.content_type)
    except StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await storage.upload(
        bucket="avatars",
        file_data=data,
        file_name=file.filename or "avatar",
        content_type=file.content_type,
        user_id=current_user.id,
    )

    # Update user avatar_url
    db = get_postgres_client()
    await db.update_user(current_user.id, {"avatar_url": result.get("public_url", result["storage_path"])})

    return {"avatar_url": result.get("public_url", result["storage_path"])}


# ------------------------------------------------------------------
# Get file metadata / signed URL
# ------------------------------------------------------------------


@router.get("/{file_id}")
async def get_file(
    file_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get file metadata and a signed download URL."""
    db = get_postgres_client()
    record = await db.get_file_upload(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    # Only owner or admin may access
    if record["user_id"] != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    storage = get_storage_service()
    signed_url = await storage.get_signed_url(record["bucket"], record["storage_path"])

    return {**record, "download_url": signed_url}


# ------------------------------------------------------------------
# Delete
# ------------------------------------------------------------------


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Delete an uploaded file."""
    db = get_postgres_client()
    record = await db.get_file_upload(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    if record["user_id"] != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    storage = get_storage_service()
    await storage.delete(record["bucket"], record["storage_path"])
    await db.delete_file_upload(file_id)

    return {"status": "deleted"}


# ------------------------------------------------------------------
# List user uploads
# ------------------------------------------------------------------


@router.get("/")
async def list_uploads(
    bucket: str | None = None,
    building_id: str | None = None,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """List the current user's uploads, optionally filtered by bucket/building."""
    db = get_postgres_client()
    uploads = await db.list_file_uploads(
        user_id=current_user.id,
        bucket=bucket,
        building_id=building_id,
    )
    return {"items": uploads, "total": len(uploads)}
