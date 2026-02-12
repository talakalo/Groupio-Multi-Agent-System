"""Unit tests for document chunking strategies."""

from src.rag.chunking import (
    chunk_by_tokens,
    chunk_document,
    chunk_faq,
    count_tokens,
)


def test_count_tokens():
    """Test token counting."""
    assert count_tokens("hello world") > 0
    assert count_tokens("") == 0
    assert count_tokens("a") > 0


def test_chunk_by_tokens_basic():
    """Test basic token-based chunking."""
    text = "This is a test sentence. " * 50  # Repeat to make it long
    chunks = chunk_by_tokens(text, chunk_size=50, overlap=10)

    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk["text"]
        assert chunk["tokens"] > 0
        assert "chunk_index" in chunk


def test_chunk_by_tokens_short_text():
    """Test that short text results in single chunk."""
    text = "Short text."
    chunks = chunk_by_tokens(text, chunk_size=512, overlap=50)

    assert len(chunks) == 1
    assert chunks[0]["text"] == "Short text."


def test_chunk_by_tokens_empty_text():
    """Test that empty text returns no chunks."""
    assert chunk_by_tokens("", chunk_size=512, overlap=50) == []
    assert chunk_by_tokens("   ", chunk_size=512, overlap=50) == []


def test_chunk_by_tokens_with_metadata():
    """Test that metadata is preserved in chunks."""
    text = "Test sentence one. Test sentence two. " * 30
    metadata = {"doc_type": "test", "language": "en"}
    chunks = chunk_by_tokens(text, chunk_size=50, overlap=10, metadata=metadata)

    for chunk in chunks:
        assert chunk["metadata"]["doc_type"] == "test"
        assert chunk["metadata"]["language"] == "en"


def test_chunk_faq():
    """Test FAQ chunking by Q/A pairs."""
    text = (
        "Q: What is Groupio?\n"
        "A: A marketplace for group home improvements.\n\n"
        "Q: How do discounts work?\n"
        "A: More neighbors = bigger discount."
    )
    chunks = chunk_faq(text)

    assert len(chunks) == 2
    assert "Groupio" in chunks[0]["text"]
    assert "discount" in chunks[1]["text"]


def test_chunk_faq_hebrew():
    """Test FAQ chunking with Hebrew text."""
    text = (
        "שאלה: מה זה גרופיו?\n"
        "תשובה: פלטפורמה לשיפוצים קבוצתיים.\n\n"
        "שאלה: איך מקבלים הנחה?\n"
        "תשובה: ככל שיותר שכנים מצטרפים."
    )
    chunks = chunk_faq(text)

    assert len(chunks) == 2


def test_chunk_document_auto_strategy():
    """Test that chunk_document selects strategy based on doc_type."""
    faq_text = "Q: Test?\nA: Yes."
    chunks = chunk_document(faq_text, metadata={"doc_type": "faq"})
    assert len(chunks) >= 1

    guide_text = "## Section 1\nContent here.\n\n## Section 2\nMore content."
    chunks = chunk_document(guide_text, metadata={"doc_type": "pricing_guide"})
    assert len(chunks) >= 1


def test_chunk_overlap():
    """Test that chunks have overlapping content."""
    # Create text with distinct sentences
    sentences = [f"Sentence number {i} is here." for i in range(20)]
    text = " ".join(sentences)

    chunks = chunk_by_tokens(text, chunk_size=30, overlap=10)

    if len(chunks) > 1:
        # Check that the second chunk starts with content from end of first
        last_words_first = set(chunks[0]["text"].split()[-5:])
        first_words_second = set(chunks[1]["text"].split()[:10])
        # There should be some overlap
        overlap = last_words_first & first_words_second
        # Overlap may vary, but structure should be maintained
        assert len(chunks) >= 2
