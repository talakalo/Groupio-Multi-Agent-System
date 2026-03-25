"""Shared test fixtures for the Groupio test suite."""

from unittest.mock import AsyncMock, patch

import pytest

from src.models.agent_state import AgentState


def pytest_configure(config):  # noqa: ARG001
    """Trim noisy warnings from deps / integration stubs (keep failures visible)."""
    import warnings

    warnings.filterwarnings(
        "ignore",
        message="Api key is used with an insecure connection",
        category=UserWarning,
    )
    try:
        from jwt import InsecureKeyLengthWarning

        warnings.filterwarnings("ignore", category=InsecureKeyLengthWarning)
    except ImportError:
        pass
    warnings.filterwarnings(
        "ignore",
        message="coroutine 'InterceptedUnaryUnaryCall._invoke' was never awaited",
        category=RuntimeWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message="coroutine 'AsyncMockMixin._execute_mock_call' was never awaited",
        category=RuntimeWarning,
    )


@pytest.fixture(autouse=True)
def _disable_llm_cache():
    """Disable the LLM response cache for all tests.

    The module-level ``_llm_cache`` stores responses in Redis.  When Redis is
    available (e.g. CI services) cached results leak between tests and cause
    mocks to be bypassed.  Patching ``get`` to always return ``None`` and
    ``set`` to no-op isolates every test from the cache.
    """
    with (
        patch("src.agents.base._llm_cache.get", new_callable=AsyncMock, return_value=None),
        patch("src.agents.base._llm_cache.set", new_callable=AsyncMock),
    ):
        yield


@pytest.fixture
def mock_llm_client():
    """Mock LLM client that returns structured responses."""
    client = AsyncMock()
    client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": "Test response"}],
            "model": "claude-sonnet-4-20250514",
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )
    client.create_structured_output = AsyncMock(
        return_value={
            "intent": "general_info",
            "entities": {},
            "confidence": 0.9,
            "clarifying_question": None,
            "suggested_agent": "support",
        }
    )
    client.analyze_sentiment = AsyncMock(return_value=0.5)
    return client


@pytest.fixture
def mock_rag_pipeline():
    """Mock RAG pipeline returning sample documents."""
    rag = AsyncMock()
    rag.retrieve = AsyncMock(
        return_value=[
            {
                "id": "doc_1",
                "text": "Sample contractor profile text",
                "score": 0.92,
                "metadata": {
                    "contractor_id": "con_001",
                    "business_name": "Cool Air Ltd",
                    "rating": 4.8,
                    "verified": True,
                },
            },
            {
                "id": "doc_2",
                "text": "Another contractor profile",
                "score": 0.85,
                "metadata": {
                    "contractor_id": "con_002",
                    "business_name": "Kitchen Masters",
                    "rating": 4.6,
                    "verified": True,
                },
            },
        ]
    )
    rag.augment_prompt = AsyncMock(return_value="Augmented system prompt with context")
    rag.get_metrics = AsyncMock(return_value={})
    return rag


@pytest.fixture
def mock_vector_store():
    """Mock vector store."""
    store = AsyncMock()
    store.search = AsyncMock(return_value=[])
    store.hybrid_search = AsyncMock(return_value=[])
    store.upsert = AsyncMock()
    store.health_check = AsyncMock(return_value=True)
    store.ensure_collections = AsyncMock()
    return store


@pytest.fixture
def mock_graph_store():
    """Mock graph store."""
    store = AsyncMock()
    store.execute = AsyncMock(return_value=[])
    store.find_matching_contractors = AsyncMock(return_value=[])
    store.get_contractor_reputation = AsyncMock(
        return_value={
            "contractor_id": "con_001",
            "total_projects": 5,
            "avg_success_rate": 0.92,
            "total_reviews": 10,
            "avg_review_rating": 4.5,
        }
    )
    store.detect_suspicious_patterns = AsyncMock(return_value={"suspicious": False})
    store.health_check = AsyncMock(return_value=True)
    return store


@pytest.fixture
def mock_postgres_client():
    """Mock PostgreSQL client."""
    client = AsyncMock()
    client.get_user_profile = AsyncMock(
        return_value={
            "id": "user_123",
            "name": "Yael Cohen",
            "building_id": "bld_001",
        }
    )
    client.get_building = AsyncMock(
        return_value={
            "id": "bld_001",
            "address": "Rothschild 15",
            "city": "Tel Aviv",
            "region": "center",
            "units": 24,
            "type": "new_residential",
        }
    )
    client.get_active_offers = AsyncMock(return_value=[])
    client.get_user_orders = AsyncMock(return_value=[])
    client.get_market_data = AsyncMock(
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
    client.health_check = AsyncMock(return_value=True)
    return client


@pytest.fixture
def mock_redis_client():
    """Mock Redis client."""
    client = AsyncMock()
    client.get_conversation_context = AsyncMock(return_value=[])
    client.add_conversation_message = AsyncMock()
    client.check_rate_limit = AsyncMock(return_value=True)
    client.health_check = AsyncMock(return_value=True)
    return client


@pytest.fixture
def sample_agent_state() -> AgentState:
    """Create a sample agent state for testing."""
    return AgentState(
        user_id="user_123",
        building_id="bld_001",
        conversation_id="conv_test_001",
        messages=[{"role": "user", "content": "מחפש קבלן מזגנים"}],
        current_agent="router",
        intent=None,
        confidence=0.0,
        user_profile={
            "id": "user_123",
            "name": "Yael Cohen",
            "building_id": "bld_001",
        },
        building_context={
            "id": "bld_001",
            "region": "center",
            "building_type": "new_residential",
            "units": 24,
        },
        active_offers=[],
        entities=None,
        last_agent_handoff=None,
        context_for_next_agent=None,
        rag_results=[],
        actions_taken=[],
        needs_human=False,
        escalation_reason=None,
        final_response=None,
        start_time="2026-01-15T10:00:00",
        tokens_used=0,
    )
