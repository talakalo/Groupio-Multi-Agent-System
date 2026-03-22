"""Tests for WebSocket authentication (P0-4)."""

from src.api.routes.websocket import _ADMIN_ROLES


class TestWebSocketAdminRoles:
    """Verify admin roles for WebSocket auth."""

    def test_admin_role_included(self):
        assert "admin" in _ADMIN_ROLES

    def test_super_admin_included(self):
        assert "super_admin" in _ADMIN_ROLES

    def test_buildings_manager_included(self):
        assert "buildings_manager" in _ADMIN_ROLES

    def test_resident_excluded(self):
        assert "resident" not in _ADMIN_ROLES

    def test_contractor_excluded(self):
        assert "contractor" not in _ADMIN_ROLES
