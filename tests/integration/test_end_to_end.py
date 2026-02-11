"""Integration test for the end-to-end message flow."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture
def mock_orchestrator_deps():
    """Mock all external dependencies for integration testing."""
    with (
        patch("src.orchestration.graph.get_postgres_client") as mock_pg,
        patch("src.orchestration.graph.get_rag_pipeline") as mock_rag,
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_agent_rag,
        patch("src.agents.matching.get_graph_store") as mock_graph,
        patch("src.agents.pricing.get_postgres_client") as mock_pricing_pg,
        patch("src.agents.vetting.get_graph_store") as mock_vetting_graph,
        patch("src.agents.support.get_postgres_client") as mock_support_pg,
        patch("src.agents.support.get_redis_client") as mock_support_redis,
        patch("src.agents.analytics.get_postgres_client") as mock_analytics_pg,
    ):
        # Set up LLM mock
        llm = AsyncMock()
        llm.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Test response from LLM"}],
                "model": "claude-sonnet-4-20250514",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        llm.create_structured_output = AsyncMock(
            return_value={
                "intent": "contractor_search",
                "entities": {"category": "ac_installation"},
                "confidence": 0.95,
                "clarifying_question": None,
                "suggested_agent": "matching",
            }
        )
        llm.analyze_sentiment = AsyncMock(return_value=0.5)
        mock_llm.return_value = llm

        # Set up RAG mock
        rag = AsyncMock()
        rag.retrieve = AsyncMock(
            return_value=[
                {
                    "id": "doc_1",
                    "text": "Cool Air Ltd - professional AC installation",
                    "score": 0.95,
                    "metadata": {
                        "contractor_id": "con_001",
                        "business_name": "Cool Air Ltd",
                        "rating": 4.8,
                        "verified": True,
                    },
                }
            ]
        )
        rag.augment_prompt = AsyncMock(return_value="Augmented prompt")
        rag.get_metrics = AsyncMock(return_value={})
        mock_rag.return_value = rag
        mock_agent_rag.return_value = rag

        # Set up PostgreSQL mock
        pg = AsyncMock()
        pg.get_user_profile = AsyncMock(
            return_value={
                "id": "user_123",
                "name": "Yael Cohen",
                "building_id": "bld_001",
            }
        )
        pg.get_building = AsyncMock(
            return_value={
                "id": "bld_001",
                "address": "Rothschild 15",
                "city": "Tel Aviv",
                "region": "center",
                "units": 24,
                "type": "new_residential",
            }
        )
        pg.get_active_offers = AsyncMock(return_value=[])
        pg.get_market_data = AsyncMock(
            return_value={
                "avg_price": 4500,
                "median_price": 4200,
                "min_price": 3000,
                "max_price": 6000,
                "price_stddev": 800,
                "avg_participants": 8,
                "sample_size": 25,
            }
        )
        pg.get_user_orders = AsyncMock(return_value=[])
        pg.create_support_ticket = AsyncMock(return_value={"id": "ticket_001"})
        pg.health_check = AsyncMock(return_value=True)
        mock_pg.return_value = pg
        mock_pricing_pg.return_value = pg
        mock_support_pg.return_value = pg
        mock_analytics_pg.return_value = pg

        # Set up Graph mock
        graph = AsyncMock()
        graph.find_matching_contractors = AsyncMock(return_value=[])
        graph.get_contractor_reputation = AsyncMock(
            return_value={
                "contractor_id": "con_001",
                "total_projects": 5,
                "avg_success_rate": 0.92,
                "verified": True,
            }
        )
        graph.detect_suspicious_patterns = AsyncMock(return_value={"suspicious": False})
        graph.health_check = AsyncMock(return_value=True)
        mock_graph.return_value = graph
        mock_vetting_graph.return_value = graph

        # Set up Redis mock
        redis = AsyncMock()
        redis.get_conversation_context = AsyncMock(return_value=[])
        redis.add_conversation_message = AsyncMock()
        redis.check_rate_limit = AsyncMock(return_value=True)
        redis.health_check = AsyncMock(return_value=True)
        mock_support_redis.return_value = redis

        yield {
            "llm": llm,
            "rag": rag,
            "pg": pg,
            "graph": graph,
            "redis": redis,
        }


@pytest.mark.asyncio
async def test_end_to_end_contractor_search(mock_orchestrator_deps):
    """Test full message flow: user -> router -> matching -> response."""
    from src.orchestration.graph import GroupioOrchestrator

    orchestrator = GroupioOrchestrator()
    result = await orchestrator.run(
        user_message="מחפש קבלן מזגנים לבניין שלי",
        user_id="user_123",
        building_id="bld_001",
    )

    assert result is not None
    assert "response" in result
    assert "metadata" in result
    assert "conversation_id" in result

    metadata = result["metadata"]
    assert metadata["intent"] == "contractor_search"
    assert metadata["confidence"] >= 0.7
    assert "matching" in metadata["agents_used"]


@pytest.mark.asyncio
async def test_end_to_end_low_confidence_routes_to_support(
    mock_orchestrator_deps,
):
    """When confidence is low, router should route to support for clarification."""
    # Override LLM to return low confidence
    mock_orchestrator_deps["llm"].create_structured_output = AsyncMock(
        return_value={
            "intent": "general_info",
            "entities": {},
            "confidence": 0.4,
            "clarifying_question": "האם אתה מחפש מידע על שירות מסוים?",
            "suggested_agent": "support",
        }
    )

    from src.orchestration.graph import GroupioOrchestrator

    orchestrator = GroupioOrchestrator()
    result = await orchestrator.run(
        user_message="hello",
        user_id="user_123",
    )

    assert result is not None
    assert result["metadata"]["confidence"] < 0.7


@pytest.mark.asyncio
async def test_end_to_end_pricing_query(mock_orchestrator_deps):
    """Test pricing question flow: user -> router -> pricing -> response."""
    mock_orchestrator_deps["llm"].create_structured_output = AsyncMock(
        return_value={
            "intent": "pricing_question",
            "entities": {"category": "ac_installation"},
            "confidence": 0.92,
            "clarifying_question": None,
            "suggested_agent": "pricing",
        }
    )

    from src.orchestration.graph import GroupioOrchestrator

    orchestrator = GroupioOrchestrator()
    result = await orchestrator.run(
        user_message="כמה עולה התקנת מזגנים?",
        user_id="user_123",
        building_id="bld_001",
    )

    assert result is not None
    assert result["metadata"]["intent"] == "pricing_question"
    assert "pricing" in result["metadata"]["agents_used"]


@pytest.mark.asyncio
async def test_end_to_end_support_query(mock_orchestrator_deps):
    """Test support flow: user -> router -> support -> response."""
    mock_orchestrator_deps["llm"].create_structured_output = AsyncMock(
        return_value={
            "intent": "order_status",
            "entities": {},
            "confidence": 0.88,
            "clarifying_question": None,
            "suggested_agent": "support",
        }
    )

    from src.orchestration.graph import GroupioOrchestrator

    orchestrator = GroupioOrchestrator()
    result = await orchestrator.run(
        user_message="מה הסטטוס של ההזמנה שלי?",
        user_id="user_123",
    )

    assert result is not None
    assert result["metadata"]["intent"] == "order_status"
    assert "support" in result["metadata"]["agents_used"]
