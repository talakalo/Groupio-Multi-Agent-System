"""Unit tests for postgres helper functions and PostgresClient."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from src.databases.postgres import PostgresClient, _compute_avg_resolution_hours, _row_to_user

# ---------------------------------------------------------------------------
# _compute_avg_resolution_hours
# ---------------------------------------------------------------------------


def test_compute_avg_resolution_hours_empty():
    assert _compute_avg_resolution_hours([]) == 0.0


def test_compute_avg_resolution_hours_normal():
    now = datetime.now(UTC)
    rows = [
        {"created_at": now, "resolved_at": now + timedelta(hours=2)},
        {"created_at": now, "resolved_at": now + timedelta(hours=4)},
    ]
    result = _compute_avg_resolution_hours(rows)
    assert result == pytest.approx(3.0)


def test_compute_avg_resolution_hours_missing_fields():
    rows = [
        {"created_at": None, "resolved_at": None},
        {"created_at": datetime.now(UTC), "resolved_at": None},
    ]
    assert _compute_avg_resolution_hours(rows) == 0.0


def test_compute_avg_resolution_hours_exception_in_row():
    """Rows that raise an exception during subtraction are skipped."""
    rows = [
        {"created_at": "not-a-datetime", "resolved_at": "also-not"},
    ]
    # Should not raise; exception is caught
    result = _compute_avg_resolution_hours(rows)
    assert result == 0.0


def test_compute_avg_resolution_hours_partial():
    now = datetime.now(UTC)
    rows = [
        {"created_at": now, "resolved_at": now + timedelta(hours=3)},
        {"created_at": None, "resolved_at": None},
    ]
    result = _compute_avg_resolution_hours(rows)
    assert result == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# _row_to_user
# ---------------------------------------------------------------------------


def test_row_to_user_full():
    now = datetime.now(UTC)
    row = {
        "id": "u1",
        "email": "u@test.com",
        "full_name": "Alice",
        "phone": "0501111111",
        "role": "resident",
        "preferred_language": "he",
        "is_active": True,
        "is_verified": True,
        "avatar_url": "http://img.example.com/a.jpg",
        "building_id": "b1",
        "contractor_id": None,
        "last_login": now,
        "created_at": now,
        "updated_at": now,
    }
    result = _row_to_user(row)
    assert result["id"] == "u1"
    assert result["email"] == "u@test.com"
    assert result["preferred_language"] == "he"
    assert result["avatar_url"] == "http://img.example.com/a.jpg"


def test_row_to_user_defaults():
    """Optional fields default correctly when absent from row."""
    row = {
        "id": "u2",
        "email": "b@test.com",
        "full_name": "Bob",
        "phone": "0502222222",
        "role": "contractor",
    }
    result = _row_to_user(row)
    assert result["preferred_language"] == "he"  # default
    assert result["is_active"] is True  # default
    assert result["is_verified"] is False  # default
    assert result["avatar_url"] is None


def test_row_to_user_null_preferred_language():
    """None preferred_language falls back to 'he'."""
    row = {
        "id": "u3",
        "email": "c@test.com",
        "full_name": "Carol",
        "phone": "0503333333",
        "role": "resident",
        "preferred_language": None,
    }
    result = _row_to_user(row)
    assert result["preferred_language"] == "he"


def test_row_to_user_null_created_at():
    """None created_at gets replaced with datetime.now."""
    row = {
        "id": "u4",
        "email": "d@test.com",
        "full_name": "Dave",
        "phone": "0504444444",
        "role": "admin",
        "created_at": None,
        "updated_at": None,
    }
    result = _row_to_user(row)
    assert isinstance(result["created_at"], datetime)
    assert isinstance(result["updated_at"], datetime)


# ---------------------------------------------------------------------------
# PostgresClient._use_supabase_client
# ---------------------------------------------------------------------------


def test_use_supabase_client_with_supabase_settings():
    """Returns True when SUPABASE_URL and SUPABASE_KEY are set."""
    client = PostgresClient()
    mock_settings = _mock_settings(supabase_url="https://xyz.supabase.co", supabase_key="key123")
    with patch("src.databases.postgres.get_settings", return_value=mock_settings):
        result = client._use_supabase_client()
    assert result is True


def test_use_supabase_client_force_local():
    """Returns False when USE_LOCAL_POSTGRES='1' even if Supabase is configured."""
    client = PostgresClient()
    mock_settings = _mock_settings(
        supabase_url="https://xyz.supabase.co", supabase_key="key", force_local="1"
    )
    with patch("src.databases.postgres.get_settings", return_value=mock_settings):
        result = client._use_supabase_client()
    assert result is False


def test_use_supabase_client_no_supabase():
    """Returns False when Supabase URL/key not set."""
    client = PostgresClient()
    mock_settings = _mock_settings(supabase_url="", supabase_key="")
    with patch("src.databases.postgres.get_settings", return_value=mock_settings):
        result = client._use_supabase_client()
    assert result is False


def test_use_supabase_client_cached():
    """Second call returns cached value without re-checking settings."""
    client = PostgresClient()
    client._use_supabase = True
    result = client._use_supabase_client()
    assert result is True


# ---------------------------------------------------------------------------
# PostgresClient._build_safe_update
# ---------------------------------------------------------------------------


def test_build_safe_update_basic():
    query, args = PostgresClient._build_safe_update(
        "users", {"full_name": "Alice", "phone": "0501234567"}, "id", "u1"
    )
    assert "UPDATE users" in query
    assert '"full_name"' in query
    assert '"phone"' in query
    assert args[-1] == "u1"


def test_build_safe_update_unsafe_column_raises():
    with pytest.raises(ValueError, match="Unsafe column name"):
        PostgresClient._build_safe_update(
            "users", {"evil; DROP TABLE users": "x"}, "id", "u1"
        )


# ---------------------------------------------------------------------------
# PostgresClient.close
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close_with_pool():
    client = PostgresClient()
    mock_pool = AsyncMock()
    client._asyncpg_pool = mock_pool
    await client.close()
    mock_pool.close.assert_awaited_once()
    assert client._asyncpg_pool is None


@pytest.mark.asyncio
async def test_close_no_pool():
    client = PostgresClient()
    # Should not raise
    await client.close()


# ---------------------------------------------------------------------------
# PostgresClient methods (asyncpg path)
# ---------------------------------------------------------------------------


@pytest.fixture
def pg_client():
    """PostgresClient using asyncpg path (mocked)."""
    client = PostgresClient()
    client._use_supabase = False
    return client


def _user_row():
    now = datetime.now(UTC)
    return {
        "id": "u1",
        "email": "u@test.com",
        "full_name": "Test",
        "phone": "0501234567",
        "role": "resident",
        "preferred_language": "he",
        "is_active": True,
        "is_verified": True,
        "avatar_url": None,
        "building_id": "b1",
        "contractor_id": None,
        "last_login": None,
        "created_at": now,
        "updated_at": now,
    }


def _mock_settings(supabase_url="", supabase_key="", force_local=""):
    from unittest.mock import MagicMock

    s = MagicMock()
    s.SUPABASE_URL = supabase_url
    s.SUPABASE_KEY = supabase_key
    s.USE_LOCAL_POSTGRES = force_local
    return s


@pytest.mark.asyncio
async def test_get_user_profile_asyncpg(pg_client):
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value={"id": "u1"}):
        result = await pg_client.get_user_profile("u1")
    assert result == {"id": "u1"}


@pytest.mark.asyncio
async def test_get_user_profile_not_found(pg_client):
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg_client.get_user_profile("missing")
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_phone(pg_client):
    row = _user_row()
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        user = await pg_client.get_user_by_phone("0501234567")
    assert user is not None
    assert user.phone == "0501234567"


@pytest.mark.asyncio
async def test_get_user_by_phone_not_found(pg_client):
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        user = await pg_client.get_user_by_phone("0509999999")
    assert user is None


@pytest.mark.asyncio
async def test_get_user_asyncpg(pg_client):
    row = _user_row()
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        user = await pg_client.get_user("u1")
    assert user is not None
    assert user.id == "u1"


@pytest.mark.asyncio
async def test_get_user_not_found(pg_client):
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        user = await pg_client.get_user("missing")
    assert user is None


@pytest.mark.asyncio
async def test_get_user_password_hash(pg_client):
    with patch.object(
        pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value={"hashed_password": "h123"}
    ):
        result = await pg_client.get_user_password_hash("u1")
    assert result == "h123"


@pytest.mark.asyncio
async def test_get_user_password_hash_not_found(pg_client):
    with patch.object(pg_client, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg_client.get_user_password_hash("missing")
    assert result is None


@pytest.mark.asyncio
async def test_execute_query_no_params(pg_client):
    with patch.object(pg_client, "_pg_fetch_all", new_callable=AsyncMock, return_value=[{"row": 1}]):
        result = await pg_client.execute_query("SELECT 1")
    assert result == [{"row": 1}]


@pytest.mark.asyncio
async def test_execute_query_with_params(pg_client):
    with patch.object(pg_client, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]):
        result = await pg_client.execute_query("SELECT * FROM t WHERE id=$1", {"id": "1"})
    assert result == []
