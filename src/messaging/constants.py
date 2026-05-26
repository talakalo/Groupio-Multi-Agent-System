"""Static defaults for messaging (override via Settings)."""

# Topic exchange for all domain events (must match RABBITMQ_EXCHANGE_EVENTS default).
DEFAULT_EXCHANGE_EVENTS: str = "groupio.events"

# Queue names (incrementally bound by workers / topology).
QUEUE_NOTIFICATIONS_DISPATCH: str = "notifications.dispatch"
QUEUE_NOTIFICATIONS_RETRY: str = "notifications.retry"
QUEUE_NOTIFICATIONS_DLQ: str = "notifications.dlq"

QUEUE_CRM_SYNC: str = "crm.sync"
QUEUE_CRM_RETRY: str = "crm.retry"
QUEUE_CRM_DLQ: str = "crm.dlq"

QUEUE_PAYMENTS_EVENTS: str = "payments.events"
QUEUE_PAYMENTS_RETRY: str = "payments.retry"
QUEUE_PAYMENTS_DLQ: str = "payments.dlq"

QUEUE_CONTRACTOR_VERIFICATION: str = "contractor.verification"
QUEUE_CONTRACTOR_VERIFICATION_RETRY: str = "contractor.verification.retry"
QUEUE_CONTRACTOR_VERIFICATION_DLQ: str = "contractor.verification.dlq"

# Fanout dead-letter helper exchanges (per domain).
DLX_NOTIFICATIONS: str = "groupio.notifications.dlx"
DLX_CRM: str = "groupio.crm.dlx"
DLX_PAYMENTS: str = "groupio.payments.dlx"
DLX_CONTRACTOR_VERIFICATION: str = "groupio.contractor.verification.dlx"
