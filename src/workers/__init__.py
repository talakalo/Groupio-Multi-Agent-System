"""Background workers for the Groupio Multi-Agent System.

``AgentWorker`` is re-exported lazily so that importing individual worker
modules (e.g. ``src.workers.worker_notifications``) does not pull in the full
LLM / agent stack. Before this change, every worker process and every unit
test of a single worker transitively imported ``redis``, ``tenacity`` and the
LangChain agents, which made tests brittle and worker startup slower than it
needed to be.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover - type checking only
    from .agent_worker import AgentWorker

__all__ = ["AgentWorker"]


def __getattr__(name: str) -> Any:
    if name == "AgentWorker":
        from .agent_worker import AgentWorker as _AgentWorker

        return _AgentWorker
    raise AttributeError(f"module 'src.workers' has no attribute {name!r}")
