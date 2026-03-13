"""Targeted tests to boost coverage for modules that had 0% or low coverage."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# src/models/contractors.py  (compatibility shim)
# ---------------------------------------------------------------------------


class TestContractorsShim:
    def test_imports_contractor(self):
        from src.models.contractors import Contractor
        assert Contractor is not None

    def test_imports_contractor_base(self):
        from src.models.contractors import ContractorBase
        assert ContractorBase is not None

    def test_imports_contractor_create(self):
        from src.models.contractors import ContractorCreate
        assert ContractorCreate is not None

    def test_imports_contractor_document(self):
        from src.models.contractors import ContractorDocument
        assert ContractorDocument is not None

    def test_imports_contractor_match(self):
        from src.models.contractors import ContractorMatch
        assert ContractorMatch is not None

    def test_imports_vetting_result(self):
        from src.models.contractors import VettingResult
        assert VettingResult is not None


# ---------------------------------------------------------------------------
# src/models/offers.py  (compatibility shim)
# ---------------------------------------------------------------------------


class TestOffersShim:
    def test_imports_offer(self):
        from src.models.offers import Offer
        assert Offer is not None

    def test_imports_offer_base(self):
        from src.models.offers import OfferBase
        assert OfferBase is not None

    def test_imports_offer_create(self):
        from src.models.offers import OfferCreate
        assert OfferCreate is not None

    def test_imports_pricing_tier(self):
        from src.models.offers import PricingTier
        assert PricingTier is not None

    def test_imports_seasonality_factors(self):
        from src.models.offers import SEASONALITY_FACTORS
        assert isinstance(SEASONALITY_FACTORS, dict)

    def test_imports_completed_offer(self):
        from src.models.offers import CompletedOffer
        assert CompletedOffer is not None


# ---------------------------------------------------------------------------
# src/services/__init__.py  (lazy __getattr__ for WhatsApp)
# ---------------------------------------------------------------------------


class TestServicesInit:
    def test_getattr_whatsapp_bot_service(self):
        import src.services as services_mod
        cls = services_mod.__getattr__("WhatsAppBotService")
        assert cls is not None

    def test_getattr_get_whatsapp_bot(self):
        import src.services as services_mod
        fn = services_mod.__getattr__("get_whatsapp_bot")
        assert callable(fn)

    def test_getattr_unknown_raises(self):
        import src.services as services_mod
        with pytest.raises(AttributeError, match="has no attribute"):
            services_mod.__getattr__("NonExistentName")


# ---------------------------------------------------------------------------
# src/rag/embeddings.py
# ---------------------------------------------------------------------------


class TestEmbeddingClient:
    @pytest.fixture
    def client(self):
        with patch("src.rag.embeddings.get_settings") as mock_settings, \
             patch("src.rag.embeddings.AsyncOpenAI"):
            settings = MagicMock()
            settings.OPENAI_API_KEY = "test-key"
            settings.EMBEDDING_MODEL = "text-embedding-3-small"
            settings.EMBEDDING_DIMENSIONS = 1536
            mock_settings.return_value = settings
            from src.rag.embeddings import EmbeddingClient
            c = EmbeddingClient()
            yield c

    @pytest.mark.asyncio
    async def test_embed_text(self, client):
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
        client._client.embeddings.create = AsyncMock(return_value=mock_response)

        result = await client.embed_text("hello world")
        assert result == [0.1, 0.2, 0.3]

    @pytest.mark.asyncio
    async def test_embed_batch(self, client):
        mock_response = MagicMock()
        mock_response.data = [
            MagicMock(embedding=[0.1]),
            MagicMock(embedding=[0.2]),
        ]
        client._client.embeddings.create = AsyncMock(return_value=mock_response)

        result = await client.embed_batch(["a", "b"])
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_embed_query(self, client):
        client.embed_text = AsyncMock(return_value=[0.5])
        result = await client.embed_query("query text")
        assert result == [0.5]
        client.embed_text.assert_awaited_once_with("query text")

    @pytest.mark.asyncio
    async def test_embed_documents(self, client):
        client.embed_batch = AsyncMock(return_value=[[0.1], [0.2]])
        docs = [{"text": "doc1"}, {"text": "doc2"}]
        result = await client.embed_documents(docs)
        assert result == [[0.1], [0.2]]
        client.embed_batch.assert_awaited_once_with(["doc1", "doc2"])

    @pytest.mark.asyncio
    async def test_embed_batch_empty(self, client):
        mock_response = MagicMock()
        mock_response.data = []
        client._client.embeddings.create = AsyncMock(return_value=mock_response)

        result = await client.embed_batch([])
        assert result == []


class TestGetEmbeddingClient:
    def test_singleton(self):
        import src.rag.embeddings as emb_mod
        emb_mod._embedding_client = None
        with patch("src.rag.embeddings.get_settings") as mock_settings, \
             patch("src.rag.embeddings.AsyncOpenAI"):
            mock_settings.return_value = MagicMock(
                OPENAI_API_KEY="k", EMBEDDING_MODEL="m", EMBEDDING_DIMENSIONS=512
            )
            from src.rag.embeddings import get_embedding_client
            c1 = get_embedding_client()
            c2 = get_embedding_client()
            assert c1 is c2
        emb_mod._embedding_client = None


# ---------------------------------------------------------------------------
# src/workers/agent_worker.py  — connect/disconnect/stop/main
# ---------------------------------------------------------------------------


class TestAgentWorkerLifecycle:
    @pytest.fixture
    def worker(self):
        with patch("src.workers.agent_worker.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(REDIS_URL="redis://localhost:6379")
            from src.workers.agent_worker import AgentWorker
            return AgentWorker()

    @pytest.mark.asyncio
    async def test_connect(self, worker):
        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock()
        with patch("src.workers.agent_worker.redis.from_url", return_value=mock_redis), \
             patch("src.workers.agent_worker.RouterAgent") as mock_router:
            mock_router.return_value = MagicMock()
            await worker.connect()
            mock_redis.ping.assert_awaited_once()
            assert worker.router_agent is not None

    @pytest.mark.asyncio
    async def test_disconnect_with_client(self, worker):
        mock_redis = AsyncMock()
        worker.redis_client = mock_redis
        await worker.disconnect()
        mock_redis.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_disconnect_without_client(self, worker):
        worker.redis_client = None
        await worker.disconnect()  # should not raise

    def test_stop(self, worker):
        worker.running = True
        worker.stop()
        assert worker.running is False

    @pytest.mark.asyncio
    async def test_main_function(self):
        with patch("src.workers.agent_worker.get_settings") as mock_settings, \
             patch("src.workers.agent_worker.AgentWorker") as mock_worker_cls:
            mock_settings.return_value = MagicMock(REDIS_URL="redis://localhost")
            mock_worker = AsyncMock()
            mock_worker.connect = AsyncMock()
            mock_worker.run = AsyncMock()
            mock_worker.disconnect = AsyncMock()
            mock_worker_cls.return_value = mock_worker

            with patch("src.workers.agent_worker.signal.signal"):
                from src.workers.agent_worker import main
                await main()

            mock_worker.connect.assert_awaited_once()
            mock_worker.run.assert_awaited_once()
            mock_worker.disconnect.assert_awaited_once()


# ---------------------------------------------------------------------------
# src/workers/scheduler.py  — scheduler tasks
# ---------------------------------------------------------------------------


class TestSchedulerTasks:
    @pytest.mark.asyncio
    async def test_recalculate_trust_scores(self):
        mock_db = AsyncMock()
        mock_db.list_contractors = AsyncMock(
            return_value=([{"id": "c1"}, {"id": "c2"}], 2)
        )
        mock_db.update_contractor_rating = AsyncMock()

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db):
            from src.workers.scheduler import recalculate_trust_scores
            await recalculate_trust_scores()
            assert mock_db.update_contractor_rating.await_count == 2

    @pytest.mark.asyncio
    async def test_recalculate_trust_scores_partial_failure(self):
        mock_db = AsyncMock()
        mock_db.list_contractors = AsyncMock(return_value=([{"id": "c1"}], 1))
        mock_db.update_contractor_rating = AsyncMock(side_effect=Exception("DB error"))

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db):
            from src.workers.scheduler import recalculate_trust_scores
            await recalculate_trust_scores()  # should not raise

    @pytest.mark.asyncio
    async def test_cleanup_stale_conversations(self):
        with patch("src.workers.scheduler.get_redis_client") as mock_redis:
            from src.workers.scheduler import cleanup_stale_conversations
            await cleanup_stale_conversations()
            mock_redis.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_daily_analytics(self):
        mock_db = AsyncMock()
        mock_db.list_offers = AsyncMock(return_value=([], 5))
        mock_db.list_contractors = AsyncMock(return_value=([], 3))
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock()

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db), \
             patch("src.workers.scheduler.get_redis_client", return_value=mock_redis):
            from src.workers.scheduler import generate_daily_analytics
            await generate_daily_analytics()
            mock_redis.set.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_generate_daily_analytics_failure(self):
        mock_db = AsyncMock()
        mock_db.list_offers = AsyncMock(side_effect=Exception("DB error"))

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db), \
             patch("src.workers.scheduler.get_redis_client"):
            from src.workers.scheduler import generate_daily_analytics
            await generate_daily_analytics()  # should not raise

    @pytest.mark.asyncio
    async def test_refresh_building_similarity_no_regions(self):
        mock_db = AsyncMock()
        mock_db.get_distinct_regions = AsyncMock(return_value=[])
        mock_graph = AsyncMock()
        mock_graph.compute_and_store_similarity_edges = AsyncMock(return_value=10)

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db), \
             patch("src.workers.scheduler.get_graph_store", return_value=mock_graph, create=True):
            from src.workers.scheduler import refresh_building_similarity
            with patch("src.databases.graph_store.get_graph_store", return_value=mock_graph, create=True):
                await refresh_building_similarity()

    @pytest.mark.asyncio
    async def test_refresh_building_similarity_with_regions(self):
        mock_db = AsyncMock()
        mock_db.get_distinct_regions = AsyncMock(return_value=["center", "north"])
        mock_graph = AsyncMock()
        mock_graph.compute_and_store_similarity_edges = AsyncMock(return_value=5)

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db):
            with patch("src.databases.graph_store.get_graph_store", return_value=mock_graph, create=True):
                from src.workers.scheduler import refresh_building_similarity
                await refresh_building_similarity()

    @pytest.mark.asyncio
    async def test_refresh_influencer_scores(self):
        mock_db = AsyncMock()
        mock_db.get_distinct_cities = AsyncMock(return_value=["tel-aviv", "haifa"])
        mock_graph = AsyncMock()
        mock_graph.refresh_influence_scores_for_city = AsyncMock(return_value=3)

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db):
            with patch("src.databases.graph_store.get_graph_store", return_value=mock_graph, create=True):
                from src.workers.scheduler import refresh_influencer_scores
                await refresh_influencer_scores()
            assert mock_graph.refresh_influence_scores_for_city.await_count == 2

    @pytest.mark.asyncio
    async def test_refresh_influencer_scores_city_failure(self):
        mock_db = AsyncMock()
        mock_db.get_distinct_cities = AsyncMock(return_value=["tel-aviv"])
        mock_graph = AsyncMock()
        mock_graph.refresh_influence_scores_for_city = AsyncMock(side_effect=Exception("err"))

        with patch("src.workers.scheduler.get_postgres_client", return_value=mock_db):
            with patch("src.databases.graph_store.get_graph_store", return_value=mock_graph, create=True):
                from src.workers.scheduler import refresh_influencer_scores
                await refresh_influencer_scores()  # should not raise


# ---------------------------------------------------------------------------
# src/agents/analytics.py  — NLToSQL + AnalyticsAgent
# ---------------------------------------------------------------------------


class TestNLToSQL:
    @pytest.fixture
    def nl_to_sql(self):
        with patch("src.agents.analytics.get_postgres_client"), \
             patch("src.agents.base.get_llm_client"), \
             patch("src.agents.base.get_rag_pipeline"):
            from src.agents.analytics import NLToSQL
            llm = AsyncMock()
            return NLToSQL(llm)

    @pytest.mark.asyncio
    async def test_generate_sql_success(self, nl_to_sql):
        nl_to_sql._llm.create_message = AsyncMock(return_value={
            "content": [{"text": "SELECT * FROM offers WHERE status = 'active'"}]
        })
        sql = await nl_to_sql.generate_sql("Show active offers")
        assert "SELECT" in sql

    @pytest.mark.asyncio
    async def test_generate_sql_strips_markdown(self, nl_to_sql):
        nl_to_sql._llm.create_message = AsyncMock(return_value={
            "content": [{"text": "```sql\nSELECT id FROM offers\n```"}]
        })
        sql = await nl_to_sql.generate_sql("list offer ids")
        assert "```" not in sql
        assert "SELECT" in sql

    @pytest.mark.asyncio
    async def test_generate_sql_invalid_raises(self, nl_to_sql):
        nl_to_sql._llm.create_message = AsyncMock(return_value={
            "content": [{"text": "DROP TABLE offers"}]
        })
        with pytest.raises(ValueError, match="Invalid SQL"):
            await nl_to_sql.generate_sql("delete everything")

    @pytest.mark.asyncio
    async def test_generate_sql_empty_content(self, nl_to_sql):
        nl_to_sql._llm.create_message = AsyncMock(return_value={"content": []})
        with pytest.raises(ValueError):
            await nl_to_sql.generate_sql("what?")
