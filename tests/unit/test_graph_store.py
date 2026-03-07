"""Unit tests for GraphStore."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.databases.graph_store import GraphStore

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_driver():
    driver = AsyncMock()
    session_ctx = AsyncMock()
    session_mock = AsyncMock()

    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"n": 1}])
    session_mock.run = AsyncMock(return_value=result_mock)

    session_ctx.__aenter__ = AsyncMock(return_value=session_mock)
    session_ctx.__aexit__ = AsyncMock(return_value=False)
    driver.session = MagicMock(return_value=session_ctx)
    driver.close = AsyncMock()
    return driver


@pytest.fixture
def store(mock_driver):
    mock_settings = MagicMock()
    mock_settings.NEO4J_URI = "bolt://localhost:7687"
    mock_settings.NEO4J_USER = "neo4j"
    mock_settings.NEO4J_PASSWORD = "password"
    with patch("src.databases.graph_store.get_settings", return_value=mock_settings):
        with patch("src.databases.graph_store.AsyncGraphDatabase") as mock_gdb:
            mock_gdb.driver.return_value = mock_driver
            s = GraphStore()
    return s, mock_driver


# ---------------------------------------------------------------------------
# execute
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_returns_records(store):
    s, driver = store
    result = await s.execute("RETURN 1 as n")
    assert result == [{"n": 1}]


@pytest.mark.asyncio
async def test_execute_with_params(store):
    s, driver = store
    result = await s.execute("MATCH (n) WHERE n.id = $id RETURN n", {"id": "abc"})
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# find_matching_contractors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_matching_contractors_no_category(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"c": {"id": "c1"}}])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.find_matching_contractors("apartment", "tel_aviv")
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_find_matching_contractors_with_category(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.find_matching_contractors("apartment", "tel_aviv", category="plumbing")
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# get_building_neighbors_on_offer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_building_neighbors_on_offer(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"r": {"id": "r1"}}])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.get_building_neighbors_on_offer("offer-1")
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# get_contractor_reputation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_contractor_reputation_found(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"reputation": {"contractor_id": "c1", "total_projects": 5}}])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.get_contractor_reputation("c1")
    assert result["contractor_id"] == "c1"


@pytest.mark.asyncio
async def test_get_contractor_reputation_not_found(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.get_contractor_reputation("unknown")
    assert result == {}


# ---------------------------------------------------------------------------
# detect_suspicious_patterns
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detect_suspicious_patterns_found(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"patterns": {"suspicious": True, "failed_projects": 5}}])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.detect_suspicious_patterns("c1")
    assert result["suspicious"] is True


@pytest.mark.asyncio
async def test_detect_suspicious_patterns_not_found(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.detect_suspicious_patterns("unknown")
    assert result == {}


# ---------------------------------------------------------------------------
# get_contractor_building_history
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_contractor_building_history(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"b": {"id": "b1"}}])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.get_contractor_building_history("c1", limit=5)
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# recommend_contractors_by_network
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recommend_contractors_by_network(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"c": {"id": "c2"}}])
    session.run = AsyncMock(return_value=result_mock)

    result = await s.recommend_contractors_by_network("b1", "plumbing", limit=3)
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# create_schema
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_schema_success(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[])
    session.run = AsyncMock(return_value=result_mock)

    # Should not raise
    await s.create_schema()


@pytest.mark.asyncio
async def test_create_schema_handles_exceptions(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    session.run = AsyncMock(side_effect=Exception("constraint exists"))

    # Should not raise — exceptions are swallowed in create_schema
    await s.create_schema()


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_success(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    result_mock = AsyncMock()
    result_mock.data = AsyncMock(return_value=[{"n": 1}])
    session.run = AsyncMock(return_value=result_mock)

    assert await s.health_check() is True


@pytest.mark.asyncio
async def test_health_check_failure(store):
    s, driver = store
    session = driver.session().__aenter__.return_value
    session.run = AsyncMock(side_effect=Exception("connection refused"))

    assert await s.health_check() is False


# ---------------------------------------------------------------------------
# close
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close(store):
    s, driver = store
    await s.close()
    driver.close.assert_awaited_once()
