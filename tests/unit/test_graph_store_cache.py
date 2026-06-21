"""Unit tests for the Neo4j TTL cache on GraphStore read queries.

These tests verify that the four read-heavy GraphStore methods
(find_matching_contractors, get_contractor_reputation,
detect_suspicious_patterns, get_contractor_building_history) only hit
Neo4j once per cache key within the TTL window, and that cache keys
correctly separate by query parameters.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.databases.graph_store import GraphStore


class _FakeRedis:
    """Drop-in replacement for RedisClient.cache_get / cache_set."""

    def __init__(self) -> None:
        self.store: dict[str, object] = {}

    async def cache_get(self, key: str) -> object | None:
        return self.store.get(key)

    async def cache_set(self, key: str, value: object, ttl: int = 3600) -> None:
        self.store[key] = value


@pytest.fixture
def fake_redis():
    fake = _FakeRedis()
    with patch("src.databases.pg_store.get_pg_store", return_value=fake):
        yield fake


@pytest.fixture
def store():
    mock_settings = MagicMock()
    mock_settings.NEO4J_URI = "bolt://localhost:7687"
    mock_settings.NEO4J_USER = "neo4j"
    mock_settings.NEO4J_PASSWORD = "password"
    with patch("src.databases.graph_store.get_settings", return_value=mock_settings):
        with patch("src.databases.graph_store.AsyncGraphDatabase") as mock_driver:
            mock_driver.driver = MagicMock(return_value=MagicMock())
            yield GraphStore()


@pytest.mark.asyncio
async def test_find_matching_contractors_is_cached(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"c": {"id": "c1"}}])

    first = await store.find_matching_contractors("residential", "center", "plumbing")
    second = await store.find_matching_contractors("residential", "center", "plumbing")

    assert first == second == [{"c": {"id": "c1"}}]
    # Second call was served from cache — Neo4j was only touched once.
    store.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_find_matching_contractors_distinct_filters_miss(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"c": {"id": "c1"}}])

    await store.find_matching_contractors("residential", "center", "plumbing")
    await store.find_matching_contractors("residential", "north", "plumbing")  # different region
    await store.find_matching_contractors("commercial", "center", "plumbing")  # different type
    await store.find_matching_contractors("residential", "center", "electrical")  # different category

    # Each distinct filter tuple must produce a distinct cache key.
    assert store.execute.await_count == 4


@pytest.mark.asyncio
async def test_find_matching_contractors_limit_affects_key(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"c": {"id": "c1"}}])

    await store.find_matching_contractors("residential", "center", "plumbing", limit=10)
    await store.find_matching_contractors("residential", "center", "plumbing", limit=20)

    assert store.execute.await_count == 2


@pytest.mark.asyncio
async def test_get_contractor_reputation_is_cached(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"reputation": {"contractor_id": "c1", "total_projects": 7}}])

    first = await store.get_contractor_reputation("c1")
    second = await store.get_contractor_reputation("c1")

    assert first == {"contractor_id": "c1", "total_projects": 7}
    assert second == first
    store.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_contractor_reputation_separates_by_id(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"reputation": {"contractor_id": "c1"}}])

    await store.get_contractor_reputation("c1")
    await store.get_contractor_reputation("c2")

    assert store.execute.await_count == 2


@pytest.mark.asyncio
async def test_detect_suspicious_patterns_is_cached(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"patterns": {"contractor_id": "c1", "suspicious": False}}])

    await store.detect_suspicious_patterns("c1")
    await store.detect_suspicious_patterns("c1")

    store.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_contractor_building_history_is_cached(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"b": {"id": "b1", "success_rate": 0.95}}])

    await store.get_contractor_building_history("c1")
    await store.get_contractor_building_history("c1")

    store.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_contractor_building_history_limit_affects_key(store, fake_redis):
    store.execute = AsyncMock(return_value=[{"b": {"id": "b1"}}])

    await store.get_contractor_building_history("c1", limit=5)
    await store.get_contractor_building_history("c1", limit=10)

    assert store.execute.await_count == 2


@pytest.mark.asyncio
async def test_graph_cache_does_not_cross_pollute_methods(store, fake_redis):
    """Different methods must never share cache entries even for equal args."""
    store.execute = AsyncMock(
        side_effect=[
            [{"reputation": {"contractor_id": "c1"}}],
            [{"patterns": {"contractor_id": "c1"}}],
        ]
    )

    rep = await store.get_contractor_reputation("c1")
    pat = await store.detect_suspicious_patterns("c1")

    assert rep == {"contractor_id": "c1"}
    assert pat == [{"contractor_id": "c1"}] or pat == {"contractor_id": "c1"}
    # Both methods hit Neo4j — prefixes keep them on separate cache keys.
    assert store.execute.await_count == 2


@pytest.mark.asyncio
async def test_graph_cache_falls_through_when_redis_unavailable(store):
    """If Redis blows up, graph queries must still succeed — just uncached."""
    broken = MagicMock()
    broken.cache_get = AsyncMock(side_effect=ConnectionError("redis down"))
    broken.cache_set = AsyncMock(side_effect=ConnectionError("redis down"))
    store.execute = AsyncMock(return_value=[{"reputation": {"contractor_id": "c1"}}])

    with patch("src.databases.pg_store.get_pg_store", return_value=broken):
        first = await store.get_contractor_reputation("c1")
        second = await store.get_contractor_reputation("c1")

    assert first == second == {"contractor_id": "c1"}
    # With Redis down, every call goes to Neo4j — no silent breakage.
    assert store.execute.await_count == 2
