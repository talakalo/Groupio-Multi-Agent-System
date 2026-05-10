"""Unit tests for src.integrations.gov.circuit.CircuitBreaker."""

import time

from src.integrations.gov.circuit import CircuitBreaker, CircuitState


class TestCircuitBreaker:
    def test_initial_state_closed(self):
        cb = CircuitBreaker(fail_threshold=3, cooldown_sec=60)
        assert cb.state == CircuitState.CLOSED

    def test_allow_request_when_closed(self):
        cb = CircuitBreaker(fail_threshold=3)
        assert cb.allow_request() is True

    def test_opens_after_threshold_failures(self):
        cb = CircuitBreaker(fail_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_rejects_when_open(self):
        cb = CircuitBreaker(fail_threshold=1)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.allow_request() is False

    def test_transitions_to_half_open_after_cooldown(self):
        cb = CircuitBreaker(fail_threshold=1, cooldown_sec=0.05)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        time.sleep(0.1)
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_allows_one_request(self):
        cb = CircuitBreaker(fail_threshold=1, cooldown_sec=0.05)
        cb.record_failure()
        time.sleep(0.1)
        assert cb.allow_request() is True

    def test_success_in_half_open_resets_to_closed(self):
        cb = CircuitBreaker(fail_threshold=1, cooldown_sec=0.05)
        cb.record_failure()
        time.sleep(0.1)
        cb.record_success()
        assert cb.state == CircuitState.CLOSED

    def test_failure_in_half_open_reopens(self):
        cb = CircuitBreaker(fail_threshold=1, cooldown_sec=0.05)
        cb.record_failure()
        time.sleep(0.1)
        assert cb.state == CircuitState.HALF_OPEN
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_success_resets_failure_count(self):
        cb = CircuitBreaker(fail_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        cb.record_failure()
        # After reset, one failure doesn't open it
        assert cb.state == CircuitState.CLOSED

    def test_reset(self):
        cb = CircuitBreaker(fail_threshold=1)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        cb.reset()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True

    def test_repr(self):
        cb = CircuitBreaker(fail_threshold=5, name="test")
        assert "test" in repr(cb)
        assert "closed" in repr(cb)
