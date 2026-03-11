"""Unit tests for enrichment API routes (Phase 2)."""

from fastapi.testclient import TestClient

from src.api.main import app


def test_normalize_address_returns_structured_result():
    """POST /enrichment/normalize-address returns address, city, confidence, source."""
    client = TestClient(app)
    response = client.post(
        "/api/v1/enrichment/normalize-address",
        json={"address": "רחוב הרצל 10", "city": "תל אביב"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "address" in data
    assert "city" in data
    assert "confidence" in data
    assert "source" in data
    assert data["address"] == "רחוב הרצל 10"
    assert data["city"] == "תל אביב"
    assert 0 <= data["confidence"] <= 1


def test_normalize_address_empty_returns_400():
    """POST with empty address or city is rejected."""
    client = TestClient(app)
    response = client.post(
        "/api/v1/enrichment/normalize-address",
        json={"address": "", "city": "תל אביב"},
    )
    assert response.status_code == 422


def test_normalize_address_low_confidence_preserves_input():
    """Stub returns confidence=0; caller should preserve user input."""
    client = TestClient(app)
    response = client.post(
        "/api/v1/enrichment/normalize-address",
        json={"address": "רחוב הרצל 10", "city": "תל אביב"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["confidence"] == 0.0
    assert data["source"] == "stub"
