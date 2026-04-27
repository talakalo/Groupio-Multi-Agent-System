"""Unit tests for the new building invite-code surface (B1 + B2).

B1: ``POST /buildings/`` is restricted to admin / super_admin / buildings_manager.
B2: ``buildings.invite_code`` is a stored, rotatable column generated via
    ``generate_invite_code`` and rotated through
    ``PostgresClient.regenerate_building_invite_code``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# generate_invite_code
# ---------------------------------------------------------------------------


def test_generate_invite_code_default_length() -> None:
    from src.databases.postgres import generate_invite_code

    code = generate_invite_code()
    assert len(code) == 8


def test_generate_invite_code_custom_length() -> None:
    from src.databases.postgres import generate_invite_code

    assert len(generate_invite_code(12)) == 12
    assert len(generate_invite_code(6)) == 6


def test_generate_invite_code_uses_unambiguous_alphabet() -> None:
    """Avoid 0/O, 1/I/L — they are too easy to mis-read on a phone screen."""
    from src.databases.postgres import generate_invite_code

    forbidden = set("01ILO")
    for _ in range(100):
        code = generate_invite_code(8)
        assert not (set(code) & forbidden), f"code {code!r} contains an ambiguous char"


def test_generate_invite_code_is_uppercase_alphanumeric() -> None:
    from src.databases.postgres import generate_invite_code

    for _ in range(50):
        code = generate_invite_code(10)
        assert code.isalnum() and code.isupper()


def test_generate_invite_code_has_high_entropy() -> None:
    """Two consecutive calls should virtually never collide. With a 31-char
    alphabet at length 8 the probability of collision is < 1 / 1e11."""
    from src.databases.postgres import generate_invite_code

    samples = {generate_invite_code() for _ in range(200)}
    # 200 unique samples is far below the birthday-paradox collision threshold.
    assert len(samples) == 200


# ---------------------------------------------------------------------------
# PostgresClient.regenerate_building_invite_code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_regenerate_invite_code_supabase_path_updates_row() -> None:
    from src.databases.postgres import PostgresClient

    client = PostgresClient()
    client._use_supabase_client = MagicMock(return_value=True)  # type: ignore[attr-defined]

    chained = MagicMock()
    chained.update.return_value.eq.return_value.execute = AsyncMock()
    fake_supabase = MagicMock()
    fake_supabase.table.return_value = chained
    client._get_client = AsyncMock(return_value=fake_supabase)  # type: ignore[attr-defined]

    new_code = await client.regenerate_building_invite_code("b-1", new_code="ABC23456")

    assert new_code == "ABC23456"
    fake_supabase.table.assert_called_with("buildings")
    chained.update.assert_called_with({"invite_code": "ABC23456"})


@pytest.mark.asyncio
async def test_regenerate_invite_code_asyncpg_path_executes_update() -> None:
    from src.databases.postgres import PostgresClient

    client = PostgresClient()
    client._use_supabase_client = MagicMock(return_value=False)  # type: ignore[attr-defined]
    client._pg_execute = AsyncMock()  # type: ignore[attr-defined]

    new_code = await client.regenerate_building_invite_code("b-2")

    client._pg_execute.assert_awaited_once()
    call_args = client._pg_execute.await_args.args
    assert call_args[0].startswith("UPDATE buildings SET invite_code")
    assert call_args[1] == new_code
    assert call_args[2] == "b-2"
    assert len(new_code) == 8


@pytest.mark.asyncio
async def test_regenerate_invite_code_generates_when_no_explicit_value() -> None:
    """Two consecutive rotations on the same building ID must yield different
    codes — proves we are not silently caching a single value."""
    from src.databases.postgres import PostgresClient

    client = PostgresClient()
    client._use_supabase_client = MagicMock(return_value=False)  # type: ignore[attr-defined]
    client._pg_execute = AsyncMock()  # type: ignore[attr-defined]

    a = await client.regenerate_building_invite_code("b-1")
    b = await client.regenerate_building_invite_code("b-1")
    # Birthday-paradox-safe at this length.
    assert a != b


# ---------------------------------------------------------------------------
# create_building auto-generates invite_code when missing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_building_supabase_assigns_invite_code_when_absent() -> None:
    from src.databases.postgres import PostgresClient

    client = PostgresClient()
    client._use_supabase_client = MagicMock(return_value=True)  # type: ignore[attr-defined]
    chained = MagicMock()
    chained.insert.return_value.execute = AsyncMock(return_value=MagicMock(data=[{}]))
    fake_supabase = MagicMock()
    fake_supabase.table.return_value = chained
    client._get_client = AsyncMock(return_value=fake_supabase)  # type: ignore[attr-defined]

    payload = {
        "id": "b1",
        "name": "X",
        "address": "Y",
        "city": "TLV",
        "region": "tel_aviv",
        "admin_user_id": "u1",
    }
    await client.create_building(payload)

    chained.insert.assert_called_once()
    inserted = chained.insert.call_args.args[0]
    assert "invite_code" in inserted
    assert len(inserted["invite_code"]) == 8


@pytest.mark.asyncio
async def test_create_building_respects_caller_provided_invite_code() -> None:
    from src.databases.postgres import PostgresClient

    client = PostgresClient()
    client._use_supabase_client = MagicMock(return_value=True)  # type: ignore[attr-defined]
    chained = MagicMock()
    chained.insert.return_value.execute = AsyncMock(return_value=MagicMock(data=[{}]))
    fake_supabase = MagicMock()
    fake_supabase.table.return_value = chained
    client._get_client = AsyncMock(return_value=fake_supabase)  # type: ignore[attr-defined]

    payload = {
        "id": "b1",
        "name": "X",
        "address": "Y",
        "city": "TLV",
        "region": "tel_aviv",
        "admin_user_id": "u1",
        "invite_code": "PROVIDED1",
    }
    await client.create_building(payload)

    inserted = chained.insert.call_args.args[0]
    assert inserted["invite_code"] == "PROVIDED1"
