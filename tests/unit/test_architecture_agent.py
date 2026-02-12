"""Unit tests for the Architecture Agent."""

import json
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Break circular import chain before importing the agent module:
# src.agents.architecture → src.services.storage → src.services.__init__
# → src.services.whatsapp_bot → src.orchestration.graph → src.agents.architecture
sys.modules.setdefault("src.services.whatsapp_bot", MagicMock())

from src.agents.architecture import ArchitectureAgent  # noqa: E402


@pytest.fixture
def architecture_agent():
    """Create an ArchitectureAgent with mocked dependencies."""
    with (
        patch("src.agents.base.get_llm_client") as mock_llm,
        patch("src.agents.base.get_rag_pipeline") as mock_rag,
        patch("src.agents.architecture.get_postgres_client") as mock_pg,
        patch("src.agents.architecture.get_storage_service") as mock_storage,
    ):
        mock_llm.return_value = AsyncMock()
        mock_rag.return_value = AsyncMock()

        mock_db = AsyncMock()
        mock_pg.return_value = mock_db

        mock_storage_svc = AsyncMock()
        mock_storage.return_value = mock_storage_svc

        agent = ArchitectureAgent()
        agent.llm_client = AsyncMock()

        yield agent, mock_pg, mock_storage


@pytest.fixture
def architecture_state(sample_agent_state):
    """Create a state tailored for architecture tests."""
    state = dict(sample_agent_state)
    state["current_agent"] = "architecture"
    return state


# ------------------------------------------------------------------
# Happy-path: file analysis succeeds
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_with_file_id_success(architecture_agent, architecture_state):
    """State has architecture_file_id; analysis completes successfully."""
    agent, mock_pg, mock_storage = architecture_agent
    architecture_state["architecture_file_id"] = "file_001"

    mock_db = AsyncMock()
    mock_db.get_file_upload = AsyncMock(
        return_value={
            "id": "file_001",
            "bucket": "architecture-plans",
            "storage_path": "2026/01/plan.png",
            "analysis_status": "pending",
        }
    )
    mock_db.update_file_upload = AsyncMock()
    mock_pg.return_value = mock_db

    mock_storage_svc = AsyncMock()
    mock_storage_svc.get_signed_url = AsyncMock(
        return_value="https://storage.example.com/signed/plan.png"
    )
    mock_storage.return_value = mock_storage_svc

    analysis_result = json.dumps(
        {
            "rooms_detected": [
                {"name": "living_room", "area_sqm": 30},
                {"name": "bedroom", "area_sqm": 15},
            ],
            "total_area_sqm": 80,
            "suggestions": [
                {"category": "ac_installation", "description": "Install split AC"},
            ],
            "summary_he": "ניתוח הושלם – זוהו 2 חדרים",
            "summary_en": "Analysis complete – 2 rooms detected",
        }
    )

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": f"```json\n{analysis_result}\n```"}],
            "usage": {"input_tokens": 200, "output_tokens": 150},
        }
    )

    result = await agent.run(architecture_state)

    # Verify analysis_completed action
    assert len(result["actions_taken"]) == 1
    action = result["actions_taken"][0]
    assert action["agent"] == "architecture"
    assert action["action"] == "analysis_completed"
    assert action["details"]["file_id"] == "file_001"
    assert action["response"]["type"] == "architecture_analysis"
    assert len(action["response"]["analysis"]["rooms_detected"]) == 2

    # Verify status was updated twice (analyzing → completed)
    assert mock_db.update_file_upload.call_count == 2
    first_update = mock_db.update_file_upload.call_args_list[0]
    assert first_update[0][1] == {"analysis_status": "analyzing"}
    second_update = mock_db.update_file_upload.call_args_list[1]
    assert second_update[0][1]["analysis_status"] == "completed"


# ------------------------------------------------------------------
# File not found
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_file_not_found(architecture_agent, architecture_state):
    """State has architecture_file_id but db.get_file_upload returns None."""
    agent, mock_pg, _ = architecture_agent
    architecture_state["architecture_file_id"] = "file_missing"

    mock_db = AsyncMock()
    mock_db.get_file_upload = AsyncMock(return_value=None)
    mock_pg.return_value = mock_db

    result = await agent.run(architecture_state)

    assert len(result["actions_taken"]) == 1
    action = result["actions_taken"][0]
    assert action["action"] == "file_not_found"
    assert action["response"]["type"] == "error"


# ------------------------------------------------------------------
# Analysis failure (LLM exception)
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_analysis_failure(architecture_agent, architecture_state):
    """_call_llm raises exception → analysis_failed action, status set to 'failed'."""
    agent, mock_pg, mock_storage = architecture_agent
    architecture_state["architecture_file_id"] = "file_002"

    mock_db = AsyncMock()
    mock_db.get_file_upload = AsyncMock(
        return_value={
            "id": "file_002",
            "bucket": "architecture-plans",
            "storage_path": "2026/01/bad.png",
            "analysis_status": "pending",
        }
    )
    mock_db.update_file_upload = AsyncMock()
    mock_pg.return_value = mock_db

    mock_storage_svc = AsyncMock()
    mock_storage_svc.get_signed_url = AsyncMock(
        return_value="https://storage.example.com/signed/bad.png"
    )
    mock_storage.return_value = mock_storage_svc

    # Make the LLM call fail
    agent.llm_client.create_message = AsyncMock(
        side_effect=RuntimeError("Vision API unavailable")
    )

    result = await agent.run(architecture_state)

    assert len(result["actions_taken"]) == 1
    action = result["actions_taken"][0]
    assert action["action"] == "analysis_failed"
    assert action["response"]["type"] == "error"

    # Verify status was set to "failed"
    failed_call = mock_db.update_file_upload.call_args_list[-1]
    assert failed_call[0][1] == {"analysis_status": "failed"}


# ------------------------------------------------------------------
# No file_id → text query fallback
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_no_file_id_falls_back_to_text(architecture_agent, architecture_state):
    """State has no architecture_file_id → should call _handle_text_query."""
    agent, _, _ = architecture_agent

    # Ensure there is NO architecture_file_id
    architecture_state.pop("architecture_file_id", None)
    architecture_state["messages"] = [
        {"role": "user", "content": "אני רוצה לשפץ את הסלון"}
    ]

    agent.llm_client.create_structured_output = AsyncMock(
        return_value={
            "rooms_detected": [],
            "total_area_sqm": None,
            "suggestions": [
                {"category": "renovation", "description": "Living room renovation"}
            ],
            "summary_he": "המלצות לשיפוץ סלון",
        }
    )

    result = await agent.run(architecture_state)

    assert len(result["actions_taken"]) == 1
    action = result["actions_taken"][0]
    assert action["action"] == "text_analysis"
    assert action["response"]["type"] == "architecture_analysis"


# ------------------------------------------------------------------
# _analyse_image: successful JSON parsing
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyse_image_parses_json(architecture_agent, architecture_state):
    """_analyse_image with LLM returning ```json {...}``` parses correctly."""
    agent, _, mock_storage = architecture_agent

    mock_storage_svc = AsyncMock()
    mock_storage_svc.get_signed_url = AsyncMock(
        return_value="https://storage.example.com/signed/plan.png"
    )
    mock_storage.return_value = mock_storage_svc

    expected = {
        "rooms_detected": [{"name": "kitchen", "area_sqm": 12}],
        "total_area_sqm": 12,
        "suggestions": [],
        "summary_he": "מטבח בלבד",
        "summary_en": "Kitchen only",
    }

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [
                {"type": "text", "text": f"```json\n{json.dumps(expected)}\n```"}
            ],
            "usage": {"input_tokens": 100, "output_tokens": 80},
        }
    )

    record = {
        "id": "file_010",
        "bucket": "architecture-plans",
        "storage_path": "2026/01/kitchen.png",
    }

    result = await agent._analyse_image(record, architecture_state)

    assert result["rooms_detected"][0]["name"] == "kitchen"
    assert result["total_area_sqm"] == 12
    assert result["summary_he"] == "מטבח בלבד"


# ------------------------------------------------------------------
# _analyse_image: fallback on bad JSON
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyse_image_fallback_on_bad_json(architecture_agent, architecture_state):
    """LLM returns non-JSON → should return fallback structure."""
    agent, _, mock_storage = architecture_agent

    mock_storage_svc = AsyncMock()
    mock_storage_svc.get_signed_url = AsyncMock(
        return_value="https://storage.example.com/signed/plan.png"
    )
    mock_storage.return_value = mock_storage_svc

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": "This is a floor plan with two rooms and a kitchen",
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
    )

    record = {
        "id": "file_011",
        "bucket": "architecture-plans",
        "storage_path": "2026/01/unclear.png",
    }

    result = await agent._analyse_image(record, architecture_state)

    # Fallback structure
    assert result["rooms_detected"] == []
    assert result["total_area_sqm"] is None
    assert result["suggestions"] == []
    assert "floor plan" in result["summary_he"]


# ------------------------------------------------------------------
# Cross-references active offers
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_references_active_offers(architecture_agent, architecture_state):
    """After analysis, suggestions get matching_offers from active_offers in state."""
    agent, mock_pg, mock_storage = architecture_agent
    architecture_state["architecture_file_id"] = "file_003"
    architecture_state["building_id"] = "bld_001"
    architecture_state["active_offers"] = [
        {"id": "offer_ac_1", "category": "ac_installation"},
        {"id": "offer_ac_2", "category": "ac_installation"},
        {"id": "offer_kitchen", "category": "kitchen_renovation"},
    ]

    mock_db = AsyncMock()
    mock_db.get_file_upload = AsyncMock(
        return_value={
            "id": "file_003",
            "bucket": "architecture-plans",
            "storage_path": "2026/01/full.png",
            "analysis_status": "pending",
        }
    )
    mock_db.update_file_upload = AsyncMock()
    mock_pg.return_value = mock_db

    mock_storage_svc = AsyncMock()
    mock_storage_svc.get_signed_url = AsyncMock(
        return_value="https://storage.example.com/signed/full.png"
    )
    mock_storage.return_value = mock_storage_svc

    analysis_json = json.dumps(
        {
            "rooms_detected": [{"name": "living_room", "area_sqm": 30}],
            "total_area_sqm": 80,
            "suggestions": [
                {"category": "ac_installation", "description": "Install ACs"},
                {"category": "plumbing", "description": "Fix pipes"},
            ],
            "summary_he": "ניתוח הושלם",
            "summary_en": "Analysis complete",
        }
    )

    agent.llm_client.create_message = AsyncMock(
        return_value={
            "content": [{"type": "text", "text": f"```json\n{analysis_json}\n```"}],
            "usage": {"input_tokens": 200, "output_tokens": 150},
        }
    )

    result = await agent.run(architecture_state)

    action = result["actions_taken"][0]
    analysis = action["response"]["analysis"]
    suggestions = analysis["suggestions"]

    # ac_installation suggestion should have 2 matching offers
    ac_suggestion = [s for s in suggestions if s["category"] == "ac_installation"][0]
    assert ac_suggestion["matching_offers"] == ["offer_ac_1", "offer_ac_2"]

    # plumbing suggestion should have 0 matching offers
    plumbing_suggestion = [s for s in suggestions if s["category"] == "plumbing"][0]
    assert plumbing_suggestion["matching_offers"] == []
