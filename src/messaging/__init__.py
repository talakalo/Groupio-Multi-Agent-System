"""RabbitMQ messaging primitives (exchange, publishers, workers).

Safe when disabled: feature flags default off; API startup does not require a broker.
"""

from src.messaging.connection import connect_rabbitmq_robust

__all__ = ["connect_rabbitmq_robust"]
