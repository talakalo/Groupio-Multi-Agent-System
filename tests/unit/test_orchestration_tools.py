"""Unit tests for orchestration ToolRegistry."""

from unittest.mock import AsyncMock, patch

import pytest

from src.orchestration.tools import ToolRegistry

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def registry():
    mock_rag = AsyncMock()
    mock_rag.retrieve = AsyncMock(return_value=[{"id": "1", "text": "result"}])

    mock_graph = AsyncMock()
    mock_graph.execute = AsyncMock(return_value=[{"node": "contractor"}])

    mock_db = AsyncMock()
    mock_db.execute_query = AsyncMock(return_value=[{"row": "data"}])
    mock_db.get_user_orders = AsyncMock(return_value=[{"order": "1"}])
    mock_db.get_active_offers = AsyncMock(return_value=[{"offer": "1"}])
    mock_db.get_market_data = AsyncMock(return_value={"avg_price": 1000})
    mock_db.create_support_ticket = AsyncMock(return_value={"id": "ticket-1"})

    with patch("src.orchestration.tools.get_rag_pipeline", return_value=mock_rag):
        with patch("src.orchestration.tools.get_graph_store", return_value=mock_graph):
            with patch("src.orchestration.tools.get_postgres_client", return_value=mock_db):
                r = ToolRegistry()
    r._mock_rag = mock_rag
    r._mock_graph = mock_graph
    r._mock_db = mock_db
    return r


# ---------------------------------------------------------------------------
# Registration / listing
# ---------------------------------------------------------------------------


def test_list_tools(registry):
    tools = registry.list_tools()
    assert "vector_search" in tools
    assert "graph_query" in tools
    assert "sql_query" in tools
    assert "get_order_status" in tools
    assert "get_offer_details" in tools
    assert "get_market_data" in tools
    assert "calculate_match_score" in tools
    assert "analyze_sentiment" in tools
    assert "escalate_to_human" in tools
    assert "create_support_ticket" in tools
    assert "normalize_address" in tools
    assert "verify_contractor_license" in tools
    assert "get_municipality_info" in tools


def test_get_tool_exists(registry):
    tool = registry.get_tool("vector_search")
    assert tool is not None


def test_get_tool_missing(registry):
    tool = registry.get_tool("nonexistent_tool")
    assert tool is None


# ---------------------------------------------------------------------------
# _vector_search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vector_search(registry):
    with patch("src.orchestration.tools.get_rag_pipeline", return_value=registry._mock_rag):
        result = await registry._vector_search("plumber near me", "contractors", top_k=5)
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# _graph_query
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_graph_query(registry):
    with patch("src.orchestration.tools.get_graph_store", return_value=registry._mock_graph):
        result = await registry._graph_query("MATCH (n) RETURN n LIMIT 1", {})
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# _sql_query
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sql_query(registry):
    with patch("src.orchestration.tools.get_postgres_client", return_value=registry._mock_db):
        result = await registry._sql_query("SELECT 1", None)
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# _get_order_status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_order_status(registry):
    with patch("src.orchestration.tools.get_postgres_client", return_value=registry._mock_db):
        result = await registry._get_order_status("user-1", limit=3)
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# _get_offer_details
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_offer_details(registry):
    with patch("src.orchestration.tools.get_postgres_client", return_value=registry._mock_db):
        result = await registry._get_offer_details("building-1")
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# _get_market_data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_market_data(registry):
    with patch("src.orchestration.tools.get_postgres_client", return_value=registry._mock_db):
        result = await registry._get_market_data("plumbing", "tel_aviv")
    assert "avg_price" in result


# ---------------------------------------------------------------------------
# _calculate_match_score
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_calculate_match_score_basic(registry):
    contractor = {
        "semantic_similarity": 0.8,
        "graph_score": 0.7,
        "rating": 0.9,
        "price_competitiveness": 0.6,
        "availability": 0.8,
        "response_time": 0.7,
    }
    score = await registry._calculate_match_score(contractor, {})
    assert 0.0 <= score <= 1.0


@pytest.mark.asyncio
async def test_calculate_match_score_zeros(registry):
    score = await registry._calculate_match_score({}, {})
    assert score == 0.0


# ---------------------------------------------------------------------------
# _analyze_sentiment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_sentiment(registry):
    mock_llm = AsyncMock()
    mock_llm.analyze_sentiment = AsyncMock(return_value=0.8)
    with patch("src.utils.llm_client.get_llm_client", return_value=mock_llm):
        result = await registry._analyze_sentiment("Great service!")
    assert result == 0.8


# ---------------------------------------------------------------------------
# _create_support_ticket / _escalate_to_human
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_support_ticket(registry):
    with patch("src.orchestration.tools.get_postgres_client", return_value=registry._mock_db):
        with patch("src.utils.monitoring.generate_request_id", return_value="req-123"):
            result = await registry._create_support_ticket(
                user_id="user-1",
                conversation_id="conv-1",
                reason="Need help",
                priority="high",
            )
    assert result.get("id") == "ticket-1"


@pytest.mark.asyncio
async def test_escalate_to_human_delegates(registry):
    with patch("src.orchestration.tools.get_postgres_client", return_value=registry._mock_db):
        with patch("src.utils.monitoring.generate_request_id", return_value="req-456"):
            result = await registry._escalate_to_human(
                user_id="user-1",
                conversation_id="conv-1",
                reason="Angry customer",
                priority="high",
            )
    assert result.get("id") == "ticket-1"


# ---------------------------------------------------------------------------
# Enrichment tools (normalize_address, verify_contractor_license, get_municipality_info)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("src.services.enrichment._is_datagov_enabled", return_value=False)
async def test_normalize_address_tool(_mock_datagov, registry):
    from src.services import enrichment as enrichment_module

    enrichment_module._enrichment_service = None
    result = await registry._normalize_address("רחוב הרצל 10", "תל אביב")
    assert "address" in result
    assert "city" in result
    assert "confidence" in result
    assert "source" in result
    assert result["address"] == "רחוב הרצל 10"
    assert result["city"] == "תל אביב"
    assert result["source"] == "stub"


@pytest.mark.asyncio
async def test_verify_contractor_license_tool(registry):
    result = await registry._verify_contractor_license("12345", "Acme Ltd")
    assert "verified" in result
    assert "confidence" in result
    assert "source" in result
    assert "verified_at" in result
    assert result["verified"] is False
    assert result["confidence"] == 0.0


@pytest.mark.asyncio
@patch("src.services.enrichment._is_datagov_enabled", return_value=False)
async def test_get_municipality_info_tool(_mock_datagov, registry):
    from src.services import enrichment as enrichment_module

    enrichment_module._enrichment_service = None
    result = await registry._get_municipality_info("תל אביב")
    assert result is None
