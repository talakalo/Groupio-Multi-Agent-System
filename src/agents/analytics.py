"""Analytics Agent for business intelligence and NL querying."""

import json
import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.analytics import ANALYTICS_SYSTEM_PROMPT, NL_TO_SQL_PROMPT
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution
from src.utils.validators import validate_sql_query

logger = logging.getLogger(__name__)

# Database schema description for NL-to-SQL
DATABASE_SCHEMA = """
Tables:
- residents(id, name, email, phone, building_id, created_at)
- buildings(id, address, city, region, units, age, type, created_at)
- contractors(id, business_name, license_number, verified, rating, categories, regions, created_at)
- offers(id, category, base_price, status, building_id, contractor_id, created_at, expires_at)
- completed_offers(id, offer_id, final_price, participants, satisfaction_score, completed_at)
- conversations(id, user_id, topic, sentiment_score, outcome, created_at)
- reviews(id, contractor_id, resident_id, rating, text, created_at)
- support_tickets(id, user_id, conversation_id, reason, priority, status, created_at)
"""

EXAMPLE_QUERIES = """
Q: What is the average offer price by category?
SQL: SELECT category, AVG(base_price) as avg_price, COUNT(*) as total_offers FROM offers GROUP BY category ORDER BY avg_price DESC

Q: Which contractors have the highest ratings?
SQL: SELECT business_name, rating, verified FROM contractors WHERE verified = true ORDER BY rating DESC LIMIT 10

Q: How many offers were completed this month?
SQL: SELECT COUNT(*) as completed FROM completed_offers WHERE completed_at >= DATE_TRUNC('month', CURRENT_DATE)

Q: What is the average satisfaction by region?
SQL: SELECT b.region, AVG(co.satisfaction_score) as avg_satisfaction, COUNT(*) as total FROM completed_offers co JOIN offers o ON co.offer_id = o.id JOIN buildings b ON o.building_id = b.id GROUP BY b.region ORDER BY avg_satisfaction DESC
"""


class NLToSQL:
    """Convert natural language questions to SQL queries."""

    def __init__(self, llm_client: Any) -> None:
        self._llm = llm_client
        self._schema = DATABASE_SCHEMA
        self._examples = EXAMPLE_QUERIES

    async def generate_sql(self, question: str) -> str:
        """Generate a PostgreSQL query from a natural language question."""
        prompt = NL_TO_SQL_PROMPT.format(
            question=question,
            schema=self._schema,
            example_queries=self._examples,
        )

        response = await self._llm.create_message(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.0,
        )

        content = response.get("content", [])
        sql = content[0].get("text", "") if content else ""

        # Clean up the SQL
        sql = sql.strip()
        if sql.startswith("```"):
            sql = sql.split("\n", 1)[-1]
        if sql.endswith("```"):
            sql = sql.rsplit("```", 1)[0]
        sql = sql.strip()

        # Validate
        is_valid, reason = validate_sql_query(sql)
        if not is_valid:
            raise ValueError(f"Invalid SQL: {reason}")

        return sql


class AnalyticsAgent(BaseAgent):
    """Business intelligence agent for analytics queries.

    Supports natural language to SQL, trend analysis, and
    report generation.
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="analytics",
            description="Business intelligence and NL querying",
            system_prompt=ANALYTICS_SYSTEM_PROMPT,
            tools=["nl_to_sql", "execute_query", "vector_search"],
            rag_enabled=True,
            temperature=0.3,
            max_tokens=3000,
        )
        super().__init__(config)
        self._db = get_postgres_client()
        self._nl_to_sql = NLToSQL(self.llm_client)

    def _build_system_prompt(self, state: AgentState) -> str:
        """Build the system prompt with analytics-specific context."""
        user_message = self._get_last_user_message(state)
        return self.config.system_prompt.format(
            query=user_message,
            timeframe=state.get("timeframe", "last 30 days"),
            filters=state.get("filters", {}),
        )

    @track_agent_execution("analytics")
    async def run(self, state: AgentState) -> AgentState:
        """Handle analytics query."""
        user_message = self._get_last_user_message(state)

        # Determine query type
        query_type = self._classify_query(user_message)

        if query_type == "sql_query":
            result = await self._handle_sql_query(user_message, state)
        elif query_type == "trend_analysis":
            result = await self._handle_trend_analysis(user_message, state)
        else:
            result = await self._handle_general_analytics(user_message, state)

        state["actions_taken"] = [
            {
                "agent": "analytics",
                "action": f"analytics_{query_type}",
                "details": result.get("details", {}),
                "response": {
                    "type": "analytics",
                    "message": result.get("explanation", ""),
                    "data": result.get("data"),
                },
                "requires_followup": False,
            }
        ]

        self._metrics["calls"] += 1
        return state

    async def _handle_sql_query(self, question: str, state: AgentState) -> dict[str, Any]:
        """Convert NL to SQL, execute, and explain results."""
        try:
            sql = await self._nl_to_sql.generate_sql(question)

            # Execute query
            try:
                results = await self._db.execute_query(sql)
            except Exception as e:
                return {
                    "explanation": f"Query generated but execution failed: {e}",
                    "details": {"sql": sql, "error": str(e)},
                }

            # Generate explanation
            explanation = await self._explain_results(
                question=question,
                sql=sql,
                results=results,
            )

            return {
                "explanation": explanation,
                "data": results,
                "details": {"sql": sql, "result_count": len(results)},
            }

        except ValueError as e:
            return {
                "explanation": f"Could not generate a valid query: {e}",
                "details": {"error": str(e)},
            }

    async def _handle_trend_analysis(self, topic: str, state: AgentState) -> dict[str, Any]:
        """Analyze trends using RAG on conversation data."""
        # Search for relevant conversations
        conversations = await self._retrieve_context(
            query=f"{topic} trends patterns feedback",
            namespace="conversations",
            top_k=50,
            strategy="semantic",
        )

        # Generate trend analysis via LLM
        conv_texts = [c.get("text", "")[:200] for c in conversations[:20]]

        response = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analyze trends for topic: {topic}\n\n"
                        f"Based on these conversation excerpts:\n"
                        f"{json.dumps(conv_texts, ensure_ascii=False)}\n\n"
                        f"Identify:\n"
                        f"1. Main themes\n"
                        f"2. Sentiment patterns\n"
                        f"3. Key insights\n"
                        f"4. Recommended actions"
                    ),
                }
            ],
            system=self.config.system_prompt,
        )

        content = response.get("content", [])
        explanation = content[0].get("text", "") if content else ""

        return {
            "explanation": explanation,
            "data": {"conversations_analyzed": len(conversations)},
            "details": {"topic": topic},
        }

    async def _handle_general_analytics(self, question: str, state: AgentState) -> dict[str, Any]:
        """Handle general analytics questions."""
        response = await self._call_llm(
            messages=[
                {"role": "user", "content": question},
            ],
            system=self.config.system_prompt,
        )

        content = response.get("content", [])
        explanation = content[0].get("text", "") if content else ""

        return {
            "explanation": explanation,
            "details": {},
        }

    async def _explain_results(self, question: str, sql: str, results: list[dict]) -> str:
        """Generate a natural language explanation of query results."""
        response = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Question: {question}\n"
                        f"SQL: {sql}\n"
                        f"Results: {json.dumps(results[:20], default=str)}\n\n"
                        f"Provide a concise explanation of these results. "
                        f"Highlight key insights and trends."
                    ),
                }
            ],
            system=self.config.system_prompt,
            temperature=0.3,
        )

        content = response.get("content", [])
        return content[0].get("text", "") if content else ""

    def _classify_query(self, message: str) -> str:
        """Classify the analytics query type."""
        msg_lower = message.lower()

        sql_indicators = [
            "how many",
            "what is",
            "average",
            "total",
            "count",
            "list",
            "show",
            "top",
            "bottom",
            "highest",
            "lowest",
            "כמה",
            "מה",
            "ממוצע",
            "סך",
            "רשימה",
            "הכי",
        ]

        trend_indicators = [
            "trend",
            "pattern",
            "over time",
            "changing",
            "מגמה",
            "דפוס",
            "שינוי",
            "לאורך",
        ]

        if any(kw in msg_lower for kw in trend_indicators):
            return "trend_analysis"
        elif any(kw in msg_lower for kw in sql_indicators):
            return "sql_query"
        else:
            return "general"
