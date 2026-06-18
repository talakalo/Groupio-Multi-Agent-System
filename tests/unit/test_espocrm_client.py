"""Unit tests for ``EspoCRMClient``.

Uses ``httpx.MockTransport`` instead of a real server. The transport
captures every request the client issues so we can pin URL shape, headers,
JSON body, and HTTP method without paying for a network round-trip.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from src.integrations.espocrm.client import EspoCRMClient


def _make_client_with_transport(
    base_url: str,
    api_key: str,
    handler,
):
    """Build an EspoCRMClient that swaps its httpx.AsyncClient for a
    MockTransport-backed one. We patch the constructor of httpx.AsyncClient
    via a context manager indirection."""

    class _PatchedAsyncClient(httpx.AsyncClient):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    return EspoCRMClient(base_url, api_key), _PatchedAsyncClient


@pytest.mark.asyncio
async def test_create_entity_posts_to_correct_url_with_headers(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        captured["headers"] = dict(request.headers)
        captured["body"] = request.content
        return httpx.Response(200, json={"id": "crm-1", "name": "Acme"})

    client, patched = _make_client_with_transport(
        "https://crm.example.com/", "test-api-key-1", handler
    )  # gitleaks:allow
    monkeypatch.setattr("src.integrations.espocrm.client.httpx.AsyncClient", patched)

    result = await client.create_entity("GroupioContractor", {"name": "Acme"})

    assert captured["method"] == "POST"
    assert captured["url"] == "https://crm.example.com/api/v1/GroupioContractor"
    assert captured["headers"]["x-api-key"] == "test-api-key-1"  # gitleaks:allow
    assert captured["headers"]["content-type"] == "application/json"
    assert b'"name": "Acme"' in captured["body"] or b'"name":"Acme"' in captured["body"]
    assert result == {"id": "crm-1", "name": "Acme"}


@pytest.mark.asyncio
async def test_update_entity_uses_patch_and_includes_id_in_url(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        return httpx.Response(200, json={"id": "crm-42", "status": "active"})

    client, patched = _make_client_with_transport(
        "https://crm.example.com", "test-api-key-1", handler
    )  # gitleaks:allow
    monkeypatch.setattr("src.integrations.espocrm.client.httpx.AsyncClient", patched)

    result = await client.update_entity("GroupioContractor", "crm-42", {"status": "active"})

    assert captured["method"] == "PATCH"
    assert captured["url"].endswith("/api/v1/GroupioContractor/crm-42")
    assert result["status"] == "active"


@pytest.mark.asyncio
async def test_create_entity_raises_when_unconfigured() -> None:
    client = EspoCRMClient(base_url="", api_key="")
    with pytest.raises(RuntimeError, match="not configured"):
        await client.create_entity("X", {})


@pytest.mark.asyncio
async def test_update_entity_raises_when_unconfigured() -> None:
    client = EspoCRMClient(base_url="https://x", api_key="")  # missing key
    with pytest.raises(RuntimeError, match="not configured"):
        await client.update_entity("X", "id", {})


@pytest.mark.asyncio
async def test_is_configured_requires_both_base_url_and_api_key() -> None:
    assert EspoCRMClient("", "").is_configured() is False
    assert EspoCRMClient("https://x", "").is_configured() is False
    assert EspoCRMClient("", "k").is_configured() is False
    assert EspoCRMClient("https://x", "k").is_configured() is True


def test_constructor_strips_trailing_slash_and_whitespace() -> None:
    c = EspoCRMClient("https://crm.example.com/////", "  k  ")
    assert c._base == "https://crm.example.com"
    assert c._api_key == "k"


@pytest.mark.asyncio
async def test_4xx_raises_via_raise_for_status(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "Unauthorized"})

    client, patched = _make_client_with_transport("https://crm.example.com", "k", handler)
    monkeypatch.setattr("src.integrations.espocrm.client.httpx.AsyncClient", patched)

    with pytest.raises(httpx.HTTPStatusError):
        await client.create_entity("X", {"a": 1})


@pytest.mark.asyncio
async def test_5xx_raises_via_raise_for_status(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream down")

    client, patched = _make_client_with_transport("https://crm.example.com", "k", handler)
    monkeypatch.setattr("src.integrations.espocrm.client.httpx.AsyncClient", patched)

    with pytest.raises(httpx.HTTPStatusError):
        await client.update_entity("X", "id", {"a": 1})


def test_from_settings_reads_settings(monkeypatch) -> None:
    """``EspoCRMClient.from_settings()`` must build an instance with the
    URL + key plumbed from Settings — no env reads at construction time."""

    class _S:
        ESPOCRM_BASE_URL = "https://crm.example.com"
        ESPOCRM_API_KEY = "key-123"

    monkeypatch.setattr(
        "src.integrations.espocrm.client.get_settings",
        lambda: _S(),
    )
    client = EspoCRMClient.from_settings()
    assert client.is_configured()
    assert client._base == "https://crm.example.com"
    assert client._api_key == "key-123"
