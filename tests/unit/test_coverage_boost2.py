"""Additional coverage tests for base agent, payment service, and orchestration."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# src/agents/base.py — CircuitBreaker, LLMResponseCache, BaseAgent methods
# ---------------------------------------------------------------------------


class TestCircuitBreaker:
    def setup_method(self):
        from src.agents.base import CircuitBreaker

        self.cb = CircuitBreaker(failure_threshold=3, recovery_timeout=60.0)

    def test_initial_state_closed(self):
        assert not self.cb.is_open

    def test_opens_after_threshold(self):
        for _ in range(3):
            self.cb.record_failure()
        assert self.cb.is_open

    def test_resets_on_success(self):
        for _ in range(3):
            self.cb.record_failure()
        self.cb.record_success()
        assert not self.cb.is_open

    def test_half_open_after_timeout(self):
        import time

        for _ in range(3):
            self.cb.record_failure()
        # Manually set last failure time to far in the past
        self.cb._last_failure_time = time.time() - 120
        assert not self.cb.is_open  # should be half-open → returns False

    def test_does_not_open_below_threshold(self):
        for _ in range(2):
            self.cb.record_failure()
        assert not self.cb.is_open


class TestLLMResponseCache:
    def setup_method(self):
        from src.agents.base import LLMResponseCache

        self.cache = LLMResponseCache(default_ttl=300)

    def test_make_key_deterministic(self):
        key1 = self.cache._make_key("model", "sys", [{"role": "user", "content": "hi"}])
        key2 = self.cache._make_key("model", "sys", [{"role": "user", "content": "hi"}])
        assert key1 == key2
        assert key1.startswith("llm_cache:")

    def test_make_key_differs_on_content(self):
        key1 = self.cache._make_key("model", "sys", [{"role": "user", "content": "hi"}])
        key2 = self.cache._make_key("model", "sys", [{"role": "user", "content": "bye"}])
        assert key1 != key2

    @pytest.mark.asyncio
    async def test_get_returns_none_on_miss(self):
        mock_redis = AsyncMock()
        mock_redis.cache_get = AsyncMock(return_value=None)
        with patch("src.databases.redis_client.get_redis_client", return_value=mock_redis):
            result = await self.cache.get("m", "s", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_get_returns_cached_value(self):
        cached = {"content": "cached response"}
        mock_redis = AsyncMock()
        mock_redis.cache_get = AsyncMock(return_value=cached)
        with patch("src.databases.redis_client.get_redis_client", return_value=mock_redis):
            result = await self.cache.get("m", "s", [{"role": "user", "content": "q"}])
        assert result == cached

    @pytest.mark.asyncio
    async def test_get_returns_none_on_redis_error(self):
        with patch("src.databases.redis_client.get_redis_client", side_effect=Exception("Redis down")):
            result = await self.cache.get("m", "s", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_set_stores_value(self):
        mock_redis = AsyncMock()
        mock_redis.cache_set = AsyncMock()
        with patch("src.databases.redis_client.get_redis_client", return_value=mock_redis):
            await self.cache.set("m", "s", [], {"content": "resp"})
        mock_redis.cache_set.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_set_swallows_redis_error(self):
        with patch("src.databases.redis_client.get_redis_client", side_effect=Exception("Redis down")):
            await self.cache.set("m", "s", [], {"content": "resp"})  # should not raise


class TestBaseAgentMethods:
    @pytest.fixture
    def agent(self):
        with patch("src.agents.base.get_llm_client") as mock_llm, patch("src.agents.base.get_rag_pipeline"):
            mock_llm.return_value = AsyncMock()
            from src.agents.router import RouterAgent

            a = RouterAgent()
            a.llm_client = AsyncMock()
            return a

    @pytest.mark.asyncio
    async def test_reload_config_with_override(self, agent):
        mock_db = AsyncMock()
        mock_db.get_agent_system_prompt = AsyncMock(return_value="New prompt")
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            await agent.reload_config()
        assert agent.config.system_prompt == "New prompt"

    @pytest.mark.asyncio
    async def test_reload_config_no_override(self, agent):
        original = agent.config.system_prompt
        mock_db = AsyncMock()
        mock_db.get_agent_system_prompt = AsyncMock(return_value=None)
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            await agent.reload_config()
        assert agent.config.system_prompt == original

    @pytest.mark.asyncio
    async def test_reload_config_db_error(self, agent):
        original = agent.config.system_prompt
        with patch("src.databases.postgres.get_postgres_client", side_effect=Exception("DB down")):
            await agent.reload_config()  # should not raise
        assert agent.config.system_prompt == original

    @pytest.mark.asyncio
    async def test_get_metrics_without_history(self, agent):
        mock_db = AsyncMock()
        mock_db.get_agent_metrics_history = AsyncMock(return_value=[])
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            metrics = await agent.get_metrics()
        assert metrics["name"] == agent.config.name
        assert "historical" not in metrics

    @pytest.mark.asyncio
    async def test_get_metrics_with_history(self, agent):
        mock_db = AsyncMock()
        mock_db.get_agent_metrics_history = AsyncMock(
            return_value=[
                {"metric_type": "calls", "value": 10},
                {"metric_type": "tokens", "value": 500},
            ]
        )
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            metrics = await agent.get_metrics()
        assert "historical" in metrics
        assert metrics["historical"]["calls"] == 10.0

    @pytest.mark.asyncio
    async def test_get_metrics_db_error(self, agent):
        with patch("src.databases.postgres.get_postgres_client", side_effect=Exception("DB down")):
            metrics = await agent.get_metrics()
        assert metrics["name"] == agent.config.name

    @pytest.mark.asyncio
    async def test_enqueue_pending_decision_success(self, agent):
        mock_db = AsyncMock()
        mock_db.create_pending_decision = AsyncMock()
        state = {"conversation_id": "conv1", "user_id": "user1"}
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            await agent._enqueue_pending_decision(
                state=state, action_type="test_action", payload={"key": "val"}, escalation_reason="test"
            )
        mock_db.create_pending_decision.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_enqueue_pending_decision_db_error(self, agent):
        with patch("src.databases.postgres.get_postgres_client", side_effect=Exception("DB")):
            await agent._enqueue_pending_decision(
                state={}, action_type="act", payload={}, escalation_reason="r"
            )  # should not raise

    def test_build_system_prompt_with_unknown_placeholder(self, agent):
        agent.config.system_prompt = "Hello {name} and {unknown_field}"
        state = {"user_id": "u1", "messages": [], "user_profile": {}, "building_context": {}, "active_offers": []}
        result = agent._build_system_prompt(state)
        # Should not raise, missing placeholder substituted with N/A
        assert "N/A" in result

    def test_extract_text_from_list_content(self):
        from src.agents.payment import PaymentAgent

        with patch("src.agents.base.get_llm_client"), patch("src.agents.base.get_rag_pipeline"):
            agent = PaymentAgent()
        response = {"content": [{"type": "text", "text": "Hello"}]}
        text = agent._extract_text(response)
        assert text == "Hello"

    def test_extract_text_from_string_content(self):
        from src.agents.payment import PaymentAgent

        with patch("src.agents.base.get_llm_client"), patch("src.agents.base.get_rag_pipeline"):
            agent = PaymentAgent()
        response = {"content": "Direct string"}
        text = agent._extract_text(response)
        assert text == "Direct string"

    def test_extract_text_empty(self):
        from src.agents.payment import PaymentAgent

        with patch("src.agents.base.get_llm_client"), patch("src.agents.base.get_rag_pipeline"):
            agent = PaymentAgent()
        text = agent._extract_text({})
        assert text == ""

    @pytest.mark.asyncio
    async def test_call_llm_circuit_breaker_open(self, agent):
        import src.agents.base as base_mod

        original_state = base_mod._llm_circuit_breaker._state
        base_mod._llm_circuit_breaker._state = "open"
        base_mod._llm_circuit_breaker._last_failure_time = None

        try:
            with pytest.raises(ConnectionError):
                await agent._call_llm(messages=[{"role": "user", "content": "hi"}])
        finally:
            base_mod._llm_circuit_breaker._state = original_state

    @pytest.mark.asyncio
    async def test_persist_metrics_success(self, agent):
        mock_db = AsyncMock()
        mock_db.record_agent_metrics = AsyncMock()
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            await agent._persist_metrics()
        mock_db.record_agent_metrics.assert_awaited_once_with(agent.config.name, agent._metrics)

    @pytest.mark.asyncio
    async def test_persist_metrics_db_error(self, agent):
        with patch("src.databases.postgres.get_postgres_client", side_effect=Exception("DB")):
            await agent._persist_metrics()  # should not raise


# ---------------------------------------------------------------------------
# src/services/payment.py — StripePaymentProvider + get_payment_provider
# ---------------------------------------------------------------------------


class TestStripePaymentProvider:
    @pytest.fixture
    def stripe_provider(self):
        mock_stripe = MagicMock()
        mock_stripe.StripeError = Exception

        with patch.dict("sys.modules", {"stripe": mock_stripe}):
            from src.services.payment import StripePaymentProvider

            provider = StripePaymentProvider(secret_key="sk_test_123")
            provider._stripe = mock_stripe
            return provider

    @pytest.mark.asyncio
    async def test_create_charge_success(self, stripe_provider):
        mock_intent = MagicMock()
        mock_intent.id = "pi_123"
        mock_intent.client_secret = "pi_123_secret"
        mock_intent.status = "requires_payment_method"
        stripe_provider._stripe.PaymentIntent.create_async = AsyncMock(return_value=mock_intent)

        result = await stripe_provider.create_charge(amount=1180.0, currency="ILS", customer_id="cus_123")
        assert result["transaction_id"] == "pi_123"
        assert result["status"] == "requires_payment_method"

    @pytest.mark.asyncio
    async def test_create_charge_with_payment_method(self, stripe_provider):
        mock_intent = MagicMock()
        mock_intent.id = "pi_456"
        mock_intent.client_secret = None
        mock_intent.status = "succeeded"
        stripe_provider._stripe.PaymentIntent.create_async = AsyncMock(return_value=mock_intent)

        result = await stripe_provider.create_charge(
            amount=500.0, currency="ILS", customer_id="cus_456", metadata={"payment_method_id": "pm_abc"}
        )
        assert result["status"] == "succeeded"

    @pytest.mark.asyncio
    async def test_create_charge_stripe_error(self, stripe_provider):
        stripe_provider._stripe.StripeError = RuntimeError
        stripe_provider._stripe.PaymentIntent.create_async = AsyncMock(side_effect=RuntimeError("Card declined"))
        with pytest.raises(RuntimeError, match="Payment failed"):
            await stripe_provider.create_charge(100.0, "ILS", "cus_bad")

    @pytest.mark.asyncio
    async def test_refund_success(self, stripe_provider):
        mock_refund = MagicMock()
        mock_refund.id = "re_123"
        mock_refund.status = "succeeded"
        mock_refund.amount = 118000  # 1180 in agorot
        stripe_provider._stripe.Refund.create_async = AsyncMock(return_value=mock_refund)

        result = await stripe_provider.refund(transaction_id="pi_123", amount=1180.0)
        assert result["refund_id"] == "re_123"
        assert result["status"] == "succeeded"

    @pytest.mark.asyncio
    async def test_refund_stripe_error(self, stripe_provider):
        stripe_provider._stripe.StripeError = RuntimeError
        stripe_provider._stripe.Refund.create_async = AsyncMock(side_effect=RuntimeError("Already refunded"))
        with pytest.raises(RuntimeError, match="Refund failed"):
            await stripe_provider.refund("pi_bad")

    @pytest.mark.asyncio
    async def test_get_status_success(self, stripe_provider):
        mock_intent = MagicMock()
        mock_intent.id = "pi_789"
        mock_intent.status = "succeeded"
        mock_intent.amount = 118000
        mock_intent.currency = "ils"
        stripe_provider._stripe.PaymentIntent.retrieve_async = AsyncMock(return_value=mock_intent)

        result = await stripe_provider.get_status("pi_789")
        assert result["status"] == "succeeded"
        assert result["currency"] == "ILS"

    @pytest.mark.asyncio
    async def test_get_status_stripe_error(self, stripe_provider):
        stripe_provider._stripe.StripeError = RuntimeError
        stripe_provider._stripe.PaymentIntent.retrieve_async = AsyncMock(side_effect=RuntimeError("Not found"))
        with pytest.raises(RuntimeError, match="Status check failed"):
            await stripe_provider.get_status("pi_bad")

    @pytest.mark.asyncio
    async def test_create_customer_success(self, stripe_provider):
        mock_customer = MagicMock()
        mock_customer.id = "cus_new"
        stripe_provider._stripe.Customer.create_async = AsyncMock(return_value=mock_customer)

        customer_id = await stripe_provider.create_customer("user_1", "user@example.com")
        assert customer_id == "cus_new"

    @pytest.mark.asyncio
    async def test_create_customer_stripe_error(self, stripe_provider):
        stripe_provider._stripe.StripeError = RuntimeError
        stripe_provider._stripe.Customer.create_async = AsyncMock(side_effect=RuntimeError("Email invalid"))
        with pytest.raises(RuntimeError, match="Customer creation failed"):
            await stripe_provider.create_customer("u1", "bad@email")


class TestGetPaymentProvider:
    def setup_method(self):
        import src.services.payment as pay_mod

        pay_mod._payment_provider = None

    def teardown_method(self):
        import src.services.payment as pay_mod

        pay_mod._payment_provider = None

    def test_returns_mock_provider_when_configured(self):
        from src.services.payment import MockPaymentProvider, get_payment_provider

        with patch("src.config.settings.get_settings") as mock_settings:
            settings = MagicMock()
            settings.PAYMENT_PROVIDER = "mock"
            settings.ENVIRONMENT = "test"
            mock_settings.return_value = settings
            provider = get_payment_provider()
        assert isinstance(provider, MockPaymentProvider)

    def test_raises_for_unknown_provider(self):
        from src.services.payment import get_payment_provider

        with patch("src.config.settings.get_settings") as mock_settings:
            settings = MagicMock()
            settings.PAYMENT_PROVIDER = "unknown_provider"
            mock_settings.return_value = settings
            with pytest.raises(RuntimeError, match="Unknown PAYMENT_PROVIDER"):
                get_payment_provider()

    def test_returns_stripe_provider(self):
        from src.services.payment import StripePaymentProvider, get_payment_provider

        mock_stripe = MagicMock()
        mock_stripe.StripeError = Exception
        with (
            patch("src.config.settings.get_settings") as mock_settings,
            patch.dict("sys.modules", {"stripe": mock_stripe}),
        ):
            settings = MagicMock()
            settings.PAYMENT_PROVIDER = "stripe"
            settings.STRIPE_SECRET_KEY = "sk_test_key"
            mock_settings.return_value = settings
            provider = get_payment_provider()
        assert isinstance(provider, StripePaymentProvider)

    def test_stripe_raises_if_no_key(self):
        from src.services.payment import get_payment_provider

        with patch("src.config.settings.get_settings") as mock_settings:
            settings = MagicMock()
            settings.PAYMENT_PROVIDER = "stripe"
            settings.STRIPE_SECRET_KEY = ""
            mock_settings.return_value = settings
            with pytest.raises(RuntimeError, match="STRIPE_SECRET_KEY"):
                get_payment_provider()

    def test_mock_blocked_in_production(self):
        from src.services.payment import get_payment_provider

        with patch("src.config.settings.get_settings") as mock_settings:
            settings = MagicMock()
            settings.PAYMENT_PROVIDER = "mock"
            settings.ENVIRONMENT = "production"
            mock_settings.return_value = settings
            with pytest.raises(RuntimeError, match="not allowed in production"):
                get_payment_provider()


# ---------------------------------------------------------------------------
# src/agents/vetting.py — _analyze_documents with documents
# ---------------------------------------------------------------------------


class TestVettingAgentAnalysis:
    @pytest.fixture
    def vetting_agent(self):
        with (
            patch("src.agents.base.get_llm_client") as mock_llm,
            patch("src.agents.base.get_rag_pipeline"),
            patch("src.agents.vetting.get_postgres_client") as mock_db,
            patch("src.agents.vetting.get_graph_store") as mock_graph,
            patch("src.agents.vetting.get_settings") as mock_settings,
        ):
            mock_llm.return_value = AsyncMock()
            mock_db.return_value = AsyncMock()
            mock_graph.return_value = AsyncMock()
            mock_settings.return_value = MagicMock(VETTING_AGENT_MODE="autonomous")
            from src.agents.vetting import VettingAgent

            agent = VettingAgent()
            agent.llm_client = AsyncMock()
            return agent

    @pytest.mark.asyncio
    async def test_analyze_documents_no_docs_returns_failure(self, vetting_agent):
        result = await vetting_agent._analyze_documents([], "ctr_1")
        assert result["license_valid"] is False
        assert "No documents found" in result["issues"]

    @pytest.mark.asyncio
    async def test_analyze_documents_with_docs(self, vetting_agent):
        vetting_agent._call_llm_structured = AsyncMock(
            return_value={
                "license_valid": True,
                "insurance_valid": True,
                "certificates_valid": True,
                "issues": [],
                "recommendations": [],
            }
        )
        docs = [{"doc_type": "license", "extracted_text": "Valid license for plumbing"}]
        result = await vetting_agent._analyze_documents(docs, "ctr_1")
        assert result["license_valid"] is True

    @pytest.mark.asyncio
    async def test_analyze_documents_parse_error(self, vetting_agent):
        vetting_agent._call_llm_structured = AsyncMock(return_value={"parse_error": True})
        docs = [{"doc_type": "license", "extracted_text": "text"}]
        result = await vetting_agent._analyze_documents(docs, "ctr_1")
        assert result["license_valid"] is False
        assert "Document analysis failed" in result["issues"]

    @pytest.mark.asyncio
    async def test_get_documents_db_error(self, vetting_agent):
        vetting_agent._db.get_contractor_documents = AsyncMock(side_effect=Exception("DB"))
        result = await vetting_agent._get_documents("ctr_1")
        assert result == []

    @pytest.mark.asyncio
    async def test_analyze_reputation_graph_error(self, vetting_agent):
        vetting_agent._graph_store.get_contractor_reputation = AsyncMock(side_effect=Exception("Graph error"))
        vetting_agent._graph_store.detect_suspicious_patterns = AsyncMock(return_value={})
        vetting_agent.rag = None  # disable RAG to avoid AsyncMock issue
        result = await vetting_agent._analyze_reputation("ctr_1")
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_analyze_reputation_suspicious_error(self, vetting_agent):
        vetting_agent._graph_store.get_contractor_reputation = AsyncMock(return_value={})
        vetting_agent._graph_store.detect_suspicious_patterns = AsyncMock(side_effect=Exception("Graph error"))
        vetting_agent.rag = None
        result = await vetting_agent._analyze_reputation("ctr_1")
        assert isinstance(result, dict)
