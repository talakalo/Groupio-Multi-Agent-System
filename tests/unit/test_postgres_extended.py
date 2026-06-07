"""Extended unit tests for PostgresClient methods (asyncpg path)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from src.databases.postgres import PostgresClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _building_row():
    return {
        "id": "b1",
        "name": "Tower A",
        "address": "1 Main St",
        "city": "Tel Aviv",
        "region": "center",
        "total_units": 20,
        "floors": 5,
        "year_built": 2000,
        "admin_user_id": "u1",
        "resident_count": 10,
        "active_offers": 2,
        "completed_offers": 5,
        "total_savings": 1000,
        "whatsapp_group_id": None,
    }


def _offer_row():
    return {
        "id": "o1",
        "title": "Solar Panels",
        "description": "Group buy",
        "category": "energy",
        "base_price": 5000,
        "min_participants": 5,
        "max_participants": 50,
        "deadline": None,
        "building_id": "b1",
        "created_by": "u1",
        "status": "active",
        "current_participants": 3,
        "matched_contractor_id": None,
        "pricing_tiers": [],
    }


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def pg():
    client = PostgresClient()
    client._use_supabase = False
    return client


# ---------------------------------------------------------------------------
# update_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_user_with_valid_data(pg):
    """update_user with valid update_data returns UserInDB."""
    row = _user_row()
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock),
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_user("u1", {"full_name": "New Name"})
        assert result.id == "u1"
        assert result.email == "u@test.com"


@pytest.mark.asyncio
async def test_update_user_empty_data_falls_back_to_get_user(pg):
    """update_user with empty update_data calls get_user and returns the user."""
    row = _user_row()
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.update_user("u1", {})
        assert result.id == "u1"


@pytest.mark.asyncio
async def test_update_user_empty_data_raises_when_not_found(pg):
    """update_user with empty data raises ValueError when user not found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        with pytest.raises(ValueError, match="not found"):
            await pg.update_user("u1", {})


@pytest.mark.asyncio
async def test_update_user_filtered_keys_only(pg):
    """update_user only processes allowed fields; unrecognised keys are silently dropped."""
    row = _user_row()
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_user("u1", {"full_name": "Test", "hacked_field": "bad"})
        # _pg_execute must have been called (filtered to full_name)
        mock_exec.assert_called_once()
        assert result.id == "u1"


# ---------------------------------------------------------------------------
# update_user_password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_user_password_calls_pg_execute(pg):
    """update_user_password calls _pg_execute once."""
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        await pg.update_user_password("u1", "hashed_pw")
        mock_exec.assert_called_once()
        call_args = mock_exec.call_args[0]
        assert "hashed_password" in call_args[0]
        assert "hashed_pw" in call_args
        assert "u1" in call_args


# ---------------------------------------------------------------------------
# get_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_building_returns_dict(pg):
    """get_building returns dict when row found."""
    row = _building_row()
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.get_building("b1")
        assert result is not None
        assert result["id"] == "b1"
        assert result["name"] == "Tower A"


@pytest.mark.asyncio
async def test_get_building_returns_none(pg):
    """get_building returns None when no row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_building("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# get_building_by_phone
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_building_by_phone_returns_building_id(pg):
    """get_building_by_phone returns building_id string when row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"building_id": "b1"}):
        result = await pg.get_building_by_phone("0501234567")
        assert result == "b1"


@pytest.mark.asyncio
async def test_get_building_by_phone_returns_none_when_no_row(pg):
    """get_building_by_phone returns None when no row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_building_by_phone("0000000000")
        assert result is None


@pytest.mark.asyncio
async def test_get_building_by_phone_returns_none_when_building_id_null(pg):
    """get_building_by_phone returns None when building_id is None in row."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"building_id": None}):
        result = await pg.get_building_by_phone("0501234567")
        assert result is None


# ---------------------------------------------------------------------------
# is_user_in_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_is_user_in_building_true_from_users_table(pg):
    """is_user_in_building returns True when user found in users table."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"1": 1}):
        result = await pg.is_user_in_building("u1", "b1")
        assert result is True


@pytest.mark.asyncio
async def test_is_user_in_building_true_from_residents_table(pg):
    """is_user_in_building returns True when user found in building_residents."""
    # First call (users table) returns None, second call (building_residents) returns a row
    with patch.object(
        pg,
        "_pg_fetch_one",
        new_callable=AsyncMock,
        side_effect=[None, {"1": 1}],
    ):
        result = await pg.is_user_in_building("u1", "b1")
        assert result is True


@pytest.mark.asyncio
async def test_is_user_in_building_false_when_not_found(pg):
    """is_user_in_building returns False when user not found in either table."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.is_user_in_building("u99", "b1")
        assert result is False


# ---------------------------------------------------------------------------
# create_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_building_calls_pg_execute_and_returns_building(pg):
    """create_building calls _pg_execute then returns the building row."""
    row = _building_row()
    building_data = {
        "id": "b1",
        "name": "Tower A",
        "address": "1 Main St",
        "city": "Tel Aviv",
        "region": "center",
        "admin_user_id": "u1",
    }
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.create_building(building_data)
        mock_exec.assert_called_once()
        assert result["id"] == "b1"


@pytest.mark.asyncio
async def test_create_building_falls_back_to_data_when_get_returns_none(pg):
    """create_building returns building_data when get_building returns None."""
    building_data = {
        "id": "b1",
        "name": "Tower A",
        "address": "1 Main St",
        "city": "Tel Aviv",
        "region": "center",
        "admin_user_id": "u1",
    }
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock),
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None),
    ):
        result = await pg.create_building(building_data)
        assert result["id"] == "b1"


# ---------------------------------------------------------------------------
# list_buildings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_buildings_no_filters(pg):
    """list_buildings with no filters returns (rows, total)."""
    rows = [_building_row()]
    with (
        patch.object(
            pg,
            "_pg_fetch_one",
            new_callable=AsyncMock,
            return_value={"c": 1},
        ),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows),
    ):
        result, total = await pg.list_buildings({})
        assert total == 1
        assert len(result) == 1
        assert result[0]["id"] == "b1"


@pytest.mark.asyncio
async def test_list_buildings_with_city_filter(pg):
    """list_buildings with city filter passes filter to query."""
    rows = [_building_row()]
    with (
        patch.object(
            pg,
            "_pg_fetch_one",
            new_callable=AsyncMock,
            return_value={"c": 1},
        ),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows),
    ):
        result, total = await pg.list_buildings({"city": "Tel Aviv"})
        assert total == 1
        assert result[0]["city"] == "Tel Aviv"


@pytest.mark.asyncio
async def test_list_buildings_empty_result(pg):
    """list_buildings returns ([], 0) when no buildings found."""
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 0}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]),
    ):
        result, total = await pg.list_buildings({})
        assert total == 0
        assert result == []


# ---------------------------------------------------------------------------
# update_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_building_with_valid_data(pg):
    """update_building with valid data calls _pg_execute and returns updated building."""
    row = _building_row()
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_building("b1", {"name": "Tower B"})
        mock_exec.assert_called_once()
        assert result["id"] == "b1"


@pytest.mark.asyncio
async def test_update_building_empty_data_returns_existing(pg):
    """update_building with empty data skips execute and returns existing building."""
    row = _building_row()
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_building("b1", {})
        mock_exec.assert_not_called()
        assert result["id"] == "b1"


@pytest.mark.asyncio
async def test_update_building_empty_data_returns_empty_dict_when_not_found(pg):
    """update_building with empty data returns {} when building not found."""
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock),
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None),
    ):
        result = await pg.update_building("b99", {})
        assert result == {}


# ---------------------------------------------------------------------------
# delete_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_building_calls_pg_execute_twice(pg):
    """delete_building calls _pg_execute twice (residents then buildings)."""
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        await pg.delete_building("b1")
        assert mock_exec.call_count == 2


# ---------------------------------------------------------------------------
# add_resident_to_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_resident_to_building_returns_dict(pg):
    """add_resident_to_building calls _pg_execute and returns dict with expected keys."""
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        result = await pg.add_resident_to_building("u1", "b1", "4A", 4, is_owner=True)
        mock_exec.assert_called_once()
        assert result["user_id"] == "u1"
        assert result["building_id"] == "b1"
        assert result["unit_number"] == "4A"
        assert result["floor"] == 4
        assert result["is_owner"] is True
        assert "id" in result


# ---------------------------------------------------------------------------
# remove_resident_from_building
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_resident_from_building_calls_pg_execute(pg):
    """remove_resident_from_building calls _pg_execute once."""
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        await pg.remove_resident_from_building("u1", "b1")
        mock_exec.assert_called_once()


# ---------------------------------------------------------------------------
# get_building_residents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_building_residents_returns_list_and_total(pg):
    """get_building_residents returns (list, total)."""
    resident_rows = [
        {"id": "r1", "user_id": "u1", "building_id": "b1", "full_name": "Test", "email": "u@test.com", "phone": "05"}
    ]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=resident_rows),
    ):
        result, total = await pg.get_building_residents("b1")
        assert total == 1
        assert len(result) == 1
        assert result[0]["user_id"] == "u1"


@pytest.mark.asyncio
async def test_get_building_residents_empty(pg):
    """get_building_residents returns ([], 0) when none found."""
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 0}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]),
    ):
        result, total = await pg.get_building_residents("b99")
        assert result == []
        assert total == 0


# ---------------------------------------------------------------------------
# is_unit_taken
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_is_unit_taken_returns_true(pg):
    """is_unit_taken returns True when row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"1": 1}):
        result = await pg.is_unit_taken("b1", "4A")
        assert result is True


@pytest.mark.asyncio
async def test_is_unit_taken_returns_false(pg):
    """is_unit_taken returns False when no row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.is_unit_taken("b1", "99Z")
        assert result is False


# ---------------------------------------------------------------------------
# count_active_offers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_count_active_offers_returns_int(pg):
    """count_active_offers returns the count integer."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 7}):
        result = await pg.count_active_offers("b1")
        assert result == 7


@pytest.mark.asyncio
async def test_count_active_offers_returns_zero_when_no_row(pg):
    """count_active_offers returns 0 when row is None."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.count_active_offers("b1")
        assert result == 0


# ---------------------------------------------------------------------------
# get_active_offers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_active_offers_returns_list(pg):
    """get_active_offers returns list of offer dicts."""
    rows = [_offer_row()]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.get_active_offers("b1")
        assert len(result) == 1
        assert result[0]["id"] == "o1"


@pytest.mark.asyncio
async def test_get_active_offers_returns_empty_list(pg):
    """get_active_offers returns [] when no rows."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=None):
        result = await pg.get_active_offers("b1")
        assert result == []


# ---------------------------------------------------------------------------
# create_offer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_offer_calls_pg_execute_and_returns_offer(pg):
    """create_offer calls _pg_execute then returns offer row."""
    row = _offer_row()
    offer_data = {
        "id": "o1",
        "title": "Solar Panels",
        "description": "Group buy",
        "category": "energy",
        "base_price": 5000,
        "building_id": "b1",
        "created_by": "u1",
    }
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.create_offer(offer_data)
        mock_exec.assert_called_once()
        assert result["id"] == "o1"


@pytest.mark.asyncio
async def test_create_offer_falls_back_to_offer_data_when_get_returns_none(pg):
    """create_offer returns offer_data when get_offer returns None."""
    offer_data = {
        "id": "o1",
        "title": "Solar Panels",
        "description": "Group buy",
        "category": "energy",
        "base_price": 5000,
        "building_id": "b1",
        "created_by": "u1",
    }
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock),
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None),
    ):
        result = await pg.create_offer(offer_data)
        assert result["id"] == "o1"


# ---------------------------------------------------------------------------
# get_offer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_offer_returns_dict(pg):
    """get_offer returns dict when row found."""
    row = _offer_row()
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.get_offer("o1")
        assert result is not None
        assert result["id"] == "o1"


@pytest.mark.asyncio
async def test_get_offer_returns_none(pg):
    """get_offer returns None when no row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_offer("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# update_offer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_offer_calls_pg_execute_and_returns_offer(pg):
    """update_offer calls _pg_execute then returns updated offer."""
    row = _offer_row()
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_offer("o1", {"status": "active"})
        mock_exec.assert_called_once()
        assert result["id"] == "o1"


@pytest.mark.asyncio
async def test_update_offer_empty_data_returns_current_offer(pg):
    """update_offer with empty update_data returns current offer without executing."""
    row = _offer_row()
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_offer("o1", {})
        mock_exec.assert_not_called()
        assert result["id"] == "o1"


# ---------------------------------------------------------------------------
# has_user_joined_offer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_has_user_joined_offer_true(pg):
    """has_user_joined_offer returns True when row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"1": 1}):
        result = await pg.has_user_joined_offer("u1", "o1")
        assert result is True


@pytest.mark.asyncio
async def test_has_user_joined_offer_false(pg):
    """has_user_joined_offer returns False when no row found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.has_user_joined_offer("u1", "o1")
        assert result is False


# ---------------------------------------------------------------------------
# leave_offer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_leave_offer_executes_transaction(pg):
    """leave_offer uses pool/conn transaction path on asyncpg."""
    from unittest.mock import MagicMock

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value={"unit_count": 1})
    mock_conn.execute = AsyncMock()

    # conn.transaction() is a sync call returning an async context manager
    mock_transaction = MagicMock()
    mock_transaction.__aenter__ = AsyncMock(return_value=mock_transaction)
    mock_transaction.__aexit__ = AsyncMock(return_value=False)
    mock_conn.transaction = MagicMock(return_value=mock_transaction)

    # pool.acquire() is a sync call returning an async context manager
    mock_pool_ctx = MagicMock()
    mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_pool_ctx)

    with patch.object(pg, "_get_client", new_callable=AsyncMock, return_value=mock_pool):
        await pg.leave_offer("u1", "o1")
        mock_conn.fetchrow.assert_called_once()
        assert mock_conn.execute.call_count == 2


# ---------------------------------------------------------------------------
# get_offer_participants
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_offer_participants_returns_list(pg):
    """get_offer_participants returns list of participant dicts."""
    rows = [{"id": "p1", "offer_id": "o1", "user_id": "u1", "full_name": "Test", "email": "u@test.com"}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.get_offer_participants("o1")
        assert len(result) == 1
        assert result[0]["user_id"] == "u1"


@pytest.mark.asyncio
async def test_get_offer_participants_returns_empty_list(pg):
    """get_offer_participants returns [] when no rows."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=None):
        result = await pg.get_offer_participants("o1")
        assert result == []


# ---------------------------------------------------------------------------
# get_user_orders
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_orders_returns_normalized_rows_on_asyncpg(pg):
    """get_user_orders normalizes asyncpg rows for support flow consumption."""
    rows = [
        {
            "id": "ord-1",
            "order_id": "ord-1",
            "participation_id": None,
            "payment_id": "pay-1",
            "offer_id": "off-1",
            "contractor_id": "con-1",
            "category": "ac_installation",
            "status": "paid",
            "amount": 4200,
            "currency": "ILS",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "scheduled_at": None,
            "completed_at": None,
            "contractor_name": "Cool Air Ltd",
            "building_address": "1 Main St",
            "offer_title": "AC Group Buy",
            "source": "user_orders",
            "contractors": '{"business_name":"Cool Air Ltd"}',
            "buildings": {"address": "1 Main St"},
        }
    ]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows) as mock_fetch:
        result = await pg.get_user_orders("u1", limit=3)

    mock_fetch.assert_called_once()
    assert len(result) == 1
    assert result[0]["id"] == "ord-1"
    assert result[0]["status"] == "paid"
    assert result[0]["amount"] == 4200.0
    assert result[0]["contractors"]["business_name"] == "Cool Air Ltd"
    assert result[0]["buildings"]["address"] == "1 Main St"


@pytest.mark.asyncio
async def test_get_user_orders_returns_empty_list_when_no_rows(pg):
    """get_user_orders returns [] when asyncpg query has no matches."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]):
        result = await pg.get_user_orders("u1")
    assert result == []


# ---------------------------------------------------------------------------
# create_support_ticket
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_support_ticket_persists_and_normalizes_asyncpg_row(pg):
    """create_support_ticket inserts into support_tickets and returns normalized data."""
    now = datetime.now(UTC)
    ticket_data = {
        "id": "t1",
        "user_id": "u1",
        "conversation_id": "conv-1",
        "reason": "Need human follow-up",
        "priority": "high",
        "context": {"intent": "complaint"},
        "status": "open",
    }
    inserted = {
        "id": "t1",
        "user_id": "u1",
        "conversation_id": "conv-1",
        "reason": "Need human follow-up",
        "priority": "high",
        "context": '{"intent":"complaint","category":"complaint","message":"Need human follow-up","description":"Need human follow-up"}',
        "status": "open",
        "assigned_to": None,
        "resolved_at": None,
        "created_at": now,
        "updated_at": now,
    }
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=inserted) as mock_fetch:
        result = await pg.create_support_ticket(ticket_data)

    mock_fetch.assert_called_once()
    assert "INSERT INTO support_tickets" in mock_fetch.call_args[0][0]
    assert result["id"] == "t1"
    assert result["category"] == "complaint"
    assert result["message"] == "Need human follow-up"
    assert result["description"] == "Need human follow-up"
    assert result["context"]["intent"] == "complaint"


@pytest.mark.asyncio
async def test_create_support_ticket_requires_user_id(pg):
    """create_support_ticket rejects payloads without user_id."""
    with pytest.raises(ValueError, match="user_id is required"):
        await pg.create_support_ticket({"reason": "Need help"})


@pytest.mark.asyncio
async def test_create_support_ticket_requires_reason(pg):
    """create_support_ticket rejects payloads without a reason/message."""
    with pytest.raises(ValueError, match="reason is required"):
        await pg.create_support_ticket({"user_id": "u1"})


# ---------------------------------------------------------------------------
# get_market_data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_market_data_returns_metrics_and_recent_comparables(pg):
    """get_market_data returns explicit metrics plus recent comparable offers."""
    metrics = {
        "sample_size": 6,
        "sample_count": 6,
        "avg_price": 4500,
        "median_price": 4300,
        "min_price": 3200,
        "max_price": 6100,
        "price_stddev": 700,
        "avg_participants": 8,
    }
    recent = [
        {
            "id": "off-1",
            "title": "AC deal",
            "category": "ac_installation",
            "region": "center",
            "building_id": "b1",
            "price": 4700,
            "participants": 9,
            "status": "completed",
            "created_at": datetime.now(UTC),
        }
    ]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=metrics),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=recent),
    ):
        result = await pg.get_market_data("ac_installation", "center")

    assert result["category"] == "ac_installation"
    assert result["region"] == "center"
    assert result["sample_size"] == 6
    assert result["avg_price"] == 4500.0
    assert result["confidence"] == "medium"
    assert result["no_data"] is False
    assert result["recent_comparable_offers"][0]["price"] == 4700.0


@pytest.mark.asyncio
async def test_get_market_data_returns_explicit_no_data_shape(pg):
    """get_market_data returns an explicit no-data response instead of fake zeros."""
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"sample_size": 0}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]),
    ):
        result = await pg.get_market_data("ac_installation", "north")

    assert result["sample_size"] == 0
    assert result["avg_price"] is None
    assert result["data_quality"] == "no_data"
    assert result["no_data"] is True


# ---------------------------------------------------------------------------
# log_conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_conversation_calls_pg_execute(pg):
    """log_conversation calls _pg_execute once on asyncpg path."""
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        await pg.log_conversation(
            "u1",
            "Hello",
            {"text": "Hi there"},
            {"agent": "router"},
        )
        mock_exec.assert_called_once()
        call_args = mock_exec.call_args[0]
        assert "conversation_logs" in call_args[0]


# ---------------------------------------------------------------------------
# get_contractor_documents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_contractor_documents_returns_normalized_rows(pg):
    """get_contractor_documents maps asyncpg rows into vetting-friendly document objects."""
    rows = [
        {
            "id": "doc-1",
            "contractor_id": "con-1",
            "doc_type": "license",
            "file_url": "https://files.example/doc-1.pdf",
            "extracted_text": "License text",
            "verified": True,
            "verified_by": "admin-1",
            "verified_at": datetime.now(UTC),
            "uploaded_at": datetime.now(UTC),
            "created_at": datetime.now(UTC),
            "metadata": '{"verified": true, "verified_by": "admin-1"}',
        }
    ]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.get_contractor_documents("con-1")

    assert len(result) == 1
    assert result[0]["document_type"] == "license"
    assert result[0]["status"] == "verified"
    assert result[0]["verification_result"] == "verified"
    assert result[0]["file_reference"] == "https://files.example/doc-1.pdf"
    assert result[0]["metadata"]["verified_by"] == "admin-1"


@pytest.mark.asyncio
async def test_get_contractor_documents_returns_empty_list(pg):
    """get_contractor_documents returns [] when no documents exist."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]):
        result = await pg.get_contractor_documents("missing")
    assert result == []


# ---------------------------------------------------------------------------
# get_conversation_history
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_conversation_history_returns_rows_and_total(pg):
    """get_conversation_history returns (rows, total)."""
    rows = [{"id": "c1", "user_id": "u1", "message": "Hello", "response": {}}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows),
    ):
        result, total = await pg.get_conversation_history("u1")
        assert total == 1
        assert len(result) == 1
        assert result[0]["user_id"] == "u1"


@pytest.mark.asyncio
async def test_get_conversation_history_empty(pg):
    """get_conversation_history returns ([], 0) when no rows."""
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 0}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]),
    ):
        result, total = await pg.get_conversation_history("u1")
        assert result == []
        assert total == 0


@pytest.mark.asyncio
async def test_get_conversation_history_with_before_param(pg):
    """get_conversation_history with before param passes it to queries."""
    rows = [{"id": "c1", "user_id": "u1", "message": "Hi", "response": {}}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows),
    ):
        result, total = await pg.get_conversation_history("u1", before="2026-01-01T00:00:00Z")
        assert total == 1
        assert len(result) == 1


# ---------------------------------------------------------------------------
# get_contractor
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_contractor_returns_dict(pg):
    """get_contractor returns dict when row found."""
    row = {"id": "c1", "business_name": "BestCo", "trust_score": 90}
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.get_contractor("c1")
        assert result is not None
        assert result["id"] == "c1"


@pytest.mark.asyncio
async def test_get_contractor_returns_none(pg):
    """get_contractor returns None when not found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_contractor("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# get_contractors_by_ids
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_contractors_by_ids_returns_list(pg):
    """get_contractors_by_ids returns sorted list."""
    rows = [{"id": "c2", "trust_score": 80}, {"id": "c1", "trust_score": 90}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.get_contractors_by_ids(["c1", "c2"])
        # Should be sorted by original order: c1 first
        assert result[0]["id"] == "c1"
        assert result[1]["id"] == "c2"


@pytest.mark.asyncio
async def test_get_contractors_by_ids_empty_input(pg):
    """get_contractors_by_ids returns [] for empty input without calling DB."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock) as mock_fetch:
        result = await pg.get_contractors_by_ids([])
        assert result == []
        mock_fetch.assert_not_called()


# ---------------------------------------------------------------------------
# get_contractor_reviews
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_contractor_reviews_returns_list_and_total(pg):
    """get_contractor_reviews returns (list, total)."""
    review_rows = [{"id": "r1", "contractor_id": "c1", "rating": 5, "comment": "Great"}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=review_rows),
    ):
        result, total = await pg.get_contractor_reviews("c1")
        assert total == 1
        assert len(result) == 1
        assert result[0]["rating"] == 5


@pytest.mark.asyncio
async def test_get_contractor_reviews_empty(pg):
    """get_contractor_reviews returns ([], 0) when no reviews."""
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 0}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=[]),
    ):
        result, total = await pg.get_contractor_reviews("c1")
        assert result == []
        assert total == 0


# ---------------------------------------------------------------------------
# create_review
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_review_calls_pg_execute_and_returns_dict(pg):
    """create_review calls _pg_execute and returns dict with id."""
    review_data = {
        "contractor_id": "c1",
        "user_id": "u1",
        "offer_id": "o1",
        "rating": 5,
        "comment": "Excellent",
    }
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        result = await pg.create_review(review_data)
        mock_exec.assert_called_once()
        assert result["contractor_id"] == "c1"
        assert result["rating"] == 5
        assert "id" in result


# ---------------------------------------------------------------------------
# create_escalation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_escalation_returns_dict(pg):
    """create_escalation calls _pg_execute and returns escalation dict."""
    escalation_data = {
        "id": "e1",
        "user_id": "u1",
        "conversation_id": "conv1",
        "source_agent": "router",
        "reason": "complex_request",
        "summary": "User needs help",
    }
    escalation_row = {**escalation_data, "status": "open", "priority": "medium"}
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=escalation_row),
    ):
        result = await pg.create_escalation(escalation_data)
        mock_exec.assert_called_once()
        assert result["id"] == "e1"


@pytest.mark.asyncio
async def test_create_escalation_falls_back_to_data_when_get_returns_none(pg):
    """create_escalation returns escalation_data when get_escalation returns None."""
    escalation_data = {
        "id": "e1",
        "user_id": "u1",
        "conversation_id": "conv1",
        "source_agent": "router",
        "reason": "complex_request",
        "summary": "User needs help",
    }
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock),
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None),
    ):
        result = await pg.create_escalation(escalation_data)
        assert result["id"] == "e1"


# ---------------------------------------------------------------------------
# list_escalations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_escalations_no_filters_returns_tuple(pg):
    """list_escalations with no filters returns (list, total)."""
    esc_rows = [{"id": "e1", "status": "open", "priority": "high"}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=esc_rows),
    ):
        result, total = await pg.list_escalations({})
        assert total == 1
        assert len(result) == 1
        assert result[0]["id"] == "e1"


@pytest.mark.asyncio
async def test_list_escalations_with_status_filter(pg):
    """list_escalations with status filter works correctly."""
    esc_rows = [{"id": "e1", "status": "open"}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=esc_rows),
    ):
        result, total = await pg.list_escalations({"status": "open"})
        assert total == 1
        assert result[0]["status"] == "open"


@pytest.mark.asyncio
async def test_list_escalations_with_list_status_filter(pg):
    """list_escalations with list-type status filter works correctly."""
    esc_rows = [{"id": "e1", "status": "open"}, {"id": "e2", "status": "in_progress"}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 2}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=esc_rows),
    ):
        result, total = await pg.list_escalations({"status": ["open", "in_progress"]})
        assert total == 2
        assert len(result) == 2


# ---------------------------------------------------------------------------
# get_escalation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_escalation_returns_dict(pg):
    """get_escalation returns dict when row found."""
    row = {"id": "e1", "status": "open", "priority": "high"}
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.get_escalation("e1")
        assert result is not None
        assert result["id"] == "e1"


@pytest.mark.asyncio
async def test_get_escalation_returns_none(pg):
    """get_escalation returns None when not found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_escalation("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# update_escalation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_escalation_returns_dict(pg):
    """update_escalation calls _pg_execute and returns updated dict."""
    row = {"id": "e1", "status": "in_progress", "priority": "high"}
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_escalation("e1", {"status": "in_progress"})
        mock_exec.assert_called_once()
        assert result["id"] == "e1"


@pytest.mark.asyncio
async def test_update_escalation_empty_data_returns_current(pg):
    """update_escalation with empty data returns current escalation."""
    row = {"id": "e1", "status": "open"}
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row),
    ):
        result = await pg.update_escalation("e1", {})
        mock_exec.assert_not_called()
        assert result["id"] == "e1"


# ---------------------------------------------------------------------------
# add_escalation_message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_escalation_message_calls_pg_execute(pg):
    """add_escalation_message calls _pg_execute once."""
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        await pg.add_escalation_message("e1", "m1", "agent", "u1", "Hello customer")
        mock_exec.assert_called_once()
        call_args = mock_exec.call_args[0]
        assert "escalation_messages" in call_args[0]


# ---------------------------------------------------------------------------
# get_escalation_messages
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_escalation_messages_returns_list(pg):
    """get_escalation_messages returns list of message dicts."""
    rows = [{"id": "m1", "escalation_id": "e1", "content": "Hello"}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.get_escalation_messages("e1")
        assert len(result) == 1
        assert result[0]["id"] == "m1"


@pytest.mark.asyncio
async def test_get_escalation_messages_returns_empty_list(pg):
    """get_escalation_messages returns [] when none found."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=None):
        result = await pg.get_escalation_messages("e1")
        assert result == []


# ---------------------------------------------------------------------------
# create_file_upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_file_upload_calls_pg_execute_and_returns_data(pg):
    """create_file_upload calls _pg_execute and returns data dict."""
    data = {
        "id": "f1",
        "user_id": "u1",
        "bucket": "documents",
        "file_name": "invoice.pdf",
        "file_type": "application/pdf",
        "file_size": 1024,
        "storage_path": "docs/invoice.pdf",
    }
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        result = await pg.create_file_upload(data)
        mock_exec.assert_called_once()
        assert result["id"] == "f1"
        assert result["bucket"] == "documents"


# ---------------------------------------------------------------------------
# get_file_upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_file_upload_returns_dict(pg):
    """get_file_upload returns dict when row found."""
    row = {"id": "f1", "user_id": "u1", "bucket": "documents"}
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.get_file_upload("f1")
        assert result is not None
        assert result["id"] == "f1"


@pytest.mark.asyncio
async def test_get_file_upload_returns_none(pg):
    """get_file_upload returns None when not found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_file_upload("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# list_file_uploads
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_file_uploads_returns_list(pg):
    """list_file_uploads returns list of file dicts."""
    rows = [{"id": "f1", "user_id": "u1", "bucket": "documents"}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.list_file_uploads("u1")
        assert len(result) == 1
        assert result[0]["id"] == "f1"


@pytest.mark.asyncio
async def test_list_file_uploads_with_bucket_filter(pg):
    """list_file_uploads with bucket filter passes it to query."""
    rows = [{"id": "f1", "user_id": "u1", "bucket": "images"}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows) as mock_fetch:
        result = await pg.list_file_uploads("u1", bucket="images")
        assert len(result) == 1
        # Verify bucket was included in the SQL call
        call_args = mock_fetch.call_args[0]
        assert "bucket" in call_args[0]


@pytest.mark.asyncio
async def test_list_file_uploads_with_building_filter(pg):
    """list_file_uploads with building_id filter passes it to query."""
    rows = [{"id": "f1", "user_id": "u1", "bucket": "docs", "building_id": "b1"}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows) as mock_fetch:
        result = await pg.list_file_uploads("u1", building_id="b1")
        assert len(result) == 1
        call_args = mock_fetch.call_args[0]
        assert "building_id" in call_args[0]


# ---------------------------------------------------------------------------
# create_audit_log
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_audit_log_calls_pg_execute_and_returns_dict(pg):
    """create_audit_log calls _pg_execute and returns dict with id."""
    data = {
        "id": "al1",
        "user_id": "u1",
        "action": "login",
        "resource_type": "user",
        "resource_id": "u1",
    }
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec:
        result = await pg.create_audit_log(data)
        mock_exec.assert_called_once()
        assert result["id"] == "al1"
        assert result["action"] == "login"


@pytest.mark.asyncio
async def test_create_audit_log_generates_id_when_missing(pg):
    """create_audit_log generates an id when not provided."""
    data = {
        "user_id": "u1",
        "action": "login",
    }
    with patch.object(pg, "_pg_execute", new_callable=AsyncMock):
        result = await pg.create_audit_log(data)
        assert "id" in result
        assert result["id"] is not None


# ---------------------------------------------------------------------------
# list_audit_logs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_audit_logs_no_filters(pg):
    """list_audit_logs with no filters returns (list, total)."""
    rows = [{"id": "al1", "action": "login", "user_id": "u1"}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows),
    ):
        result, total = await pg.list_audit_logs()
        assert total == 1
        assert len(result) == 1
        assert result[0]["action"] == "login"


@pytest.mark.asyncio
async def test_list_audit_logs_with_action_filter(pg):
    """list_audit_logs with action filter passes it to query."""
    rows = [{"id": "al1", "action": "login"}]
    with (
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"c": 1}),
        patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows),
    ):
        result, total = await pg.list_audit_logs(action="login")
        assert total == 1
        assert result[0]["action"] == "login"


# ---------------------------------------------------------------------------
# create_payment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_payment_with_conn_none_calls_pg_execute(pg):
    """create_payment with conn=None calls _pg_execute and returns payment row."""
    data = {
        "id": "pay1",
        "user_id": "u1",
        "amount": 500,
        "currency": "ILS",
    }
    payment_row = {**data, "status": "pending"}
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=payment_row),
    ):
        result = await pg.create_payment(data, conn=None)
        mock_exec.assert_called_once()
        assert result["id"] == "pay1"


@pytest.mark.asyncio
async def test_create_payment_falls_back_to_data_when_get_returns_none(pg):
    """create_payment returns data when get_payment returns None."""
    data = {
        "id": "pay1",
        "user_id": "u1",
        "amount": 500,
    }
    with (
        patch.object(pg, "_pg_execute", new_callable=AsyncMock),
        patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None),
    ):
        result = await pg.create_payment(data, conn=None)
        assert result["id"] == "pay1"


# ---------------------------------------------------------------------------
# get_payment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_payment_returns_dict(pg):
    """get_payment returns dict when row found."""
    row = {"id": "pay1", "user_id": "u1", "amount": 500, "status": "pending"}
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=row):
        result = await pg.get_payment("pay1")
        assert result is not None
        assert result["id"] == "pay1"


@pytest.mark.asyncio
async def test_get_payment_returns_none(pg):
    """get_payment returns None when not found."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value=None):
        result = await pg.get_payment("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# list_payments_for_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_payments_for_user_returns_list(pg):
    """list_payments_for_user returns list of payment dicts."""
    rows = [{"id": "pay1", "user_id": "u1", "amount": 500}]
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=rows):
        result = await pg.list_payments_for_user("u1")
        assert len(result) == 1
        assert result[0]["id"] == "pay1"


@pytest.mark.asyncio
async def test_list_payments_for_user_returns_empty_list(pg):
    """list_payments_for_user returns [] when no payments."""
    with patch.object(pg, "_pg_fetch_all", new_callable=AsyncMock, return_value=None):
        result = await pg.list_payments_for_user("u1")
        assert result == []


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_returns_true_on_success(pg):
    """health_check returns True when _pg_fetch_one succeeds."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, return_value={"id": "u1"}):
        result = await pg.health_check()
        assert result is True


@pytest.mark.asyncio
async def test_health_check_returns_false_on_exception(pg):
    """health_check returns False when _pg_fetch_one raises an exception."""
    with patch.object(pg, "_pg_fetch_one", new_callable=AsyncMock, side_effect=Exception("DB down")):
        result = await pg.health_check()
        assert result is False
