"""Database clients for the Groupio Multi-Agent System.

Exports are lazy (PEP 562 ``__getattr__``) so importing a single database
client (e.g. ``src.databases.postgres`` in a narrow unit test) does not drag
in neo4j, qdrant and redis simultaneously. The public import surface is
unchanged: ``from src.databases import get_postgres_client`` still works.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover - type checking only
    from src.databases.graph_store import GraphStore, get_graph_store
    from src.databases.postgres import PostgresClient, get_postgres_client
    from src.databases.redis_client import RedisClient, get_redis_client
    from src.databases.vector_store import VectorStore, get_vector_store

__all__ = [
    "GraphStore",
    "PostgresClient",
    "RedisClient",
    "VectorStore",
    "get_graph_store",
    "get_postgres_client",
    "get_redis_client",
    "get_vector_store",
    # PineconeVectorStore is imported lazily inside get_vector_store() to avoid
    # a hard dependency on pinecone when VECTOR_DB_PROVIDER=qdrant (default).
]


_LAZY_IMPORTS: dict[str, tuple[str, str]] = {
    "GraphStore": ("src.databases.graph_store", "GraphStore"),
    "get_graph_store": ("src.databases.graph_store", "get_graph_store"),
    "PostgresClient": ("src.databases.postgres", "PostgresClient"),
    "get_postgres_client": ("src.databases.postgres", "get_postgres_client"),
    "RedisClient": ("src.databases.redis_client", "RedisClient"),
    "get_redis_client": ("src.databases.redis_client", "get_redis_client"),
    "VectorStore": ("src.databases.vector_store", "VectorStore"),
    "get_vector_store": ("src.databases.vector_store", "get_vector_store"),
}


def __getattr__(name: str) -> Any:
    target = _LAZY_IMPORTS.get(name)
    if target is None:
        raise AttributeError(f"module 'src.databases' has no attribute {name!r}")
    import importlib

    module = importlib.import_module(target[0])
    return getattr(module, target[1])
