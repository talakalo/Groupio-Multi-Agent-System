"""Unit tests for src.integrations.gov.cache."""

import time

from src.integrations.gov.cache import InMemoryCacheBackend, cache_key


class TestInMemoryCacheBackend:
    def test_get_miss_returns_none(self):
        c = InMemoryCacheBackend()
        assert c.get("missing") is None

    def test_set_and_get(self):
        c = InMemoryCacheBackend()
        c.set("k", b"value", ttl=60)
        assert c.get("k") == b"value"

    def test_expired_entry_returns_none(self):
        c = InMemoryCacheBackend()
        c.set("k", b"v", ttl=0)
        # ttl=0 means already expired
        time.sleep(0.01)
        assert c.get("k") is None

    def test_delete_removes_entry(self):
        c = InMemoryCacheBackend()
        c.set("k", b"v", ttl=60)
        c.delete("k")
        assert c.get("k") is None

    def test_delete_missing_is_noop(self):
        c = InMemoryCacheBackend()
        c.delete("nonexistent")  # must not raise

    def test_clear_removes_all(self):
        c = InMemoryCacheBackend()
        c.set("a", b"1", ttl=60)
        c.set("b", b"2", ttl=60)
        c.clear()
        assert c.size() == 0

    def test_size(self):
        c = InMemoryCacheBackend()
        c.set("a", b"1", ttl=60)
        c.set("b", b"2", ttl=60)
        assert c.size() == 2

    def test_overwrite(self):
        c = InMemoryCacheBackend()
        c.set("k", b"v1", ttl=60)
        c.set("k", b"v2", ttl=60)
        assert c.get("k") == b"v2"


class TestCacheKey:
    def test_deterministic(self):
        k1 = cache_key("companies", name="test", limit=5)
        k2 = cache_key("companies", name="test", limit=5)
        assert k1 == k2

    def test_different_params_different_keys(self):
        k1 = cache_key("companies", name="a")
        k2 = cache_key("companies", name="b")
        assert k1 != k2

    def test_different_source_different_keys(self):
        k1 = cache_key("companies", name="a")
        k2 = cache_key("settlements", name="a")
        assert k1 != k2

    def test_key_has_gov_prefix(self):
        k = cache_key("companies", name="test")
        assert k.startswith("gov:companies:")

    def test_param_order_independent(self):
        k1 = cache_key("x", a=1, b=2)
        k2 = cache_key("x", b=2, a=1)
        assert k1 == k2
