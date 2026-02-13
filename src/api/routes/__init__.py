"""API routes module - registers all API endpoints."""

from fastapi import APIRouter

from src.api.routes.admin import router as admin_router
from src.api.routes.agents import router as agents_router
from src.api.routes.auth import router as auth_router
from src.api.routes.buildings import router as buildings_router
from src.api.routes.contractors import router as contractors_router
from src.api.routes.escalations import router as escalations_router
from src.api.routes.offers import router as offers_router
from src.api.routes.payments import admin_router as payments_admin_router
from src.api.routes.payments import router as payments_router
from src.api.routes.uploads import router as uploads_router
from src.api.routes.webhooks import router as webhooks_router

# Create main API router
api_router = APIRouter()

# Include all route modules with prefixes and tags
api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["Authentication"],
)

api_router.include_router(
    offers_router,
    prefix="/offers",
    tags=["Offers"],
)

api_router.include_router(
    contractors_router,
    prefix="/contractors",
    tags=["Contractors"],
)

api_router.include_router(
    buildings_router,
    prefix="/buildings",
    tags=["Buildings"],
)

api_router.include_router(
    escalations_router,
    prefix="/escalations",
    tags=["Escalations"],
)

api_router.include_router(
    agents_router,
    prefix="/agents",
    tags=["AI Agents"],
)

api_router.include_router(
    admin_router,
    prefix="/admin",
    tags=["Admin"],
)

api_router.include_router(
    payments_router,
    prefix="/payments",
    tags=["Payments"],
)

api_router.include_router(
    payments_admin_router,
    tags=["Admin Payments"],
)

api_router.include_router(
    uploads_router,
    prefix="/uploads",
    tags=["Uploads"],
)

api_router.include_router(
    webhooks_router,
    prefix="/webhooks",
    tags=["Webhooks"],
)

__all__ = ["api_router"]
