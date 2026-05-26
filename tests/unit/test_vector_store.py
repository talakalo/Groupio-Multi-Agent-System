"""Unit tests for VectorStore."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.databases.vector_store import VectorStore

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_hit(id_="1", score=0.9, text="hello", **meta):
    hit = MagicMock()
    hit.id = id_
    hit.score = score
    hit.payload = {"text": text, **meta}
    return hit


@pytest.fixture
def mock_client():
    return AsyncMock()


@pytest.fixture
def store(mock_client):
    mock_settings = MagicMock()
    mock_settings.QDRANT_URL = "http://localhost:6333"
    mock_settings.QDRANT_API_KEY = "key"
    with patch("src.databases.vector_store.get_settings", return_value=mock_settings):
        with patch("src.databases.vector_store.AsyncQdrantClient") as mock_cls:
            mock_cls.return_value = mock_client
            s = VectorStore()
    return s, mock_client


# ---------------------------------------------------------------------------
# ensure_collections
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ensure_collections_creates_missing(store):
    s, client = store
    # Simulate no existing collections
    existing = MagicMock()
    existing.collections = []
    client.get_collections = AsyncMock(return_value=existing)
    client.create_collection = AsyncMock()

    await s.ensure_collections()
    assert client.create_collection.await_count == 5  # 5 collections defined


@pytest.mark.asyncio
async def test_ensure_collections_skips_existing(store):
    s, client = store
    # All collections already exist
    coll_mock = MagicMock()
    coll_mock.name = "contractors"
    coll_mock2 = MagicMock()
    coll_mock2.name = "buildings"
    coll_mock3 = MagicMock()
    coll_mock3.name = "offers"
    coll_mock4 = MagicMock()
    coll_mock4.name = "knowledge_base"
    coll_mock5 = MagicMock()
    coll_mock5.name = "conversations"
    existing = MagicMock()
    existing.collections = [coll_mock, coll_mock2, coll_mock3, coll_mock4, coll_mock5]
    client.get_collections = AsyncMock(return_value=existing)
    client.create_collection = AsyncMock()

    await s.ensure_collections()
    client.create_collection.assert_not_awaited()


# ---------------------------------------------------------------------------
# upsert
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_single_batch(store):
    s, client = store
    client.upsert = AsyncMock()
    ids = ["1", "2"]
    vectors = [[0.1] * 1536, [0.2] * 1536]
    payloads = [{"text": "a"}, {"text": "b"}]

    await s.upsert("contractors", ids, vectors, payloads)
    client.upsert.assert_awaited_once()


@pytest.mark.asyncio
async def test_upsert_multiple_batches(store):
    s, client = store
    s._batch_size = 2
    client.upsert = AsyncMock()
    ids = ["1", "2", "3"]
    vectors = [[0.1] * 1536] * 3
    payloads = [{"text": f"doc{i}"} for i in range(3)]

    await s.upsert("contractors", ids, vectors, payloads)
    assert client.upsert.await_count == 2  # 2 batches


# ---------------------------------------------------------------------------
# search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_returns_results(store):
    s, client = store
    hits = [_make_hit("1", 0.9, "doc text", source="wiki")]
    client.search = AsyncMock(return_value=hits)

    results = await s.search("contractors", [0.1] * 1536, top_k=5)
    assert len(results) == 1
    assert results[0]["id"] == "1"
    assert results[0]["score"] == 0.9
    assert results[0]["text"] == "doc text"
    assert results[0]["metadata"]["source"] == "wiki"


@pytest.mark.asyncio
async def test_search_with_filters(store):
    s, client = store
    client.search = AsyncMock(return_value=[])

    results = await s.search("contractors", [0.1] * 1536, filters={"verified": True}, score_threshold=0.7)
    assert results == []


# ---------------------------------------------------------------------------
# hybrid_search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hybrid_search_combines_scores(store):
    s, client = store
    hits = [_make_hit("1", 0.8, "plumbing contractor verified")]
    client.search = AsyncMock(return_value=hits)

    results = await s.hybrid_search(
        "contractors",
        [0.1] * 1536,
        keyword_query="plumbing contractor",
        top_k=5,
    )
    assert len(results) == 1
    assert "keyword_score" in results[0]


@pytest.mark.asyncio
async def test_hybrid_search_empty(store):
    s, client = store
    client.search = AsyncMock(return_value=[])

    results = await s.hybrid_search("contractors", [0.1] * 1536, keyword_query="test", top_k=5)
    assert results == []


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_by_ids(store):
    s, client = store
    client.delete = AsyncMock()
    await s.delete("contractors", ids=["1", "2"])
    client.delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_by_filter(store):
    s, client = store
    client.delete = AsyncMock()
    await s.delete("contractors", filters={"verified": False})
    client.delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_no_args(store):
    s, client = store
    client.delete = AsyncMock()
    await s.delete("contractors")
    client.delete.assert_not_awaited()


# ---------------------------------------------------------------------------
# get_collection_info
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_collection_info(store):
    s, client = store
    info = MagicMock()
    info.vectors_count = 100
    info.points_count = 100
    info.status = MagicMock()
    info.status.value = "green"
    client.get_collection = AsyncMock(return_value=info)

    result = await s.get_collection_info("contractors")
    assert result["name"] == "contractors"
    assert result["vectors_count"] == 100
    assert result["status"] == "green"


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_success(store):
    s, client = store
    client.get_collections = AsyncMock(return_value=MagicMock())
    assert await s.health_check() is True


@pytest.mark.asyncio
async def test_health_check_failure(store):
    s, client = store
    client.get_collections = AsyncMock(side_effect=Exception("timeout"))
    assert await s.health_check() is False


# ---------------------------------------------------------------------------
# _build_filter
# ---------------------------------------------------------------------------


def test_build_filter_string_value(store):
    s, _ = store
    from qdrant_client import models

    f = s._build_filter({"category": "plumbing"})
    assert isinstance(f, models.Filter)


def test_build_filter_bool_value(store):
    s, _ = store
    from qdrant_client import models

    f = s._build_filter({"verified": True})
    assert isinstance(f, models.Filter)


def test_build_filter_list_value(store):
    s, _ = store
    from qdrant_client import models

    f = s._build_filter({"region": ["tel_aviv", "haifa"]})
    assert isinstance(f, models.Filter)


def test_build_filter_gte_range(store):
    s, _ = store
    from qdrant_client import models

    f = s._build_filter({"rating": {"gte": 4.0}})
    assert isinstance(f, models.Filter)


def test_build_filter_lte_range(store):
    s, _ = store
    from qdrant_client import models

    f = s._build_filter({"price": {"lte": 10000}})
    assert isinstance(f, models.Filter)
