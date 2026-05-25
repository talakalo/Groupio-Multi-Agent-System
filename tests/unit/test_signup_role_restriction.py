"""Regression tests: public signup must reject privileged roles.

Security fix: privilege-escalation via client-supplied role during public
account creation.

Both /api/v1/auth/signup (SignupRequest) and /api/v1/auth/register (UserCreate)
must reject roles that are not in SELF_REGISTERABLE_ROLES (resident, contractor).

This file tests the Pydantic model layer (src.models.user).
HTTP-level integration tests for SignupRequest live in
tests/integration/test_auth_signup_role.py.
"""

import pytest
from pydantic import ValidationError

from src.models.user import SELF_REGISTERABLE_ROLES, UserCreate, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_REGISTER_BASE = {
    "email": "test@example.com",
    "full_name": "Test User",
    "phone": "0501234567",
    "password": "securepass12",
    "preferred_language": "he",
}


# ---------------------------------------------------------------------------
# SELF_REGISTERABLE_ROLES constant
# ---------------------------------------------------------------------------


def test_self_registerable_roles_contains_resident():
    assert UserRole.RESIDENT in SELF_REGISTERABLE_ROLES


def test_self_registerable_roles_contains_contractor():
    assert UserRole.CONTRACTOR in SELF_REGISTERABLE_ROLES


def test_self_registerable_roles_excludes_admin():
    assert UserRole.ADMIN not in SELF_REGISTERABLE_ROLES


def test_self_registerable_roles_excludes_super_admin():
    assert UserRole.SUPER_ADMIN not in SELF_REGISTERABLE_ROLES


def test_self_registerable_roles_excludes_buildings_manager():
    assert UserRole.BUILDINGS_MANAGER not in SELF_REGISTERABLE_ROLES


def test_self_registerable_roles_has_exactly_two_members():
    """Guard: if the set grows, reviewers should consciously decide it."""
    assert len(SELF_REGISTERABLE_ROLES) == 2, (
        f"SELF_REGISTERABLE_ROLES grew unexpectedly: {SELF_REGISTERABLE_ROLES}. "
        "If you intentionally added a new public-registerable role, update this test."
    )


# ---------------------------------------------------------------------------
# UserCreate — allowed roles (must succeed)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["resident", "contractor"])
def test_user_create_allows_safe_roles(role: str):
    """resident and contractor are valid for /register."""
    req = UserCreate(**{**_VALID_REGISTER_BASE, "role": role})
    assert req.role == UserRole(role)


def test_user_create_default_role_is_resident():
    """UserCreate default role must be resident, not a privileged role."""
    req = UserCreate(**_VALID_REGISTER_BASE)
    assert req.role == UserRole.RESIDENT


# ---------------------------------------------------------------------------
# UserCreate — forbidden roles (must raise ValidationError)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "privileged_role",
    ["admin", "super_admin", "buildings_manager"],
)
def test_user_create_rejects_privileged_roles(privileged_role: str):
    """The /register endpoint model must block privileged roles."""
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(**{**_VALID_REGISTER_BASE, "role": privileged_role})
    errors = exc_info.value.errors()
    role_errors = [e for e in errors if "role" in e.get("loc", ())]
    assert role_errors, (
        f"Expected a ValidationError on 'role' for '{privileged_role}', "
        f"got: {errors}"
    )


def test_user_create_rejects_admin_explicit():
    """Explicit regression: UserCreate with role=admin must be rejected."""
    with pytest.raises(ValidationError):
        UserCreate(**{**_VALID_REGISTER_BASE, "role": "admin"})


def test_user_create_rejects_super_admin_explicit():
    """Explicit regression: UserCreate with role=super_admin must be rejected."""
    with pytest.raises(ValidationError):
        UserCreate(**{**_VALID_REGISTER_BASE, "role": "super_admin"})


def test_user_create_rejects_buildings_manager_explicit():
    """Explicit regression: UserCreate with role=buildings_manager must be rejected."""
    with pytest.raises(ValidationError):
        UserCreate(**{**_VALID_REGISTER_BASE, "role": "buildings_manager"})


# ---------------------------------------------------------------------------
# Validator error message quality
# ---------------------------------------------------------------------------


def test_user_create_rejection_error_mentions_role_name():
    """The validation error message should name the offending role."""
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(**{**_VALID_REGISTER_BASE, "role": "admin"})
    error_str = str(exc_info.value)
    assert "admin" in error_str


def test_user_create_rejection_error_mentions_allowed_roles():
    """The error should hint at what IS allowed."""
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(**{**_VALID_REGISTER_BASE, "role": "super_admin"})
    error_str = str(exc_info.value)
    # Pydantic wraps the ValueError message — check it surfaces the allowed roles
    assert "resident" in error_str or "contractor" in error_str
