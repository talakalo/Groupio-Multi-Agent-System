"""Integration test environment sentinel.

This file is always collected (even when other integration test files are
skipped due to a missing cryptography backend).  It provides at least one
test result so ``pytest tests/integration/`` exits with code 0 instead of
code 5 ("no tests ran").
"""
import pytest


def test_integration_environment() -> None:
    """Pass when the full crypto stack is available; skip otherwise."""
    try:
        from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurve  # noqa: F401
    except BaseException:
        pytest.skip(
            "cryptography backend unavailable (missing cffi / Rust extension); "
            "integration tests are skipped in this environment"
        )
