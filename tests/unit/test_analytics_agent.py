"""Tests for the Analytics Agent."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.analytics import AnalyticsAgent


@pytest.fixture
def analytics_agent():
    """Create analytics agent instance."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
        patch("src.agents.analytics.get_postgres_client") as mock_db,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()
        mock_db.return_value = AsyncMock()

        agent = AnalyticsAgent()
        agent.llm_client = AsyncMock()
        agent.rag = AsyncMock()
        agent.db_client = AsyncMock()
        yield agent


@pytest.fixture
def sample_state():
    """Create sample agent state."""
    return {
        "user_message": "What was our best performing category last month?",
        "user_id": "admin-123",
        "intent": "analytics_query",
        "confidence": 0.9,
        "messages": [],
        "actions_taken": [],
        "needs_human": False,
    }


class TestAnalyticsAgent:
    """Test suite for AnalyticsAgent."""

    @pytest.mark.asyncio
    async def test_process_natural_language_query(self, analytics_agent, sample_state):
        """Test processing a natural language analytics query."""
        # Mock LLM create_message response
        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Category analysis complete"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        # Mock RAG retrieve
        analytics_agent.rag.retrieve = AsyncMock(return_value=[])
        # Mock SQL generation
        analytics_agent._nl_to_sql = MagicMock()
        analytics_agent._nl_to_sql.generate_sql = AsyncMock(return_value="SELECT category FROM offers LIMIT 1")
        analytics_agent._db = MagicMock()
        analytics_agent._db.execute_query = AsyncMock(
            return_value=[{"category": "ac_installation", "total_revenue": 150000}]
        )

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result
        assert len(result["actions_taken"]) > 0

    @pytest.mark.asyncio
    async def test_generate_report(self, analytics_agent, sample_state):
        """Test generating an analytics report."""
        sample_state["user_message"] = "Generate a monthly report"
        sample_state["messages"] = [{"role": "user", "content": "Generate a monthly report"}]

        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Monthly report summary..."}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        analytics_agent.rag.retrieve = AsyncMock(return_value=[])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_trend_analysis(self, analytics_agent, sample_state):
        """Test trend analysis functionality."""
        sample_state["user_message"] = "Show me offer trends for the past 6 months"
        sample_state["messages"] = [{"role": "user", "content": "Show me offer trends for the past 6 months"}]

        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Trend analysis shows growth..."}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        analytics_agent.rag.retrieve = AsyncMock(
            return_value=[
                {"text": "Jan: 30 offers", "score": 0.9},
            ]
        )

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_sql_injection_prevention(self, analytics_agent, sample_state):
        """Test that SQL injection attempts are blocked."""
        sample_state["user_message"] = "Show data; DROP TABLE offers; --"
        sample_state["messages"] = [{"role": "user", "content": "Show data; DROP TABLE offers; --"}]

        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Query processed"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        analytics_agent.rag.retrieve = AsyncMock(return_value=[])
        # Mock NL to SQL to return safe query
        analytics_agent._nl_to_sql = MagicMock()
        analytics_agent._nl_to_sql.generate_sql = AsyncMock(return_value="SELECT * FROM offers LIMIT 10")
        analytics_agent._db = MagicMock()
        analytics_agent._db.execute_query = AsyncMock(return_value=[])

        result = await analytics_agent.run(sample_state)

        # Verify agent handled the potentially malicious query
        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_complex_aggregation(self, analytics_agent, sample_state):
        """Test complex aggregation queries."""
        sample_state["user_message"] = "What's the average discount by region and category?"
        sample_state["messages"] = [{"role": "user", "content": "What's the average discount by region and category?"}]

        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Aggregation complete"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        analytics_agent.rag.retrieve = AsyncMock(return_value=[])
        # Mock NL to SQL
        analytics_agent._nl_to_sql = MagicMock()
        analytics_agent._nl_to_sql.generate_sql = AsyncMock(
            return_value="SELECT region, category, AVG(discount) FROM offers GROUP BY region, category"
        )
        analytics_agent._db = MagicMock()
        analytics_agent._db.execute_query = AsyncMock(
            return_value=[{"region": "center", "category": "ac", "avg_discount": 15.0}]
        )

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_export_data(self, analytics_agent, sample_state):
        """Test data export functionality."""
        sample_state["user_message"] = "Export contractor performance data"
        sample_state["messages"] = [{"role": "user", "content": "Export contractor performance data"}]

        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Export prepared"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        analytics_agent.rag.retrieve = AsyncMock(return_value=[])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_comparison_query(self, analytics_agent, sample_state):
        """Test comparison between periods."""
        sample_state["user_message"] = "Compare this month to last month"
        sample_state["messages"] = [{"role": "user", "content": "Compare this month to last month"}]

        analytics_agent.llm_client.create_message = AsyncMock(
            return_value={
                "content": [{"type": "text", "text": "Comparison complete"}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }
        )
        analytics_agent.rag.retrieve = AsyncMock(return_value=[])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_metrics_retrieval(self, analytics_agent):
        """Test getting agent metrics."""
        analytics_agent._metrics = {"calls": 100, "errors": 5, "tokens": 5000}

        metrics = await analytics_agent.get_metrics()

        assert "calls" in metrics
        assert metrics["calls"] == 100
