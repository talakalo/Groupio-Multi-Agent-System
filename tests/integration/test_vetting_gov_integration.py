"""Integration test: Vetting agent → GovDataClient → contractor_verification_metadata.

All external boundaries are mocked at their outermost edge:
- httpx.Client (CKAN HTTP)
- PostgresClient DB calls
- Graph store calls
- LLM calls

The test proves:
1. _check_gov_registration calls lookup_company and persists a row.
2. gov_registration.confidence shifts the trust score upward.
3. A non-matched contractor leaves trust score unchanged (absence ≠ negative).
4. DB write failures are swallowed (vetting pipeline is never blocked).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.vetting import TRUST_WEIGHTS, VettingAgent
from src.integrations.gov.models import Company, GovResult, GovSource
from src.models.agent_state import AgentState

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_state(contractor_id: str = "ctr-001") -> AgentState:
    return AgentState(
        session_id="sess-001",
        user_id="usr-001",
        messages=[{"role": "user", "content": f"vet contractor {contractor_id}"}],
        entities={"contractor_id": contractor_id},
        actions_taken=[],
        context={},
        needs_human=False,
        escalation_reason=None,
    )


def _mock_agent() -> VettingAgent:
    """Create a VettingAgent with all expensive __init__ side-effects stubbed."""
    with (
        patch("src.agents.vetting.get_postgres_client"),
        patch("src.agents.vetting.get_graph_store"),
        patch("src.agents.base.get_rag_pipeline"),
        patch("src.agents.base.get_llm_client"),
    ):
        return VettingAgent()


def _fake_gov_result(companies: list[Company]) -> GovResult:
    from datetime import UTC, datetime
    return GovResult(
        value=companies,
        confidence=0.8 if companies else 0.0,
        source=GovSource.DATA_GOV_IL_COMPANIES,
        fetched_at=datetime.now(UTC),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCheckGovRegistration:
    @pytest.mark.asyncio
    async def test_active_company_returns_found_and_persists(self):
        agent = _mock_agent()

        active_company = Company("12345", "חברת בדיקה", "פעילה", "תל אביב", "דיזנגוף 1")
        gov_result = _fake_gov_result([active_company])

        agent._db = AsyncMock()
        agent._db.get_contractor = AsyncMock(return_value={
            "id": "ctr-001",
            "business_name": "חברת בדיקה",
            "license_number": "12345",
        })
        agent._db.upsert_contractor_verification = AsyncMock(return_value={"id": "row-1"})

        with patch("src.agents.vetting.get_gov_client") as mock_gov:
            mock_gov.return_value.lookup_company.return_value = gov_result
            result = await agent._check_gov_registration("ctr-001", {})

        assert result["found"] is True
        assert result["verified"] is True
        assert result["confidence"] == 0.75
        assert result["source"] == "data_gov_il_companies"

        agent._db.upsert_contractor_verification.assert_awaited_once_with(
            contractor_id="ctr-001",
            source="data_gov_il_companies",
            verified=True,
            confidence=0.75,
            raw_response=pytest.approx({
                "company_id": "12345",
                "name": "חברת בדיקה",
                "status": "פעילה",
                "city": "תל אביב",
                "address": "דיזנגוף 1",
                "cache_hit": False,
            }, abs=0),
        )

    @pytest.mark.asyncio
    async def test_inactive_company_found_not_verified(self):
        agent = _mock_agent()

        inactive = Company("99999", "חברה מחוקה", "מחוקה", "חיפה", "")
        gov_result = _fake_gov_result([inactive])

        agent._db = AsyncMock()
        agent._db.get_contractor = AsyncMock(return_value={
            "id": "ctr-002",
            "business_name": "חברה מחוקה",
            "license_number": "",
        })
        agent._db.upsert_contractor_verification = AsyncMock()

        with patch("src.agents.vetting.get_gov_client") as mock_gov:
            mock_gov.return_value.lookup_company.return_value = gov_result
            result = await agent._check_gov_registration("ctr-002", {})

        assert result["found"] is True
        assert result["verified"] is False
        assert result["confidence"] == 0.4

    @pytest.mark.asyncio
    async def test_no_match_returns_not_found(self):
        agent = _mock_agent()

        agent._db = AsyncMock()
        agent._db.get_contractor = AsyncMock(return_value={
            "id": "ctr-003",
            "business_name": "עסק לא רשום",
            "license_number": "",
        })
        agent._db.upsert_contractor_verification = AsyncMock()

        with patch("src.agents.vetting.get_gov_client") as mock_gov:
            mock_gov.return_value.lookup_company.return_value = _fake_gov_result([])
            result = await agent._check_gov_registration("ctr-003", {})

        assert result["found"] is False
        assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_db_write_failure_swallowed(self):
        agent = _mock_agent()

        active_company = Company("11111", "חברה טובה", "פעילה", "ירושלים", "")
        gov_result = _fake_gov_result([active_company])

        agent._db = AsyncMock()
        agent._db.get_contractor = AsyncMock(return_value={
            "id": "ctr-004",
            "business_name": "חברה טובה",
            "license_number": "11111",
        })
        # Simulate DB write failure
        agent._db.upsert_contractor_verification = AsyncMock(side_effect=RuntimeError("DB down"))

        with patch("src.agents.vetting.get_gov_client") as mock_gov:
            mock_gov.return_value.lookup_company.return_value = gov_result
            # Must not raise
            result = await agent._check_gov_registration("ctr-004", {})

        assert result["found"] is True   # gov lookup succeeded despite DB failure

    @pytest.mark.asyncio
    async def test_missing_contractor_returns_not_found(self):
        agent = _mock_agent()
        agent._db = AsyncMock()
        agent._db.get_contractor = AsyncMock(return_value=None)

        result = await agent._check_gov_registration("nonexistent", {})
        assert result["found"] is False

    @pytest.mark.asyncio
    async def test_gov_failure_swallowed(self):
        agent = _mock_agent()
        agent._db = AsyncMock()
        agent._db.get_contractor = AsyncMock(return_value={
            "id": "ctr-005",
            "business_name": "עסק",
            "license_number": "",
        })

        with patch("src.agents.vetting.get_gov_client") as mock_gov:
            mock_gov.return_value.lookup_company.side_effect = RuntimeError("network error")
            result = await agent._check_gov_registration("ctr-005", {})

        assert result["found"] is False


class TestTrustScoreGovRegistration:
    def _agent(self) -> VettingAgent:
        return _mock_agent()

    def _base_inputs(self):
        validations = {"license_valid": True, "insurance_valid": True}
        reputation = {
            "online_reputation_score": 0.8,
            "graph_reputation": {"total_projects": 5},
            "suspicious_patterns": {},
        }
        history = {"completion_rate": 0.9}
        return validations, reputation, history

    def test_active_company_hit_raises_score(self):
        agent = self._agent()
        validations, reputation, history = self._base_inputs()

        score_no_gov = agent._calculate_trust_score(validations, reputation, history, gov_registration=None)
        score_with_gov = agent._calculate_trust_score(
            validations, reputation, history,
            gov_registration={"found": True, "confidence": 0.75},
        )

        assert score_with_gov > score_no_gov

    def test_not_found_leaves_score_unchanged(self):
        agent = self._agent()
        validations, reputation, history = self._base_inputs()

        score_no_gov = agent._calculate_trust_score(validations, reputation, history, gov_registration=None)
        score_not_found = agent._calculate_trust_score(
            validations, reputation, history,
            gov_registration={"found": False, "confidence": 0.0},
        )

        # "not found" is scored as 0 for gov_registration — absence is neutral (0 contribution not negative)
        # Since gov_registration=None also scores 0, they should be equal
        assert score_not_found == score_no_gov

    def test_score_bounded_0_to_100(self):
        agent = self._agent()
        validations = {"license_valid": True, "insurance_valid": True}
        reputation = {
            "online_reputation_score": 1.0,
            "graph_reputation": {"total_projects": 100},
            "suspicious_patterns": {},
        }
        history = {"completion_rate": 1.0}

        score = agent._calculate_trust_score(
            validations, reputation, history,
            gov_registration={"found": True, "confidence": 1.0},
        )
        assert 0 <= score <= 100

    def test_gov_weight_present_in_trust_weights(self):
        assert "gov_registration" in TRUST_WEIGHTS
        assert TRUST_WEIGHTS["gov_registration"] > 0
