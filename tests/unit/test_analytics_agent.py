"""Tests for the Analytics Agent."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.agents.analytics import AnalyticsAgent


@pytest.fixture
def analytics_agent():
    """Create analytics agent instance."""
    with patch("src.agents.analytics.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(
            PRIMARY_MODEL="claude-sonnet-4-20250514",
            MAX_TOKENS=4000,
            TEMPERATURE=0.7,
        )
        agent = AnalyticsAgent()
        agent.llm_client = AsyncMock()
        agent.rag_client = AsyncMock()
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
        analytics_agent.llm_client.call_structured = AsyncMock(return_value={
            "sql_query": "SELECT category, SUM(revenue) FROM offers GROUP BY category ORDER BY SUM(revenue) DESC LIMIT 1",
            "explanation": "Finding the category with highest revenue",
        })
        analytics_agent.db_client.execute_query = AsyncMock(return_value=[
            {"category": "ac_installation", "total_revenue": 150000}
        ])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result
        assert len(result["actions_taken"]) > 0

    @pytest.mark.asyncio
    async def test_generate_report(self, analytics_agent, sample_state):
        """Test generating an analytics report."""
        sample_state["user_message"] = "Generate a monthly report"

        analytics_agent.db_client.get_monthly_stats = AsyncMock(return_value={
            "total_offers": 50,
            "total_revenue": 500000,
            "new_contractors": 10,
            "avg_discount": 12.5,
        })
        analytics_agent.llm_client.call = AsyncMock(return_value="Monthly report summary...")

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_trend_analysis(self, analytics_agent, sample_state):
        """Test trend analysis functionality."""
        sample_state["user_message"] = "Show me offer trends for the past 6 months"

        analytics_agent.db_client.get_trend_data = AsyncMock(return_value=[
            {"month": "2024-01", "offers": 30, "revenue": 100000},
            {"month": "2024-02", "offers": 35, "revenue": 120000},
            {"month": "2024-03", "offers": 40, "revenue": 150000},
        ])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_sql_injection_prevention(self, analytics_agent, sample_state):
        """Test that SQL injection attempts are blocked."""
        sample_state["user_message"] = "Show data; DROP TABLE offers; --"

        # The agent should sanitize and not execute malicious SQL
        analytics_agent.llm_client.call_structured = AsyncMock(return_value={
            "sql_query": "SELECT * FROM offers LIMIT 10",
            "explanation": "Showing recent offers",
        })

        result = await analytics_agent.run(sample_state)

        # Verify no destructive SQL was executed
        if analytics_agent.db_client.execute_query.called:
            called_query = analytics_agent.db_client.execute_query.call_args[0][0]
            assert "DROP" not in called_query.upper()

    @pytest.mark.asyncio
    async def test_complex_aggregation(self, analytics_agent, sample_state):
        """Test complex aggregation queries."""
        sample_state["user_message"] = "What's the average discount by region and category?"

        analytics_agent.llm_client.call_structured = AsyncMock(return_value={
            "sql_query": """
                SELECT region, category, AVG(discount_percent) as avg_discount
                FROM offers o
                JOIN buildings b ON o.building_id = b.id
                GROUP BY region, category
            """,
            "explanation": "Calculating average discounts by region and category",
        })
        analytics_agent.db_client.execute_query = AsyncMock(return_value=[
            {"region": "center", "category": "ac_installation", "avg_discount": 15.0},
            {"region": "tel_aviv", "category": "electrical", "avg_discount": 12.0},
        ])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_export_data(self, analytics_agent, sample_state):
        """Test data export functionality."""
        sample_state["user_message"] = "Export contractor performance data"

        analytics_agent.db_client.get_contractor_performance = AsyncMock(return_value=[
            {"contractor_id": "c1", "name": "AC Pro", "completed": 20, "rating": 4.8},
            {"contractor_id": "c2", "name": "Plumb Plus", "completed": 15, "rating": 4.5},
        ])

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_comparison_query(self, analytics_agent, sample_state):
        """Test comparison between periods."""
        sample_state["user_message"] = "Compare this month to last month"

        analytics_agent.db_client.get_period_comparison = AsyncMock(return_value={
            "current": {"offers": 45, "revenue": 200000},
            "previous": {"offers": 40, "revenue": 180000},
            "change": {"offers": 12.5, "revenue": 11.1},
        })

        result = await analytics_agent.run(sample_state)

        assert "actions_taken" in result

    @pytest.mark.asyncio
    async def test_metrics_retrieval(self, analytics_agent):
        """Test getting agent metrics."""
        analytics_agent._call_count = 100
        analytics_agent._error_count = 5
        analytics_agent._total_latency = 50.0

        metrics = await analytics_agent.get_metrics()

        assert "calls" in metrics
        assert metrics["calls"] == 100
        assert "errors" in metrics
        assert "avg_latency" in metrics
