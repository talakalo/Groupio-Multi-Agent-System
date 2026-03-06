"""Tests for atomic offer join/leave race condition fix (Task 1.4 / Task 2.9)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_join_offer_uses_transaction_asyncpg():
    """join_offer on asyncpg path must use a transaction (not two separate executes)."""
    from src.databases.postgres import PostgresClient

    db = PostgresClient()
    db._use_supabase = False

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock(return_value="UPDATE 1")
    mock_txn = AsyncMock()
    mock_txn.__aenter__ = AsyncMock(return_value=None)
    mock_txn.__aexit__ = AsyncMock(return_value=False)
    mock_conn.transaction = MagicMock(return_value=mock_txn)

    mock_acquire = MagicMock()
    mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_acquire.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_acquire)

    with patch.object(db, "_get_client", AsyncMock(return_value=mock_pool)):
        await db.join_offer(user_id="u1", offer_id="o1", unit_count=1)

    # Transaction must have been entered
    mock_txn.__aenter__.assert_called_once()
    # Two execute calls: INSERT + UPDATE
    assert mock_conn.execute.call_count == 2


@pytest.mark.asyncio
async def test_join_offer_rolls_back_when_offer_not_joinable():
    """If UPDATE returns UPDATE 0, ValueError must be raised (transaction rolls back)."""
    from src.databases.postgres import PostgresClient

    db = PostgresClient()
    db._use_supabase = False

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock(side_effect=["INSERT", "UPDATE 0"])
    mock_txn = AsyncMock()
    mock_txn.__aenter__ = AsyncMock(return_value=None)
    mock_txn.__aexit__ = AsyncMock(return_value=False)
    mock_conn.transaction = MagicMock(return_value=mock_txn)

    mock_acquire = MagicMock()
    mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_acquire.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_acquire)

    with patch.object(db, "_get_client", AsyncMock(return_value=mock_pool)):
        with pytest.raises(ValueError, match="not joinable"):
            await db.join_offer(user_id="u1", offer_id="o1", unit_count=1)


@pytest.mark.asyncio
async def test_leave_offer_uses_for_update_lock():
    """leave_offer asyncpg path must fetch with FOR UPDATE before deleting."""
    from src.databases.postgres import PostgresClient

    db = PostgresClient()
    db._use_supabase = False

    mock_row = {"unit_count": 2}
    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=mock_row)
    mock_conn.execute = AsyncMock(return_value="UPDATE 1")
    mock_txn = AsyncMock()
    mock_txn.__aenter__ = AsyncMock(return_value=None)
    mock_txn.__aexit__ = AsyncMock(return_value=False)
    mock_conn.transaction = MagicMock(return_value=mock_txn)

    mock_acquire = MagicMock()
    mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_acquire.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_acquire)

    with patch.object(db, "_get_client", AsyncMock(return_value=mock_pool)):
        await db.leave_offer(user_id="u1", offer_id="o1")

    # fetchrow must use FOR UPDATE
    fetchrow_sql: str = mock_conn.fetchrow.call_args[0][0]
    assert "FOR UPDATE" in fetchrow_sql
    # Two execute calls: DELETE + UPDATE
    assert mock_conn.execute.call_count == 2
