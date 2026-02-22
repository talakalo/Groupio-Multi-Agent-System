"""Unit-test-level fixtures.

Patches jwt/bcrypt at the sys.modules level so that route tests which
import src.api.main can run in environments where the system cryptography
library is broken (mismatched Rust/cffi bindings).  In CI (clean Ubuntu)
the real libraries are used; this shim is a no-op there because the import
succeeds before the patch is applied.
"""

import sys
import types
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock


def _maybe_patch_jwt() -> None:
    """Install a minimal jwt stub if the real package is unimportable."""
    try:
        import jwt  # noqa: F401 – succeeds on a healthy environment

        return  # real library available; nothing to do
    except BaseException:
        # Catches both ImportError and pyo3_runtime.PanicException (Rust panic
        # from a broken system cryptography / cffi binding in this environment)
        pass

    mock_jwt = types.ModuleType("jwt")

    def _encode(payload, key, algorithm="HS256"):
        return "mock.jwt.token"

    def _decode(token, key, algorithms=None, options=None):
        return {
            "sub": "user-1",
            "email": "test@example.com",
            "role": "resident",
            "type": "access",
            "exp": (datetime.now(UTC) + timedelta(hours=1)).timestamp(),
            "iat": datetime.now(UTC).timestamp(),
        }

    mock_jwt.encode = _encode
    mock_jwt.decode = _decode
    mock_jwt.ExpiredSignatureError = type("ExpiredSignatureError", (Exception,), {})
    mock_jwt.InvalidTokenError = type("InvalidTokenError", (Exception,), {})
    mock_jwt.PyJWK = MagicMock()
    mock_jwt.PyJWKSet = MagicMock()

    sys.modules["jwt"] = mock_jwt
    sys.modules["jwt.api_jwk"] = MagicMock()
    sys.modules["jwt.algorithms"] = MagicMock()
    sys.modules["jwt.utils"] = MagicMock()


def _maybe_patch_bcrypt() -> None:
    """Install a minimal bcrypt stub if the real package is unimportable."""
    try:
        import bcrypt  # noqa: F401

        return
    except Exception:
        pass

    mock_bcrypt = types.ModuleType("bcrypt")
    mock_bcrypt.gensalt = lambda: b"$2b$12$mocksalt"
    mock_bcrypt.hashpw = lambda pw, salt: b"$2b$12$mockhashedpassword"
    mock_bcrypt.checkpw = lambda pw, hashed: True
    sys.modules["bcrypt"] = mock_bcrypt


# Apply patches immediately at import time (before any src.api.* import)
_maybe_patch_jwt()
_maybe_patch_bcrypt()
