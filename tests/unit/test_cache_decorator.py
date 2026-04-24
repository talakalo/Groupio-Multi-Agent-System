"""Unit tests for the reusable async Redis TTL cache decorator."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.databases.cache import cached


class _FakeRedis:
    """Minimal RedisClient stand-in that mirrors cache_get/cache_set."""

    def __init__(self) -> None:
        self.store: dict[str, object] = {}
        self.get_calls = 0
        self.set_calls = 0

    async def cache_get(self, key: str) -> object | None:
        self.get_calls += 1
        return self.store.get(key)

    async def cache_set(self, key: str, value: object, ttl: int = 3600) -> None:
        self.set_calls += 1
        self.last_ttl = ttl
        self.store[key] = value


@pytest.fixture
def fake_redis():
    fake = _FakeRedis()
    with patch("src.databases.redis_client.get_redis_client", return_value=fake):
        yield fake


@pytest.mark.asyncio
async def test_cached_miss_then_hit_calls_func_once(fake_redis):
    calls = {"n": 0}

    @cached(prefix="t", ttl=60)
    async def compute(x: int) -> int:
        calls["n"] += 1
        return x * 2

    assert await compute(5) == 10  # miss
    assert await compute(5) == 10  # hit
    assert calls["n"] == 1
    assert fake_redis.set_calls == 1


@pytest.mark.asyncio
async def test_cached_different_args_produce_different_keys(fake_redis):
    calls = {"n": 0}

    @cached(prefix="t", ttl=60)
    async def compute(x: int) -> int:
        calls["n"] += 1
        return x + 1

    await compute(1)
    await compute(2)
    await compute(1)
    assert calls["n"] == 2  # only two unique inputs
    assert len(fake_redis.store) == 2


@pytest.mark.asyncio
async def test_cached_uses_custom_key_fn(fake_redis):
    calls = {"n": 0}

    @cached(prefix="t", ttl=60, key_fn=lambda x, y: f"{x}")
    async def compute(x: int, y: int) -> int:
        calls["n"] += 1
        return x + y

    # Same x, different y — key_fn ignores y, so second call is a hit
    assert await compute(1, 10) == 11
    assert await compute(1, 99) == 11  # cached value returned, y ignored
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_cached_passes_ttl_to_redis(fake_redis):
    @cached(prefix="t", ttl=42)
    async def compute() -> int:
        return 7

    await compute()
    assert fake_redis.last_ttl == 42


@pytest.mark.asyncio
async def test_cached_does_not_cache_none(fake_redis):
    calls = {"n": 0}

    @cached(prefix="t", ttl=60)
    async def compute() -> None:
        calls["n"] += 1
        return None

    await compute()
    await compute()
    assert calls["n"] == 2  # None is not memoized
    assert fake_redis.set_calls == 0


@pytest.mark.asyncio
async def test_cached_falls_through_on_redis_failure():
    calls = {"n": 0}
    broken = MagicMock()
    broken.cache_get = AsyncMock(side_effect=ConnectionError("redis down"))
    broken.cache_set = AsyncMock(side_effect=ConnectionError("redis down"))

    with patch("src.databases.redis_client.get_redis_client", return_value=broken):

        @cached(prefix="t", ttl=60)
        async def compute(x: int) -> int:
            calls["n"] += 1
            return x * 3

        # Both calls should succeed and hit the underlying function — cache is bypassed
        assert await compute(2) == 6
        assert await compute(2) == 6
        assert calls["n"] == 2


@pytest.mark.asyncio
async def test_cached_key_includes_prefix(fake_redis):
    @cached(prefix="mycache", ttl=60)
    async def compute() -> int:
        return 1

    await compute()
    (key,) = fake_redis.store.keys()
    assert key.startswith("mycache:")


@pytest.mark.asyncio
async def test_embedding_client_uses_cache(fake_redis):
    """EmbeddingClient.embed_text should hit the cache on the second call."""
    import src.rag.embeddings as embeddings_mod

    # Stub out AsyncOpenAI + settings so we can instantiate EmbeddingClient
    mock_settings = MagicMock()
    mock_settings.OPENAI_API_KEY = "test"
    mock_settings.EMBEDDING_MODEL = "text-embedding-3-small"
    mock_settings.EMBEDDING_DIMENSIONS = 1536

    mock_openai_response = MagicMock()
    mock_openai_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]

    with patch.object(embeddings_mod, "get_settings", return_value=mock_settings):
        with patch.object(embeddings_mod, "AsyncOpenAI") as mock_openai_cls:
            mock_client = MagicMock()
            mock_client.embeddings.create = AsyncMock(return_value=mock_openai_response)
            mock_openai_cls.return_value = mock_client

            client = embeddings_mod.EmbeddingClient()
            first = await client.embed_text("hello")
            second = await client.embed_text("hello")

    assert first == [0.1, 0.2, 0.3]
    assert second == [0.1, 0.2, 0.3]
    # Upstream API was called exactly once — the second call was served from cache
    assert mock_client.embeddings.create.await_count == 1


@pytest.mark.asyncio
async def test_embedding_cache_key_separates_model_and_dimensions(fake_redis):
    """Different model/dimensions must not collide on the same input text."""
    import src.rag.embeddings as embeddings_mod

    def make_client(model: str, dims: int, vector: list[float]):
        mock_settings = MagicMock()
        mock_settings.OPENAI_API_KEY = "test"
        mock_settings.EMBEDDING_MODEL = model
        mock_settings.EMBEDDING_DIMENSIONS = dims
        mock_openai_response = MagicMock()
        mock_openai_response.data = [MagicMock(embedding=vector)]

        with patch.object(embeddings_mod, "get_settings", return_value=mock_settings):
            with patch.object(embeddings_mod, "AsyncOpenAI") as mock_openai_cls:
                mock_client = MagicMock()
                mock_client.embeddings.create = AsyncMock(return_value=mock_openai_response)
                mock_openai_cls.return_value = mock_client
                return embeddings_mod.EmbeddingClient(), mock_client

    client_a, _ = make_client("model-a", 512, [0.1, 0.2])
    result_a = await client_a.embed_text("same text")

    client_b, upstream_b = make_client("model-b", 1024, [0.9, 0.8])
    result_b = await client_b.embed_text("same text")

    assert result_a == [0.1, 0.2]
    assert result_b == [0.9, 0.8]
    # client_b still had to call upstream because its cache key differs
    assert upstream_b.embeddings.create.await_count == 1
