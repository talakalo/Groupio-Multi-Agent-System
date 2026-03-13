"""Payment Agent – handles payment queries, invoice generation, and refund requests."""

import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.payment import PAYMENT_SYSTEM_PROMPT
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Sub-intent keywords used for simple classification
_PAYMENT_STATUS_KEYWORDS = [
    "תשלום",
    "שילמתי",
    "סטטוס",
    "status",
    "payment",
    "paid",
    "שולם",
    "ממתין",
    "pending",
    "processing",
    "עיבוד",
]
_INVOICE_KEYWORDS = [
    "חשבונית",
    "invoice",
    "קבלה",
    "receipt",
    "הפקה",
    "הורדה",
    "download",
]
_REFUND_KEYWORDS = [
    "החזר",
    "refund",
    "ביטול",
    "cancel",
    "זיכוי",
    "credit",
]


def _detect_sub_intent(message: str) -> str:
    """Detect payment sub-intent from the user message text."""
    lower = message.lower()

    for kw in _REFUND_KEYWORDS:
        if kw in lower:
            return "refund_request"

    for kw in _INVOICE_KEYWORDS:
        if kw in lower:
            return "invoice_request"

    for kw in _PAYMENT_STATUS_KEYWORDS:
        if kw in lower:
            return "payment_status"

    return "general"


class PaymentAgent(BaseAgent):
    """Handles payment queries and invoice generation for Groupio users."""

    def __init__(self) -> None:
        config = AgentConfig(
            name="payment",
            description="Handle payment queries and invoice generation",
            system_prompt=PAYMENT_SYSTEM_PROMPT,
            temperature=0.5,
            max_tokens=2000,
            rag_enabled=False,
        )
        super().__init__(config)

    @track_agent_execution("payment")
    async def run(self, state: AgentState) -> AgentState:
        """Route to the appropriate sub-handler based on payment sub-intent."""
        user_message = self._get_last_user_message(state)
        sub_intent = _detect_sub_intent(user_message)
        user_id = state.get("user_id", "")

        logger.info(
            "PaymentAgent: sub_intent=%s user=%s",
            sub_intent,
            user_id,
        )

        if sub_intent == "payment_status":
            return await self._handle_payment_status(state, user_id, user_message)
        elif sub_intent == "invoice_request":
            return await self._handle_invoice_request(state, user_id, user_message)
        elif sub_intent == "refund_request":
            return await self._handle_refund_request(state, user_id, user_message)
        else:
            return await self._handle_general(state, user_message)

    # ------------------------------------------------------------------
    # Sub-handlers
    # ------------------------------------------------------------------

    async def _handle_payment_status(self, state: AgentState, user_id: str, user_message: str) -> AgentState:
        """Check and report the user's payment status."""
        db = get_postgres_client()
        payments = await db.list_payments_for_user(user_id)

        # Build context for the LLM
        payment_summary = self._summarise_payments(payments)
        system_prompt = self._build_system_prompt(state)

        result = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (f"{user_message}\n\n--- Payment Data ---\n{payment_summary}"),
                }
            ],
            system=system_prompt,
        )

        response_text = self._extract_text(result)

        state["actions_taken"] = [
            {
                "agent": "payment",
                "action": "payment_status_check",
                "details": {"payments_found": len(payments)},
                "response": {
                    "type": "payment_status",
                    "message": response_text,
                    "payments": payments,
                },
                "requires_followup": False,
                "summary_for_next_agent": f"Reported payment status; {len(payments)} payment(s) found.",
            }
        ]
        return state

    async def _handle_invoice_request(self, state: AgentState, user_id: str, user_message: str) -> AgentState:
        """Get or generate an invoice for an offer."""
        db = get_postgres_client()
        await db.list_payments_for_user(user_id)

        # Find the most relevant offer_id from state or payments
        offer_id = None
        for entity_key in ("offer_id",):
            if state.get(entity_key):
                offer_id = state[entity_key]
                break

        invoice = None
        if offer_id:
            invoice = await db.get_invoice_for_offer(user_id, offer_id)

        system_prompt = self._build_system_prompt(state)

        invoice_info = (
            f"Invoice found: {invoice}"
            if invoice
            else "No invoice found for this offer. The user may need to initiate payment first."
        )

        result = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (f"{user_message}\n\n--- Invoice Data ---\n{invoice_info}"),
                }
            ],
            system=system_prompt,
        )

        response_text = self._extract_text(result)

        state["actions_taken"] = [
            {
                "agent": "payment",
                "action": "invoice_request",
                "details": {
                    "offer_id": offer_id,
                    "invoice_found": invoice is not None,
                },
                "response": {
                    "type": "invoice_info",
                    "message": response_text,
                    "invoice": invoice,
                },
                "requires_followup": False,
                "summary_for_next_agent": (
                    f"Invoice {'found' if invoice else 'not found'} for offer {offer_id or 'N/A'}."
                ),
                "entities_to_pass": {"offer_id": offer_id} if offer_id else {},
            }
        ]
        return state

    async def _handle_refund_request(self, state: AgentState, user_id: str, user_message: str) -> AgentState:
        """Handle refund requests — attempt automatic refund, escalate only if unresolvable."""
        db = get_postgres_client()
        refund_result: dict[str, Any] | None = None
        refund_error: str | None = None

        # Try to find a refundable payment for this user
        try:
            payments = await db.list_payments_for_user(user_id)
            # Pick the most recent succeeded payment that hasn't been refunded
            candidate = next(
                (p for p in payments if p.get("status") == "succeeded"),
                None,
            )
            if candidate:
                from src.services.payment import get_payment_provider

                provider = get_payment_provider()
                transaction_id = candidate.get("transaction_id") or candidate.get("id")
                result = await provider.refund(transaction_id=transaction_id, amount=candidate.get("amount"))
                await db.update_payment(candidate["id"], {"status": result.get("status", "refunded")})
                invoice_id = candidate.get("invoice_id")
                if invoice_id:
                    await db.update_invoice(invoice_id, {"status": "refunded"})
                refund_result = result
                logger.info(
                    "Payment agent auto-refund: user=%s payment=%s refund_id=%s",
                    user_id,
                    candidate["id"],
                    result.get("refund_id"),
                )
        except Exception as exc:
            refund_error = str(exc)
            logger.warning("Payment agent: auto-refund failed for user %s: %s", user_id, exc)

        system_prompt = self._build_system_prompt(state)
        if refund_result:
            llm_note = (
                f"{user_message}\n\n--- Note ---\n"
                f"The refund has been processed automatically. "
                f"Refund ID: {refund_result.get('refund_id', 'N/A')}. "
                "Please confirm the refund to the user in Hebrew."
            )
        else:
            llm_note = (
                f"{user_message}\n\n--- Note ---\n"
                "The refund could not be processed automatically"
                + (f" ({refund_error})" if refund_error else "")
                + ". A human support agent will handle this. Please inform the user."
            )

        result_llm = await self._call_llm(
            messages=[{"role": "user", "content": llm_note}],
            system=system_prompt,
        )
        response_text = self._extract_text(result_llm)

        if refund_result:
            state["actions_taken"] = [
                {
                    "agent": "payment",
                    "action": "refund_processed",
                    "details": {"user_id": user_id, **refund_result},
                    "response": {"type": "refund_confirmation", "message": response_text},
                    "requires_followup": False,
                    "summary_for_next_agent": f"Refund processed: {refund_result.get('refund_id')}",
                }
            ]
        else:
            state["needs_human"] = True
            state["escalation_reason"] = "refund_request"
            state["actions_taken"] = [
                {
                    "agent": "payment",
                    "action": "refund_escalated",
                    "details": {"user_id": user_id, "error": refund_error},
                    "response": {"type": "refund_escalation", "message": response_text},
                    "requires_followup": True,
                    "summary_for_next_agent": "Refund could not be processed automatically; escalated to support.",
                    "suggested_next_agent": "support",
                }
            ]
        return state

    async def _handle_general(self, state: AgentState, user_message: str) -> AgentState:
        """Provide general payment information."""
        system_prompt = self._build_system_prompt(state)

        result = await self._call_llm(
            messages=[{"role": "user", "content": user_message}],
            system=system_prompt,
        )

        response_text = self._extract_text(result)

        state["actions_taken"] = [
            {
                "agent": "payment",
                "action": "general_payment_info",
                "response": {
                    "type": "payment_info",
                    "message": response_text,
                },
                "requires_followup": False,
                "summary_for_next_agent": "Provided general payment information.",
            }
        ]
        return state

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _summarise_payments(payments: list[dict[str, Any]]) -> str:
        """Create a concise text summary of the user's payments."""
        if not payments:
            return "No payments found for this user."

        lines: list[str] = []
        for p in payments:
            lines.append(
                f"- Payment {p.get('id', '?')[:8]}...: "
                f"₪{p.get('amount', 0):,.2f} | "
                f"status={p.get('status', 'unknown')} | "
                f"offer={p.get('offer_id', 'N/A')[:8]}... | "
                f"date={p.get('created_at', 'N/A')}"
            )
        return "\n".join(lines)

    @staticmethod
    def _extract_text(llm_result: dict[str, Any]) -> str:
        """Extract plain text from an LLM response."""
        content = llm_result.get("content", "")
        if isinstance(content, list):
            return " ".join(block.get("text", "") for block in content if block.get("type") == "text")
        return str(content)
