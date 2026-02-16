"""Unit tests for the LLM client wrapper."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.utils.llm_client import LLMClient

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def mock_anthropic_response():
    """Build a fake Anthropic API response object."""

    def _build(text: str = "Hello", input_tokens: int = 10, output_tokens: int = 5):
        text_block = MagicMock()
        text_block.type = "text"
        text_block.text = text

        usage = MagicMock()
        usage.input_tokens = input_tokens
        usage.output_tokens = output_tokens

        response = MagicMock()
        response.content = [text_block]
        response.model = "claude-sonnet-4-20250514"
        response.stop_reason = "end_turn"
        response.usage = usage
        return response

    return _build


@pytest.fixture
def llm_client():
    """Create an LLMClient with a mocked Anthropic SDK client."""
    with patch("src.utils.llm_client.get_settings") as mock_settings:
        settings = MagicMock()
        settings.ANTHROPIC_API_KEY = "test-key"
        settings.PRIMARY_MODEL = "claude-sonnet-4-20250514"
        settings.MAX_TOKENS = 1024
        settings.TEMPERATURE = 0.7
        mock_settings.return_value = settings

        client = LLMClient()
        client._client = AsyncMock()
        return client


# ------------------------------------------------------------------
# create_message
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_message_returns_formatted_response(llm_client, mock_anthropic_response):
    """create_message should return a dict with content/model/usage keys."""
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("Test response"))

    result = await llm_client.create_message(messages=[{"role": "user", "content": "Hi"}])

    assert "content" in result
    assert "model" in result
    assert "usage" in result
    assert result["content"][0]["type"] == "text"
    assert result["content"][0]["text"] == "Test response"
    assert result["model"] == "claude-sonnet-4-20250514"
    assert result["usage"]["input_tokens"] == 10
    assert result["usage"]["output_tokens"] == 5


@pytest.mark.asyncio
async def test_create_message_includes_system_prompt(llm_client, mock_anthropic_response):
    """When a system prompt is provided it should be forwarded to the API."""
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("OK"))

    await llm_client.create_message(
        messages=[{"role": "user", "content": "Hi"}],
        system="You are a helpful assistant.",
    )

    call_kwargs = llm_client._client.messages.create.call_args.kwargs
    assert call_kwargs["system"] == "You are a helpful assistant."


@pytest.mark.asyncio
async def test_create_message_includes_tools(llm_client, mock_anthropic_response):
    """When tools are provided they should be forwarded to the API."""
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("OK"))

    tools = [{"name": "search", "description": "Search tool", "input_schema": {}}]
    await llm_client.create_message(
        messages=[{"role": "user", "content": "Hi"}],
        tools=tools,
    )

    call_kwargs = llm_client._client.messages.create.call_args.kwargs
    assert call_kwargs["tools"] == tools


# ------------------------------------------------------------------
# create_structured_output
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_structured_output_parses_json(llm_client, mock_anthropic_response):
    """create_structured_output should parse a clean JSON response."""
    llm_client._client.messages.create = AsyncMock(
        return_value=mock_anthropic_response('{"intent": "search", "confidence": 0.9}')
    )

    result = await llm_client.create_structured_output(
        messages=[{"role": "user", "content": "Find contractors"}],
    )

    assert result == {"intent": "search", "confidence": 0.9}


@pytest.mark.asyncio
async def test_create_structured_output_extracts_json_from_text(llm_client, mock_anthropic_response):
    """When the response has extra text around JSON, it should still be extracted."""
    llm_client._client.messages.create = AsyncMock(
        return_value=mock_anthropic_response('Here is the result:\n{"intent": "search", "confidence": 0.9}\nDone.')
    )

    result = await llm_client.create_structured_output(
        messages=[{"role": "user", "content": "Find contractors"}],
    )

    assert result == {"intent": "search", "confidence": 0.9}


@pytest.mark.asyncio
async def test_create_structured_output_returns_parse_error_on_invalid_json(llm_client, mock_anthropic_response):
    """When the response cannot be parsed as JSON, return parse_error dict."""
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("this is not json at all"))

    result = await llm_client.create_structured_output(
        messages=[{"role": "user", "content": "Something"}],
    )

    assert result["parse_error"] is True
    assert "raw_response" in result


# ------------------------------------------------------------------
# analyze_sentiment
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_sentiment_returns_float(llm_client, mock_anthropic_response):
    """analyze_sentiment should return a float sentiment score."""
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("0.75"))

    score = await llm_client.analyze_sentiment("Great service!")

    assert isinstance(score, float)
    assert score == 0.75


@pytest.mark.asyncio
async def test_analyze_sentiment_clamps_to_range(llm_client, mock_anthropic_response):
    """Values outside -1 to 1 should be clamped."""
    # Test clamping from above
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("2.5"))
    score = await llm_client.analyze_sentiment("Amazing!")
    assert score == 1.0

    # Test clamping from below
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("-3.0"))
    score = await llm_client.analyze_sentiment("Terrible!")
    assert score == -1.0


@pytest.mark.asyncio
async def test_analyze_sentiment_returns_zero_on_parse_error(llm_client, mock_anthropic_response):
    """When the LLM returns non-numeric text, default to 0.0."""
    llm_client._client.messages.create = AsyncMock(return_value=mock_anthropic_response("I cannot determine sentiment"))

    score = await llm_client.analyze_sentiment("Some text")

    assert score == 0.0


# ------------------------------------------------------------------
# _extract_text
# ------------------------------------------------------------------


def test_extract_text_from_content_blocks():
    """_extract_text should return the text from the first text block."""
    response = {
        "content": [
            {"type": "text", "text": "Hello world"},
            {"type": "text", "text": "Second block"},
        ],
        "model": "claude-sonnet-4-20250514",
    }
    assert LLMClient._extract_text(response) == "Hello world"


def test_extract_text_returns_empty_for_no_text_blocks():
    """_extract_text should return empty string when no text blocks exist."""
    response_no_text = {
        "content": [
            {"type": "tool_use", "id": "tool_1", "name": "search", "input": {}},
        ],
        "model": "claude-sonnet-4-20250514",
    }
    assert LLMClient._extract_text(response_no_text) == ""

    response_empty = {"content": [], "model": "claude-sonnet-4-20250514"}
    assert LLMClient._extract_text(response_empty) == ""

    response_missing = {"model": "claude-sonnet-4-20250514"}
    assert LLMClient._extract_text(response_missing) == ""


# ------------------------------------------------------------------
# get_llm_client singleton
# ------------------------------------------------------------------


def test_get_llm_client_returns_singleton():
    """get_llm_client should return the same instance on repeated calls."""
    with patch("src.utils.llm_client.get_settings") as mock_settings:
        settings = MagicMock()
        settings.ANTHROPIC_API_KEY = "test-key"
        settings.PRIMARY_MODEL = "claude-sonnet-4-20250514"
        settings.MAX_TOKENS = 1024
        settings.TEMPERATURE = 0.7
        mock_settings.return_value = settings

        # Reset the module-level singleton
        import src.utils.llm_client as llm_mod

        llm_mod._llm_client = None

        client1 = llm_mod.get_llm_client()
        client2 = llm_mod.get_llm_client()

        assert client1 is client2

        # Clean up
        llm_mod._llm_client = None
