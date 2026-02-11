"""Unit tests for PostgresClient using mocks (asyncpg path)."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from src.databases.postgres import PostgresClient
from src.models.user import UserInDB


@pytest.fixture
def client():
    """PostgresClient instance."""
    return PostgresClient()


@pytest.fixture
def user_row():
    """Minimal user row for _row_to_user."""
    return {
        "id": "user-1",
        "email": "u@example.com",
        "full_name": "User One",
        "phone": "0501234567",
        "role": "resident",
        "preferred_language": "he",
        "is_active": True,
        "is_verified": False,
        "avatar_url": None,
        "building_id": "b1",
        "contractor_id": None,
        "last_login": None,
        "created_at": None,
        "updated_at": None,
    }


@pytest.mark.asyncio
async def test_get_user_by_email_returns_user(client, user_row):
    """get_user_by_email returns UserInDB when row exists."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value=user_row):
        user = await client.get_user_by_email("u@example.com")
        assert user is not None
        assert isinstance(user, UserInDB)
        assert user.email == "u@example.com"
        assert user.id == "user-1"


@pytest.mark.asyncio
async def test_get_user_by_email_returns_none(client):
    """get_user_by_email returns None when no row."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        user = await client.get_user_by_email("missing@example.com")
        assert user is None


@pytest.mark.asyncio
async def test_get_user_by_phone_returns_user(client, user_row):
    """get_user_by_phone returns UserInDB when row exists."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value=user_row):
        user = await client.get_user_by_phone("0501234567")
        assert user is not None
        assert user.phone == "0501234567"


@pytest.mark.asyncio
async def test_get_user_by_phone_returns_none(client):
    """get_user_by_phone returns None when no row."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        user = await client.get_user_by_phone("0500000000")
        assert user is None


@pytest.mark.asyncio
async def test_create_user_returns_user_in_db(client, user_row):
    """create_user inserts and returns UserInDB."""
    user_data = {
        "id": "user-new",
        "email": "new@example.com",
        "hashed_password": "hash",
        "full_name": "New User",
        "phone": "0509876543",
        "role": "resident",
    }
    user_row_copy = {**user_row, "id": "user-new", "email": "new@example.com", "full_name": "New User", "phone": "0509876543"}
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_execute", new_callable=AsyncMock), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value=user_row_copy):
        user = await client.create_user(user_data)
        assert isinstance(user, UserInDB)
        assert user.email == "new@example.com"
        assert user.id == "user-new"


@pytest.mark.asyncio
async def test_is_user_in_building_true_via_users(client):
    """is_user_in_building returns True when users.building_id matches."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value={"1": 1}):
        result = await client.is_user_in_building("user-1", "building-1")
        assert result is True


@pytest.mark.asyncio
async def test_is_user_in_building_true_via_residents(client):
    """is_user_in_building returns True when building_residents has row."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.side_effect = [None, {"1": 1}]
        result = await client.is_user_in_building("user-1", "building-1")
        assert result is True


@pytest.mark.asyncio
async def test_is_user_in_building_false(client):
    """is_user_in_building returns False when neither users nor residents."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await client.is_user_in_building("user-1", "building-1")
        assert result is False


@pytest.mark.asyncio
async def test_create_offer_returns_offer(client):
    """create_offer inserts and returns offer dict."""
    offer_data = {
        "id": "offer-1",
        "title": "AC Install",
        "description": "Group AC installation for the building.",
        "category": "ac_installation",
        "base_price": 5000.0,
        "min_participants": 5,
        "max_participants": 20,
        "building_id": "b1",
        "created_by": "user-1",
        "status": "draft",
    }
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_execute", new_callable=AsyncMock), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value={**offer_data, "current_participants": 0}):
        offer = await client.create_offer(offer_data)
        assert offer is not None
        assert offer["id"] == "offer-1"
        assert offer["title"] == "AC Install"


@pytest.mark.asyncio
async def test_list_offers_returns_items_and_total(client):
    """list_offers returns (items, total)."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 2}), \
         patch.object(client, "_pg_fetch_all", new_callable=AsyncMock, return_value=[
             {"id": "o1", "title": "Offer 1"},
             {"id": "o2", "title": "Offer 2"},
         ]):
        items, total = await client.list_offers({}, page=1, page_size=20)
        assert len(items) == 2
        assert total == 2


@pytest.mark.asyncio
async def test_create_escalation_returns_escalation(client):
    """create_escalation inserts and returns escalation dict."""
    esc_data = {
        "id": "esc-1",
        "user_id": "user-1",
        "conversation_id": "conv-1",
        "source_agent": "support",
        "reason": "negative_sentiment",
        "summary": "User frustrated",
        "status": "open",
    }
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_execute", new_callable=AsyncMock), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value={**esc_data}):
        result = await client.create_escalation(esc_data)
        assert result is not None
        assert result["id"] == "esc-1"
        assert result["source_agent"] == "support"


@pytest.mark.asyncio
async def test_list_escalations_returns_items_and_total(client):
    """list_escalations returns (items, total)."""
    with patch.object(client, "_use_supabase_client", return_value=False), \
         patch.object(client, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}), \
         patch.object(client, "_pg_fetch_all", new_callable=AsyncMock, return_value=[
             {"id": "esc-1", "status": "open", "summary": "Test"},
         ]):
        items, total = await client.list_escalations({"status": "open"}, page=1, page_size=20)
        assert len(items) == 1
        assert total == 1
