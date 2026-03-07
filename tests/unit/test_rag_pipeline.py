"""Unit tests for GroupioRAG pipeline."""

from unittest.mock import AsyncMock, patch

import pytest

from src.rag.pipeline import GroupioRAG

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_doc(id_="1", score=0.9, text="some text", **meta):
    return {"id": id_, "score": score, "text": text, "metadata": meta}


@pytest.fixture
def mock_vector_store():
    vs = AsyncMock()
    vs.search = AsyncMock(return_value=[_make_doc()])
    vs.hybrid_search = AsyncMock(return_value=[_make_doc()])
    vs.get_collection_info = AsyncMock(return_value={"status": "green", "points_count": 100})
    return vs


@pytest.fixture
def mock_embedding_client():
    ec = AsyncMock()
    ec.embed_query = AsyncMock(return_value=[0.1] * 1536)
    return ec


@pytest.fixture
def mock_reranker():
    r = AsyncMock()
    r.rerank = AsyncMock(side_effect=lambda q, docs, top_k: docs[:top_k])
    return r


@pytest.fixture
def rag(mock_vector_store, mock_embedding_client, mock_reranker):
    with patch("src.rag.pipeline.get_vector_store", return_value=mock_vector_store):
        with patch("src.rag.pipeline.get_embedding_client", return_value=mock_embedding_client):
            with patch("src.rag.pipeline.get_reranker", return_value=mock_reranker):
                return GroupioRAG()


# ---------------------------------------------------------------------------
# retrieve — strategies
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retrieve_semantic(rag, mock_vector_store):
    results = await rag.retrieve("fix roof", "contractors", strategy="semantic")
    mock_vector_store.search.assert_awaited_once()
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_retrieve_hybrid(rag, mock_vector_store):
    results = await rag.retrieve("fix roof", "contractors", strategy="hybrid")
    mock_vector_store.hybrid_search.assert_awaited_once()
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_retrieve_contextual(rag, mock_vector_store):
    results = await rag.retrieve("fix roof", "contractors", strategy="contextual")
    mock_vector_store.search.assert_awaited_once()
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_retrieve_multi_hop(rag, mock_vector_store):
    doc1 = _make_doc("1", 0.9, "roof repair specialist tiles")
    doc2 = _make_doc("2", 0.8, "plumbing expert drain")
    mock_vector_store.search = AsyncMock(side_effect=[[doc1], [doc2]])
    results = await rag.retrieve("fix roof", "contractors", strategy="multi_hop")
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_retrieve_multi_hop_empty_first_hop(rag, mock_vector_store):
    mock_vector_store.search = AsyncMock(return_value=[])
    results = await rag.retrieve("empty query", "contractors", strategy="multi_hop")
    assert results == []


@pytest.mark.asyncio
async def test_retrieve_unknown_strategy_falls_back_to_semantic(rag, mock_vector_store):
    results = await rag.retrieve("query", "contractors", strategy="unknown_xyz")
    mock_vector_store.search.assert_awaited_once()
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_retrieve_with_rerank(rag, mock_reranker):
    # Provide more docs than rerank_top_k to trigger reranking
    docs = [_make_doc(str(i), 1.0 - i * 0.05) for i in range(10)]
    rag._vector_store.search = AsyncMock(return_value=docs)
    results = await rag.retrieve("query", "contractors", top_k=10, rerank=True, rerank_top_k=5)
    mock_reranker.rerank.assert_awaited_once()
    assert len(results) == 5


@pytest.mark.asyncio
async def test_retrieve_no_rerank_when_few_results(rag, mock_reranker):
    docs = [_make_doc("1")]
    rag._vector_store.search = AsyncMock(return_value=docs)
    await rag.retrieve("query", "contractors", rerank=True, rerank_top_k=5)
    mock_reranker.rerank.assert_not_awaited()


# ---------------------------------------------------------------------------
# _extract_key_terms
# ---------------------------------------------------------------------------


def test_extract_key_terms_basic():
    docs = [{"text": "roof repair contractor verified expert"}, {"text": "plumbing drainage"}]
    terms = GroupioRAG._extract_key_terms(docs)
    assert isinstance(terms, str)
    # Should extract longer words
    assert any(len(w) > 4 for w in terms.split())


def test_extract_key_terms_empty():
    result = GroupioRAG._extract_key_terms([])
    assert result == ""


# ---------------------------------------------------------------------------
# augment_prompt
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_augment_prompt_with_docs(rag):
    docs = [_make_doc("1", 0.9, "Context about roofing", source="wiki")]
    result = await rag.augment_prompt("fix roof", docs, "System prompt here.")
    assert "System prompt here." in result
    assert "Context about roofing" in result
    assert "Retrieved Context" in result


@pytest.mark.asyncio
async def test_augment_prompt_empty_docs(rag):
    result = await rag.augment_prompt("fix roof", [], "System prompt here.")
    assert result == "System prompt here."


# ---------------------------------------------------------------------------
# get_metrics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_metrics_success(rag, mock_vector_store):
    metrics = await rag.get_metrics()
    assert "contractors" in metrics
    assert "buildings" in metrics


@pytest.mark.asyncio
async def test_get_metrics_handles_unavailable(rag, mock_vector_store):
    mock_vector_store.get_collection_info = AsyncMock(side_effect=Exception("qdrant down"))
    metrics = await rag.get_metrics()
    assert all(v == {"status": "unavailable"} for v in metrics.values())
