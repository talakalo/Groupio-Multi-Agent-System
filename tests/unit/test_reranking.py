"""Unit tests for the Reranker."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.rag.reranking import Reranker


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def reranker():
    mock_settings = MagicMock()
    with patch("src.rag.reranking.get_settings", return_value=mock_settings):
        return Reranker()


def _docs(n=5):
    return [{"text": f"document {i} content", "score": 1.0 - i * 0.1} for i in range(n)]


# ---------------------------------------------------------------------------
# rerank
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rerank_empty_documents(reranker):
    result = await reranker.rerank("query", [], top_k=5)
    assert result == []


@pytest.mark.asyncio
async def test_rerank_fewer_docs_than_top_k(reranker):
    """When there are fewer docs than top_k, return them all without LLM call."""
    docs = _docs(3)
    with patch("src.rag.reranking.get_llm_client") as mock_get:
        result = await reranker.rerank("query", docs, top_k=5)
    mock_get.assert_not_called()
    assert result == docs


@pytest.mark.asyncio
async def test_rerank_calls_llm_and_sorts(reranker):
    """LLM scores are used to reorder documents."""
    docs = _docs(6)
    llm = AsyncMock()
    llm.create_message = AsyncMock(
        return_value={
            "content": [{"text": '[{"index": 0, "score": 9}, {"index": 1, "score": 2}, {"index": 2, "score": 7}, {"index": 3, "score": 5}, {"index": 4, "score": 3}, {"index": 5, "score": 8}]'}]
        }
    )
    with patch("src.rag.reranking.get_llm_client", return_value=llm):
        result = await reranker.rerank("query", docs, top_k=3)

    assert len(result) == 3
    # Top scoring doc (index 0, score 9) should come first
    assert result[0].get("rerank_score", 0) >= result[1].get("rerank_score", 0)


@pytest.mark.asyncio
async def test_rerank_falls_back_on_exception(reranker):
    docs = _docs(6)
    with patch("src.rag.reranking.get_llm_client", side_effect=Exception("LLM error")):
        result = await reranker.rerank("query", docs, top_k=3)
    # Falls back to original order, trimmed to top_k
    assert len(result) == 3
    assert result == docs[:3]


# ---------------------------------------------------------------------------
# _score_documents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_score_documents_assigns_scores(reranker):
    docs = [{"text": "doc1", "score": 0.8}, {"text": "doc2", "score": 0.6}]
    llm = AsyncMock()
    llm.create_message = AsyncMock(
        return_value={"content": '[{"index": 0, "score": 8}, {"index": 1, "score": 4}]'}
    )
    result = await reranker._score_documents(llm, "test query", docs)
    assert result[0]["rerank_score"] == pytest.approx(0.8)
    assert result[1]["rerank_score"] == pytest.approx(0.4)


@pytest.mark.asyncio
async def test_score_documents_fallback_score(reranker):
    """Docs without rerank score keep their original similarity score."""
    docs = [{"text": "doc", "score": 0.75}]
    llm = AsyncMock()
    # LLM returns no scores for this doc
    llm.create_message = AsyncMock(return_value={"content": "[]"})
    result = await reranker._score_documents(llm, "query", docs)
    assert result[0]["rerank_score"] == pytest.approx(0.75)


# ---------------------------------------------------------------------------
# _parse_scores
# ---------------------------------------------------------------------------


def test_parse_scores_from_list(reranker):
    response = {"content": '[{"index": 0, "score": 7}, {"index": 1, "score": 3}]'}
    scores = reranker._parse_scores(response)
    assert len(scores) == 2
    assert scores[0]["index"] == 0


def test_parse_scores_from_content_list(reranker):
    response = {"content": [{"text": '[{"index": 0, "score": 5}]'}]}
    scores = reranker._parse_scores(response)
    assert len(scores) == 1


def test_parse_scores_invalid_json(reranker):
    response = {"content": "not valid json [broken"}
    scores = reranker._parse_scores(response)
    assert scores == []


def test_parse_scores_no_array(reranker):
    response = {"content": "no array here"}
    scores = reranker._parse_scores(response)
    assert scores == []


def test_parse_scores_empty_content(reranker):
    response = {"content": []}
    scores = reranker._parse_scores(response)
    assert scores == []
