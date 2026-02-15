"""Tests for the SecurityHeadersMiddleware."""

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from src.api.middleware.security import SecurityHeadersMiddleware


def _homepage(request: Request) -> PlainTextResponse:
    return PlainTextResponse("ok")


def _build_app(environment: str = "production") -> Starlette:
    app = Starlette(routes=[Route("/", _homepage)])
    app.add_middleware(SecurityHeadersMiddleware, environment=environment)
    return app


class TestSecurityHeadersProduction:
    """Headers emitted in production mode."""

    @pytest.fixture()
    def client(self) -> TestClient:
        return TestClient(_build_app("production"))

    def test_hsts_header(self, client: TestClient) -> None:
        resp = client.get("/")
        assert "max-age=31536000" in resp.headers["Strict-Transport-Security"]
        assert "includeSubDomains" in resp.headers["Strict-Transport-Security"]

    def test_csp_header(self, client: TestClient) -> None:
        resp = client.get("/")
        assert "default-src 'self'" in resp.headers["Content-Security-Policy"]

    def test_x_content_type_options(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"

    def test_x_frame_options(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.headers["X-Frame-Options"] == "DENY"

    def test_referrer_policy(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client: TestClient) -> None:
        resp = client.get("/")
        assert "camera=()" in resp.headers["Permissions-Policy"]

    def test_cache_control_default(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.headers["Cache-Control"] == "no-store"


class TestSecurityHeadersDevelopment:
    """In development, HSTS and CSP should NOT be set."""

    @pytest.fixture()
    def client(self) -> TestClient:
        return TestClient(_build_app("development"))

    def test_no_hsts(self, client: TestClient) -> None:
        resp = client.get("/")
        assert "Strict-Transport-Security" not in resp.headers

    def test_no_csp(self, client: TestClient) -> None:
        resp = client.get("/")
        assert "Content-Security-Policy" not in resp.headers

    def test_still_has_x_frame(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.headers["X-Frame-Options"] == "DENY"
