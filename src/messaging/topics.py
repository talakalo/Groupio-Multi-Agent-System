"""Routing keys for topic exchange ``groupio.events`` (version in envelope, not in key)."""

# --- Notifications ---
RK_NOTIFICATIONS_SEND_REQUESTED: str = "notifications.send_requested"

# --- CRM projection ---
RK_CRM_CONTRACTOR_REGISTERED: str = "crm.contractor.registered"
RK_CRM_CONTRACTOR_STATUS_CHANGED: str = "crm.contractor.status_changed"
RK_CRM_CONTRACTOR_DOCUMENTS_SUBMITTED: str = "crm.contractor.documents_submitted"
RK_CRM_BUILDING_CREATED: str = "crm.building.created"
RK_CRM_BUILDING_ACTIVATED: str = "crm.building.activated"
RK_CRM_ESCALATION_CREATED: str = "crm.escalation.created"

# --- Payments (derived / side-effects only) ---
RK_PAYMENTS_SUCCEEDED: str = "payments.succeeded"
RK_PAYMENTS_FAILED: str = "payments.failed"
RK_PAYMENTS_REFUND_PROCESSED: str = "payments.refund_processed"
RK_INVOICES_CREATED: str = "invoices.created"
