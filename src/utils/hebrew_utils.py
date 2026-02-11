"""Hebrew text processing utilities."""

import re
import unicodedata


# Hebrew character range
_HEBREW_RANGE = re.compile(r"[\u0590-\u05FF]")

# Hebrew stopwords (common words to filter in keyword search)
HEBREW_STOPWORDS = {
    "של",
    "את",
    "הוא",
    "היא",
    "זה",
    "זו",
    "אני",
    "הם",
    "הן",
    "אנחנו",
    "אתה",
    "את",
    "לא",
    "כן",
    "על",
    "עם",
    "גם",
    "או",
    "אם",
    "כי",
    "אבל",
    "רק",
    "כל",
    "מה",
    "מי",
    "איך",
    "למה",
    "כמה",
    "מתי",
    "איפה",
    "שם",
    "פה",
    "יש",
    "אין",
    "עוד",
    "בין",
    "בגלל",
    "לפני",
    "אחרי",
    "עד",
    "מן",
    "אל",
}

# Category names mapping (English -> Hebrew)
CATEGORY_NAMES_HE = {
    "ac_installation": "התקנת מזגנים",
    "ac_maintenance": "תחזוקת מזגנים",
    "kitchen": "מטבחים",
    "electrical": "חשמל",
    "plumbing": "אינסטלציה",
    "heating": "חימום",
    "renovations": "שיפוצים",
    "painting": "צביעה",
    "flooring": "ריצוף",
    "windows": "חלונות",
}

# Region names mapping
REGION_NAMES_HE = {
    "center": "מרכז",
    "tel_aviv": "תל אביב",
    "jerusalem": "ירושלים",
    "haifa": "חיפה",
    "north": "צפון",
    "south": "דרום",
    "sharon": "שרון",
    "shfela": "שפלה",
}


def is_hebrew(text: str) -> bool:
    """Check if text contains Hebrew characters."""
    return bool(_HEBREW_RANGE.search(text))


def detect_language(text: str) -> str:
    """Detect if text is primarily Hebrew or English.

    Returns 'he' for Hebrew, 'en' for English.
    """
    hebrew_chars = len(_HEBREW_RANGE.findall(text))
    total_alpha = sum(1 for c in text if unicodedata.category(c).startswith("L"))

    if total_alpha == 0:
        return "he"  # Default to Hebrew for the Israeli market

    return "he" if hebrew_chars / total_alpha > 0.3 else "en"


def normalize_hebrew(text: str) -> str:
    """Normalize Hebrew text for consistent processing.

    - Removes nikud (vowel marks)
    - Normalizes whitespace
    - Strips non-text characters
    """
    # Remove nikud (Hebrew vowel marks: U+05B0 to U+05BD, U+05BF, U+05C1, U+05C2)
    text = re.sub(r"[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]", "", text)

    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


def remove_stopwords(text: str) -> str:
    """Remove Hebrew stopwords from text."""
    words = text.split()
    return " ".join(w for w in words if w not in HEBREW_STOPWORDS)


def extract_phone_number(text: str) -> str | None:
    """Extract Israeli phone number from text.

    Handles formats: 050-1234567, 0501234567, +972-50-1234567, etc.
    """
    patterns = [
        r"\+972[-\s]?(\d{1,2})[-\s]?(\d{7})",
        r"0(\d{1,2})[-\s]?(\d{7})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            groups = match.groups()
            return f"0{groups[0]}{groups[1]}"

    return None


def translate_category(category: str, to_lang: str = "he") -> str:
    """Translate category name between Hebrew and English."""
    if to_lang == "he":
        return CATEGORY_NAMES_HE.get(category, category)
    else:
        # Reverse lookup
        en_map = {v: k for k, v in CATEGORY_NAMES_HE.items()}
        return en_map.get(category, category)


def translate_region(region: str, to_lang: str = "he") -> str:
    """Translate region name between Hebrew and English."""
    if to_lang == "he":
        return REGION_NAMES_HE.get(region, region)
    else:
        en_map = {v: k for k, v in REGION_NAMES_HE.items()}
        return en_map.get(region, region)


def detect_legal_keywords(text: str) -> bool:
    """Detect if text contains legal threat keywords in Hebrew or English."""
    legal_keywords_he = [
        "עורך דין",
        "תביעה",
        "בית משפט",
        "משפטי",
        "נזיקין",
        "פיצויים",
        "חוק",
        "תלונה",
        "משטרה",
        "רשות",
    ]
    legal_keywords_en = [
        "lawyer",
        "lawsuit",
        "court",
        "legal action",
        "sue",
        "attorney",
        "compensation",
        "police",
        "complaint",
    ]

    text_lower = text.lower()
    all_keywords = legal_keywords_he + legal_keywords_en
    return any(kw in text_lower for kw in all_keywords)
