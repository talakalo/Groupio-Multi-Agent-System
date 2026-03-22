"""Unit tests for the unified DB-first agent mode resolver.

Tests are designed to PASS after the Unified Mode Resolver patch.

Coverage:
  A. get_agent_mode() — DB-first, env fallback, TTL cache, DB failure fallback
  B. MatchingAgent reads mode from DB via get_agent_mode
  C. PricingAgent reads mode from DB via get_agent_mode
  D. VettingAgent reads mode from DB via get_agent_mode
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _env_settings(**modes) -> MagicMock:
    s = MagicMock()
    s.MATCHING_AGENT_MODE = modes.get("matching", "gated")
    s.PRICING_AGENT_MODE = modes.get("pricing", "gated")
    s.VETTING_AGENT_MODE = modes.get("vetting", "gated")
    s.OUTREACH_AGENT_MODE = modes.get("outreach", "gated")
    s.PAYMENT_AGENT_MODE = modes.get("payment", "gated")
    return s


def _db_with_settings(*rows) -> AsyncMock:
    db = AsyncMock()
    db.get_system_settings = AsyncMock(return_value=list(rows))
    return db


def _db_failing() -> AsyncMock:
    db = AsyncMock()
    db.get_system_settings = AsyncMock(side_effect=RuntimeError("DB down"))
    return db


def _clear_resolver_cache():
    """Clear the in-process TTL cache between tests."""
    from src.services.agent_config import _cache_clear

    _cache_clear()


# ===========================================================================
# A. get_agent_mode() unit tests
# ===========================================================================


class TestGetAgentMode:
    """Direct tests of the get_agent_mode() resolver."""

    async def test_db_value_overrides_env(self):
        """DB value 'auto' is returned even when env says 'gated'."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = _env_settings(matching="gated")
        db = _db_with_settings({"key": "MATCHING_AGENT_MODE", "value": "auto"})

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            result = await get_agent_mode("matching")

        assert result == "auto"

    async def test_env_fallback_when_db_key_absent(self):
        """Env value used when DB has no entry for the key."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = _env_settings(pricing="recommend")
        db = _db_with_settings()  # empty

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            result = await get_agent_mode("pricing")

        assert result == "recommend"

    async def test_env_fallback_when_db_fails(self):
        """Env value used as fallback when DB call raises."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = _env_settings(vetting="recommend")
        db = _db_failing()

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            result = await get_agent_mode("vetting")

        assert result == "recommend"

    async def test_empty_db_value_falls_back_to_env(self):
        """DB entry with empty string is treated as absent → env fallback."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = _env_settings(payment="gated")
        db = _db_with_settings({"key": "PAYMENT_AGENT_MODE", "value": ""})

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            result = await get_agent_mode("payment")

        assert result == "gated"

    async def test_ttl_cache_returns_cached_value_without_db_call(self):
        """Second call within TTL window hits cache; DB is NOT called again."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = _env_settings(matching="gated")
        db = _db_with_settings({"key": "MATCHING_AGENT_MODE", "value": "auto"})

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            first = await get_agent_mode("matching")
            second = await get_agent_mode("matching")

        assert first == second == "auto"
        # DB was only called once (second call hit cache)
        assert db.get_system_settings.call_count == 1

    async def test_cache_miss_after_clear(self):
        """After cache clear, DB is queried again on the next call."""
        _clear_resolver_cache()
        from src.services.agent_config import _cache_clear, get_agent_mode

        env = _env_settings(matching="gated")
        db = _db_with_settings({"key": "MATCHING_AGENT_MODE", "value": "auto"})

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            await get_agent_mode("matching")
            _cache_clear()
            await get_agent_mode("matching")

        assert db.get_system_settings.call_count == 2

    async def test_unknown_agent_name_uses_env_attribute(self):
        """Unknown agent name resolves to env.UNKNOWN_AGENT_MODE if present."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = MagicMock()
        env.UNKNOWN_AGENT_MODE = "recommend"
        db = _db_with_settings()  # empty

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            result = await get_agent_mode("unknown")

        assert result == "recommend"

    async def test_all_five_agents_resolved(self):
        """All five known agent names resolve to their DB values."""
        _clear_resolver_cache()
        from src.services.agent_config import get_agent_mode

        env = _env_settings(**{k: "gated" for k in ["matching", "pricing", "vetting", "outreach", "payment"]})
        db = _db_with_settings(
            {"key": "MATCHING_AGENT_MODE", "value": "auto"},
            {"key": "PRICING_AGENT_MODE", "value": "auto"},
            {"key": "VETTING_AGENT_MODE", "value": "auto"},
            {"key": "OUTREACH_AGENT_MODE", "value": "recommend"},
            {"key": "PAYMENT_AGENT_MODE", "value": "recommend"},
        )

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
        ):
            agents = ["matching", "pricing", "vetting", "outreach", "payment"]
            results = {name: await get_agent_mode(name) for name in agents}

        # Cache was only populated from one DB call per key
        assert results["matching"] == "auto"
        assert results["pricing"] == "auto"
        assert results["vetting"] == "auto"
        assert results["outreach"] == "recommend"
        assert results["payment"] == "recommend"


# ===========================================================================
# B. MatchingAgent — reads mode from DB
# ===========================================================================


class TestMatchingAgentModeDBFirst:
    """MatchingAgent._run_impl uses get_agent_mode() → DB-first."""

    def _make_state(self) -> dict:
        return {
            "user_id": "user-1",
            "messages": [{"role": "user", "content": "I need a plumber"}],
            "actions_taken": [],
            "building_id": "b1",
            "intent": "contractor_search",
        }

    async def test_db_gated_mode_queues_pending_decision(self):
        """DB value 'gated' triggers _enqueue_pending_decision on MatchingAgent."""
        _clear_resolver_cache()
        from src.agents.matching import MatchingAgent

        env = _env_settings(matching="auto")  # env says auto
        db = _db_with_settings({"key": "MATCHING_AGENT_MODE", "value": "gated"})  # DB says gated

        agent = MatchingAgent()
        state = self._make_state()

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
            patch.object(agent, "_search_contractors", new_callable=AsyncMock, return_value=[]),
            patch.object(agent, "_enqueue_pending_decision", new_callable=AsyncMock) as mock_enqueue,
        ):
            result = await agent._run_impl(state)

        mock_enqueue.assert_awaited_once()
        assert result.get("needs_human") is True

    async def test_db_auto_mode_does_not_queue(self):
        """DB value 'auto' does NOT trigger pending decision on MatchingAgent."""
        _clear_resolver_cache()
        from src.agents.matching import MatchingAgent

        env = _env_settings(matching="gated")  # env says gated
        db = _db_with_settings({"key": "MATCHING_AGENT_MODE", "value": "auto"})  # DB says auto

        agent = MatchingAgent()
        state = self._make_state()

        with (
            patch("src.config.settings.get_settings", return_value=env),
            patch("src.databases.postgres.get_postgres_client", return_value=db),
            patch.object(agent, "_search_contractors", new_callable=AsyncMock, return_value=[]),
            patch.object(agent, "_enqueue_pending_decision", new_callable=AsyncMock) as mock_enqueue,
        ):
            result = await agent._run_impl(state)

        mock_enqueue.assert_not_awaited()
        assert not result.get("needs_human")


# ===========================================================================
# C. PricingAgent — reads mode from DB
# ===========================================================================


class TestPricingAgentModeDBFirst:
    """PricingAgent._run_impl uses get_agent_mode() → DB-first.

    _run_impl has many internal steps (market data, LLM, graph).  We mock all
    external I/O at the patch level so the test only exercises the mode check.
    """

    def _make_state(self) -> dict:
        return {
            "user_id": "user-1",
            "messages": [{"role": "user", "content": "price offer"}],
            "actions_taken": [],
            "building_id": "b1",
            "intent": "pricing_question",
        }

    async def test_db_gated_mode_queues_pending_decision(self):
        """DB value 'gated' triggers _enqueue_pending_decision on PricingAgent."""
        _clear_resolver_cache()
        from src.agents.pricing import PricingAgent

        agent = PricingAgent()
        state = self._make_state()

        # Patch get_agent_mode directly so DB/env plumbing is irrelevant here
        with (
            patch("src.agents.pricing.get_agent_mode", new=AsyncMock(return_value="gated")),
            patch.object(agent, "_retrieve_context", new_callable=AsyncMock, return_value=[]),
            patch.object(
                agent,
                "_get_market_data",
                new_callable=AsyncMock,
                return_value={"avg_price": 0, "avg_participants": 1},
            ),
            patch.object(agent, "_generate_pricing_response", new_callable=AsyncMock, return_value="ok"),
            patch.object(agent, "_enqueue_pending_decision", new_callable=AsyncMock) as mock_enqueue,
        ):
            result = await agent._run_impl(state)

        mock_enqueue.assert_awaited_once()
        assert result.get("needs_human") is True

    async def test_db_auto_mode_does_not_queue(self):
        """DB value 'auto' does NOT trigger pending decision on PricingAgent."""
        _clear_resolver_cache()
        from src.agents.pricing import PricingAgent

        agent = PricingAgent()
        state = self._make_state()

        with (
            patch("src.agents.pricing.get_agent_mode", new=AsyncMock(return_value="auto")),
            patch.object(agent, "_retrieve_context", new_callable=AsyncMock, return_value=[]),
            patch.object(
                agent,
                "_get_market_data",
                new_callable=AsyncMock,
                return_value={"avg_price": 0, "avg_participants": 1},
            ),
            patch.object(agent, "_generate_pricing_response", new_callable=AsyncMock, return_value="ok"),
            patch.object(agent, "_enqueue_pending_decision", new_callable=AsyncMock) as mock_enqueue,
        ):
            result = await agent._run_impl(state)

        mock_enqueue.assert_not_awaited()
        assert not result.get("needs_human")


# ===========================================================================
# D. VettingAgent — reads mode from DB
# ===========================================================================


class TestVettingAgentModeDBFirst:
    """VettingAgent._run_impl uses get_agent_mode() → DB-first."""

    def _make_state(self) -> dict:
        return {
            "user_id": "user-1",
            "messages": [{"role": "user", "content": "vet contractor c1"}],
            "actions_taken": [],
            "building_id": "b1",
            "entities": {"contractor_id": "c1"},
            "intent": "contractor_vetting",
        }

    async def test_db_gated_mode_queues_pending_decision(self):
        """DB value 'gated' triggers _enqueue_pending_decision on VettingAgent."""
        _clear_resolver_cache()
        from src.agents.vetting import VettingAgent

        agent = VettingAgent()
        state = self._make_state()

        with (
            patch("src.agents.vetting.get_agent_mode", new=AsyncMock(return_value="gated")),
            patch.object(agent, "_extract_contractor_id", return_value="c1"),
            patch.object(agent, "_get_documents", new_callable=AsyncMock, return_value=[]),
            patch.object(agent, "_analyze_documents", new_callable=AsyncMock, return_value={}),
            patch.object(agent, "_analyze_reputation", new_callable=AsyncMock, return_value={}),
            patch.object(agent, "_get_performance_history", new_callable=AsyncMock, return_value={}),
            patch.object(agent, "_calculate_trust_score", return_value=0.9),
            patch.object(agent, "_make_decision", return_value="approve"),
            patch.object(agent, "_generate_vetting_report", new_callable=AsyncMock, return_value="ok"),
            patch.object(agent, "_notify_admin_vetting", new_callable=AsyncMock),
            patch.object(agent, "_enqueue_pending_decision", new_callable=AsyncMock) as mock_enqueue,
        ):
            result = await agent._run_impl(state)

        mock_enqueue.assert_awaited_once()
        assert result.get("needs_human") is True

    async def test_db_auto_mode_does_not_queue(self):
        """DB value 'auto' does NOT trigger pending decision on VettingAgent."""
        _clear_resolver_cache()
        from src.agents.vetting import VettingAgent

        agent = VettingAgent()
        state = self._make_state()

        with (
            patch("src.agents.vetting.get_agent_mode", new=AsyncMock(return_value="auto")),
            patch.object(agent, "_extract_contractor_id", return_value="c1"),
            patch.object(agent, "_get_documents", new_callable=AsyncMock, return_value=[]),
            patch.object(agent, "_analyze_documents", new_callable=AsyncMock, return_value={}),
            patch.object(agent, "_analyze_reputation", new_callable=AsyncMock, return_value={}),
            patch.object(agent, "_get_performance_history", new_callable=AsyncMock, return_value={}),
            patch.object(agent, "_calculate_trust_score", return_value=0.9),
            patch.object(agent, "_make_decision", return_value="approve"),
            patch.object(agent, "_generate_vetting_report", new_callable=AsyncMock, return_value="ok"),
            patch.object(agent, "_notify_admin_vetting", new_callable=AsyncMock),
            patch.object(agent, "_enqueue_pending_decision", new_callable=AsyncMock) as mock_enqueue,
        ):
            result = await agent._run_impl(state)

        mock_enqueue.assert_not_awaited()
        assert not result.get("needs_human")
