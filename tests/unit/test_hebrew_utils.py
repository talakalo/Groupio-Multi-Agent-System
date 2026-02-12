"""Unit tests for Hebrew text processing utilities."""

from src.utils.hebrew_utils import (
    detect_language,
    detect_legal_keywords,
    extract_phone_number,
    is_hebrew,
    normalize_hebrew,
    remove_stopwords,
    translate_category,
    translate_region,
)


def test_is_hebrew():
    """Test Hebrew character detection."""
    assert is_hebrew("שלום") is True
    assert is_hebrew("Hello") is False
    assert is_hebrew("שלום Hello") is True
    assert is_hebrew("") is False


def test_detect_language_hebrew():
    """Test language detection for Hebrew text."""
    assert detect_language("אני מחפש קבלן מזגנים") == "he"
    assert detect_language("שלום, מה שלומך?") == "he"


def test_detect_language_english():
    """Test language detection for English text."""
    assert detect_language("I need an AC installer") == "en"
    assert detect_language("Hello, how are you?") == "en"


def test_detect_language_mixed():
    """Test language detection for mixed text."""
    # More Hebrew than English
    assert detect_language("שלום, אני מחפש contractor") == "he"


def test_normalize_hebrew():
    """Test Hebrew text normalization."""
    # Should remove nikud
    text_with_nikud = "שָׁלוֹם"
    normalized = normalize_hebrew(text_with_nikud)
    assert "ָ" not in normalized

    # Should normalize whitespace
    assert normalize_hebrew("  hello   world  ") == "hello world"


def test_remove_stopwords():
    """Test Hebrew stopword removal."""
    text = "אני מחפש את הקבלן של הבניין"
    result = remove_stopwords(text)
    assert "את" not in result.split()
    assert "של" not in result.split()
    assert "מחפש" in result


def test_extract_phone_number():
    """Test Israeli phone number extraction."""
    assert extract_phone_number("Call me at 050-1234567") == "0501234567"
    assert extract_phone_number("0521234567") == "0521234567"
    assert extract_phone_number("+972-50-1234567") == "0501234567"
    assert extract_phone_number("no phone here") is None


def test_translate_category():
    """Test category translation."""
    assert translate_category("ac_installation", "he") == "התקנת מזגנים"
    assert translate_category("kitchen", "he") == "מטבחים"
    assert translate_category("התקנת מזגנים", "en") == "ac_installation"
    assert translate_category("unknown_cat", "he") == "unknown_cat"


def test_translate_region():
    """Test region translation."""
    assert translate_region("center", "he") == "מרכז"
    assert translate_region("tel_aviv", "he") == "תל אביב"
    assert translate_region("מרכז", "en") == "center"


def test_detect_legal_keywords_hebrew():
    """Test legal keyword detection in Hebrew."""
    assert detect_legal_keywords("אני הולך לעורך דין") is True
    assert detect_legal_keywords("אני אגיש תביעה") is True
    assert detect_legal_keywords("שלום, מה שלומך") is False


def test_detect_legal_keywords_english():
    """Test legal keyword detection in English."""
    assert detect_legal_keywords("I will sue you") is True
    assert detect_legal_keywords("My lawyer will contact you") is True
    assert detect_legal_keywords("Thank you for the help") is False
