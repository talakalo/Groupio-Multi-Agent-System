"""Vetting Agent for contractor verification and trust scoring."""

import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent
from src.config.prompts.vetting import VETTING_SYSTEM_PROMPT
from src.databases.graph_store import get_graph_store
from src.databases.postgres import get_postgres_client
from src.models.agent_state import AgentState
from src.utils.monitoring import track_agent_execution

logger = logging.getLogger(__name__)

# Trust score thresholds
THRESHOLDS = {
    "auto_approve": 85,
    "manual_review_low": 50,
    "auto_reject": 50,
}

# Trust score weights
TRUST_WEIGHTS = {
    "license_valid": 25,
    "insurance_valid": 20,
    "years_in_business": 15,
    "online_reputation_score": 15,
    "completion_rate": 15,
    "response_rate": 10,
}

# Minimum insurance coverage (in ILS)
MIN_COVERAGE = 500_000


class VettingAgent(BaseAgent):
    """Contractor verification and trust scoring agent.

    Multi-step pipeline:
    1. Document extraction and analysis
    2. Credential validation
    3. Reputation analysis
    4. Trust score calculation
    5. Decision (approve/reject/review)
    """

    def __init__(self) -> None:
        config = AgentConfig(
            name="vetting",
            description="Verify contractor credentials and assess trust",
            system_prompt=VETTING_SYSTEM_PROMPT,
            tools=[
                "document_classifier",
                "check_license_api",
                "web_search",
                "calculate_trust_score",
            ],
            rag_enabled=True,
            temperature=0.2,
            max_tokens=2000,
        )
        super().__init__(config)
        self._db = get_postgres_client()
        self._graph_store = get_graph_store()

    @track_agent_execution("vetting")
    async def run(self, state: AgentState) -> AgentState:
        """Run the full vetting pipeline for a contractor."""
        self._get_last_user_message(state)

        # Extract contractor ID from state or message
        contractor_id = self._extract_contractor_id(state)

        if not contractor_id:
            state["actions_taken"] = [
                {
                    "agent": "vetting",
                    "action": "missing_contractor_id",
                    "response": {
                        "type": "error",
                        "message": "לא הצלחנו לזהות את הקבלן. אנא ספק מזהה קבלן.",
                    },
                    "requires_followup": False,
                    "summary_for_next_agent": "Contractor ID missing; asked user to provide it.",
                }
            ]
            return state

        # Step 1: Get contractor documents
        documents = await self._get_documents(contractor_id)

        # Step 2: Analyze documents via LLM
        doc_analysis = await self._analyze_documents(documents, contractor_id)

        # Step 3: Check reputation from graph and web
        reputation = await self._analyze_reputation(contractor_id)

        # Step 4: Get historical performance from graph
        history = await self._get_performance_history(contractor_id)

        # Step 5: Calculate trust score
        trust_score = self._calculate_trust_score(
            validations=doc_analysis,
            reputation=reputation,
            history=history,
        )

        # Step 6: Make decision
        decision = self._make_decision(trust_score)

        # Step 7: Generate report via LLM
        report = await self._generate_vetting_report(
            state=state,
            contractor_id=contractor_id,
            trust_score=trust_score,
            decision=decision,
            doc_analysis=doc_analysis,
            reputation=reputation,
            history=history,
        )

        state["actions_taken"] = [
            {
                "agent": "vetting",
                "action": f"vetting_{decision}",
                "details": {
                    "contractor_id": contractor_id,
                    "trust_score": trust_score,
                    "decision": decision,
                    "doc_analysis": doc_analysis,
                    "reputation": reputation,
                },
                "response": {
                    "type": "vetting_result",
                    "message": report,
                    "trust_score": trust_score,
                    "decision": decision,
                },
                "requires_followup": decision == "manual_review",
                "summary_for_next_agent": (
                    f"Vetting complete for contractor {contractor_id}: trust_score={trust_score}, decision={decision}."
                ),
                "entities_to_pass": {"contractor_id": contractor_id},
                "suggested_next_agent": "support" if decision == "manual_review" else "",
            }
        ]
        # Merge contractor_id into state entities for downstream agents
        state["entities"] = {**(state.get("entities") or {}), "contractor_id": contractor_id}

        if decision == "manual_review":
            state["needs_human"] = True
            state["escalation_reason"] = (
                f"Contractor {contractor_id} requires manual review (trust score: {trust_score})"
            )
            # Notify admin team about the pending manual review
            await self._notify_admin_vetting(contractor_id, trust_score, doc_analysis)

        self._metrics["calls"] += 1
        return state

    async def _get_documents(self, contractor_id: str) -> list[dict[str, Any]]:
        """Retrieve contractor documents from database."""
        try:
            return await self._db.get_contractor_documents(contractor_id)
        except Exception:
            logger.exception("Failed to get contractor documents")
            return []

    async def _analyze_documents(
        self,
        documents: list[dict[str, Any]],
        contractor_id: str,
    ) -> dict[str, Any]:
        """Analyze contractor documents using LLM."""
        if not documents:
            return {
                "license_valid": False,
                "insurance_valid": False,
                "certificates_valid": False,
                "issues": ["No documents found"],
            }

        docs_text = "\n".join(
            f"- Type: {doc.get('doc_type', 'unknown')}, Content: {doc.get('extracted_text', 'N/A')[:300]}"
            for doc in documents
        )

        result = await self._call_llm_structured(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analyze these contractor documents for "
                        f"contractor {contractor_id}:\n\n{docs_text}\n\n"
                        f"Check validity, completeness, and red flags."
                    ),
                }
            ],
            system=self.config.system_prompt,
            output_schema={
                "license_valid": "boolean",
                "insurance_valid": "boolean",
                "certificates_valid": "boolean",
                "issues": ["string"],
                "recommendations": ["string"],
            },
        )

        if result.get("parse_error"):
            return {
                "license_valid": False,
                "insurance_valid": False,
                "certificates_valid": False,
                "issues": ["Document analysis failed"],
            }

        return result

    async def _analyze_reputation(self, contractor_id: str) -> dict[str, Any]:
        """Analyze contractor reputation from graph and vector data."""
        # Graph-based reputation
        try:
            graph_rep = await self._graph_store.get_contractor_reputation(contractor_id)
        except Exception:
            logger.exception("Graph reputation query failed")
            graph_rep = {}

        # Check for suspicious patterns
        try:
            suspicious = await self._graph_store.detect_suspicious_patterns(contractor_id)
        except Exception:
            suspicious = {}

        # Vector search for similar contractors (benchmark)
        similar = await self._retrieve_context(
            query=f"contractor profile {contractor_id}",
            namespace="contractors",
            top_k=10,
            strategy="semantic",
        )

        return {
            "graph_reputation": graph_rep,
            "suspicious_patterns": suspicious,
            "benchmark_count": len(similar),
            "online_reputation_score": graph_rep.get("avg_review_rating", 0) / 5.0
            if graph_rep.get("avg_review_rating")
            else 0.5,
        }

    async def _get_performance_history(self, contractor_id: str) -> dict[str, Any]:
        """Get contractor performance history from graph."""
        try:
            history = await self._graph_store.get_contractor_building_history(contractor_id)
            total = len(history)
            successful = sum(1 for h in history if h.get("success_rate", 0) >= 0.8)
            return {
                "total_projects": total,
                "completion_rate": successful / total if total > 0 else 0,
                "recent_projects": history[:5],
            }
        except Exception:
            logger.exception("Failed to get performance history")
            return {"total_projects": 0, "completion_rate": 0, "recent_projects": []}

    def _calculate_trust_score(
        self,
        validations: dict[str, Any],
        reputation: dict[str, Any],
        history: dict[str, Any],
    ) -> float:
        """Calculate 0-100 trust score from all signals."""
        scores: dict[str, float] = {}

        # Document validations (0 or 1)
        scores["license_valid"] = 1.0 if validations.get("license_valid") else 0.0
        scores["insurance_valid"] = 1.0 if validations.get("insurance_valid") else 0.0

        # Reputation (0-1)
        scores["online_reputation_score"] = reputation.get("online_reputation_score", 0.5)

        # History (0-1)
        scores["completion_rate"] = history.get("completion_rate", 0.5)
        scores["response_rate"] = 0.5  # Default when we don't have data

        # Years in business (normalize: 0 years=0, 10+=1)
        years = reputation.get("graph_reputation", {}).get("total_projects", 0)
        scores["years_in_business"] = min(years / 10, 1.0)

        # Weighted sum
        total = sum(scores.get(key, 0.5) * weight for key, weight in TRUST_WEIGHTS.items())

        # Penalties for suspicious patterns
        suspicious = reputation.get("suspicious_patterns", {})
        if suspicious.get("suspicious"):
            total *= 0.7

        return round(min(max(total, 0), 100), 1)

    @staticmethod
    def _make_decision(trust_score: float) -> str:
        """Make vetting decision based on trust score."""
        if trust_score >= THRESHOLDS["auto_approve"]:
            return "approved"
        elif trust_score < THRESHOLDS["auto_reject"]:
            return "rejected"
        else:
            return "manual_review"

    async def _generate_vetting_report(
        self,
        state: AgentState,
        contractor_id: str,
        trust_score: float,
        decision: str,
        doc_analysis: dict[str, Any],
        reputation: dict[str, Any],
        history: dict[str, Any],
    ) -> str:
        """Generate a human-readable vetting report."""
        response = await self._call_llm(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Generate a vetting report for contractor {contractor_id}:\n\n"
                        f"Trust Score: {trust_score}/100\n"
                        f"Decision: {decision}\n\n"
                        f"Document Analysis: {doc_analysis}\n"
                        f"Reputation: {reputation}\n"
                        f"History: {history}\n\n"
                        f"Provide a concise summary with key findings."
                    ),
                }
            ],
            system=self.config.system_prompt,
        )
        content = response.get("content", [])
        return content[0].get("text", "") if content else ""

    def _extract_contractor_id(self, state: AgentState) -> str | None:
        """Extract contractor ID from state (entities, then actions_taken)."""
        entities = state.get("entities") or {}
        if entities.get("contractor_id"):
            return entities["contractor_id"]
        for action in state.get("actions_taken", []):
            e = action.get("entities_to_pass") or action.get("details", {}).get("entities", {})
            if e.get("contractor_id"):
                return e["contractor_id"]
        return None

    async def _notify_admin_vetting(self, contractor_id: str, trust_score: float, doc_analysis: dict[str, Any]) -> None:
        """Email admin team when a contractor requires manual vetting review."""
        try:
            from src.config.settings import get_settings
            from src.services.email import get_email_service

            settings = get_settings()
            admin_email = getattr(settings, "ADMIN_EMAIL", "") or ""
            if not admin_email:
                logger.info("ADMIN_EMAIL not configured; skipping vetting escalation email")
                return

            email_svc = get_email_service()
            issues = doc_analysis.get("issues", [])
            issues_html = "".join(f"<li>{i}</li>" for i in issues) if issues else "<li>לא זוהו בעיות ספציפיות</li>"
            html = (
                f"<div dir='ltr'>"
                f"<h2>Manual Vetting Review Required</h2>"
                f"<p>Contractor <strong>{contractor_id}</strong> scored "
                f"<strong>{trust_score}/100</strong> and requires manual review.</p>"
                f"<h3>Document Issues:</h3><ul>{issues_html}</ul>"
                f"<p>Please review in the admin dashboard.</p>"
                f"</div>"
            )
            await email_svc.send_email(
                to_email=admin_email,
                subject=f"[Groupio] Vetting Review Required — Contractor {contractor_id}",
                html_content=html,
            )
        except Exception as exc:
            logger.warning("Failed to send vetting escalation email: %s", exc)
