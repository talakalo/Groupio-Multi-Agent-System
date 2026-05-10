"""Simple circuit breaker for gov data client.

States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (probing) → CLOSED

The breaker opens after `fail_threshold` consecutive failures.
After `cooldown_sec` it moves to HALF_OPEN and allows one probe request.
A successful probe resets it to CLOSED; a failed probe reopens it.
"""

from __future__ import annotations

import threading
import time
from enum import Enum


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when a call is rejected because the circuit is open."""


class CircuitBreaker:
    """Thread-safe circuit breaker.

    Args:
        fail_threshold: consecutive failures before opening.
        cooldown_sec: seconds to wait before allowing a probe.
        name: label for logging / metrics.
    """

    def __init__(self, fail_threshold: int = 5, cooldown_sec: float = 60.0, name: str = "gov") -> None:
        self._fail_threshold = fail_threshold
        self._cooldown_sec = cooldown_sec
        self.name = name
        self._state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    @property
    def state(self) -> CircuitState:
        with self._lock:
            return self._current_state()

    def _current_state(self) -> CircuitState:
        """Compute current state, transitioning OPEN → HALF_OPEN if cooldown elapsed."""
        if self._state == CircuitState.OPEN:
            if self._opened_at is not None and time.monotonic() - self._opened_at >= self._cooldown_sec:
                self._state = CircuitState.HALF_OPEN
        return self._state

    def allow_request(self) -> bool:
        """Return True if a request should proceed, False if the circuit is open."""
        with self._lock:
            state = self._current_state()
            return state != CircuitState.OPEN

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_at = None
            self._state = CircuitState.CLOSED

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._state == CircuitState.HALF_OPEN or self._failures >= self._fail_threshold:
                self._state = CircuitState.OPEN
                self._opened_at = time.monotonic()

    def reset(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_at = None
            self._state = CircuitState.CLOSED

    def __repr__(self) -> str:
        return f"CircuitBreaker(name={self.name!r}, state={self._state.value}, failures={self._failures})"
