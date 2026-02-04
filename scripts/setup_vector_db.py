"""Initialize Qdrant collections and seed knowledge base data."""

import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config.settings import get_settings
from src.databases.vector_store import VectorStore
from src.rag.chunking import chunk_document
from src.rag.embeddings import EmbeddingClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Sample FAQ documents for knowledge base seeding
FAQ_DOCUMENTS = [
    {
        "text": (
            "Q: מה זה גרופיו?\n"
            "A: גרופיו היא פלטפורמה ישראלית שמחברת בין דיירי בניינים לקבלנים מאומתים "
            "לביצוע שיפוצים ועבודות תחזוקה בהנחות קבוצתיות. ככל שיותר שכנים מצטרפים, "
            "ההנחה גדלה."
        ),
        "metadata": {
            "doc_type": "faq",
            "category": "general",
            "language": "he",
        },
    },
    {
        "text": (
            "Q: איך עובדת ההנחה הקבוצתית?\n"
            "A: מערכת ההנחות מבוססת על רמות:\n"
            "- 3-5 דירות: 5% הנחה\n"
            "- 6-10 דירות: 10% הנחה\n"
            "- 11-20 דירות: 15% הנחה\n"
            "- 21+ דירות: 20% הנחה\n"
            "התשלום מוחזק בנאמנות עד להשלמת העבודה."
        ),
        "metadata": {
            "doc_type": "faq",
            "category": "pricing",
            "language": "he",
        },
    },
    {
        "text": (
            "Q: How does Groupio verify contractors?\n"
            "A: Every contractor goes through a multi-step vetting process:\n"
            "1. License verification\n"
            "2. Insurance validation (minimum 500K ILS coverage)\n"
            "3. Professional certifications check\n"
            "4. Online reputation analysis\n"
            "5. Past project performance review\n"
            "Contractors must score above 85/100 on our trust score."
        ),
        "metadata": {
            "doc_type": "faq",
            "category": "vetting",
            "language": "en",
        },
    },
    {
        "text": (
            "Q: מה קורה אם הקבלן לא מסיים את העבודה?\n"
            "A: התשלום מוחזק בנאמנות (escrow) ומשוחרר רק אחרי אישור הדייר שהעבודה הושלמה. "
            "אם יש בעיה, צוות התמיכה שלנו מתערב לפתרון. במקרים חריגים, הכסף מוחזר לדייר."
        ),
        "metadata": {
            "doc_type": "faq",
            "category": "payment",
            "language": "he",
        },
    },
]

PRICING_GUIDES = [
    {
        "text": (
            "## Pricing Guide: AC Installation (Central Israel)\n\n"
            "Average market price per unit: 3,500-5,500 ILS\n"
            "Factors affecting price:\n"
            "- Unit size (BTU capacity)\n"
            "- Installation complexity (new vs. replacement)\n"
            "- Building height and accessibility\n"
            "- Brand preference (Tadiran, Electra, Mitsubishi)\n\n"
            "Seasonal notes:\n"
            "- Summer peak: +15% average\n"
            "- Winter off-season: -15% average\n\n"
            "Group discount typically ranges 5-20% depending on participation."
        ),
        "metadata": {
            "doc_type": "pricing_guide",
            "category": "ac_installation",
            "language": "en",
            "region": "center",
        },
    },
    {
        "text": (
            "## מדריך תמחור: מטבחים\n\n"
            "מחיר שוק ממוצע: 30,000-80,000 ש\"ח\n"
            "גורמים המשפיעים על המחיר:\n"
            "- גודל המטבח\n"
            "- סוג החומרים (פורמייקה, עץ מלא, שיש)\n"
            "- מותג המכשירים החשמליים\n"
            "- מורכבות העיצוב\n\n"
            "הנחה קבוצתית ממוצעת: 10-15%\n"
            "עונתיות: ביקוש גבוה לפני חגים"
        ),
        "metadata": {
            "doc_type": "pricing_guide",
            "category": "kitchen",
            "language": "he",
            "region": "all",
        },
    },
]

INSTALLATION_GUIDES = [
    {
        "text": (
            "## AC Installation Guide\n\n"
            "### Before Installation\n"
            "1. Ensure electrical capacity supports the AC unit\n"
            "2. Verify building permits if needed\n"
            "3. Choose indoor unit location (avoid direct sunlight)\n"
            "4. Ensure outdoor unit placement complies with building rules\n\n"
            "### During Installation\n"
            "- Professional installation takes 3-4 hours per unit\n"
            "- Expect drilling for line sets\n"
            "- Electrician may be needed for dedicated circuit\n\n"
            "### After Installation\n"
            "- Test all modes (cool, heat, fan)\n"
            "- Set up maintenance schedule\n"
            "- Keep warranty documentation"
        ),
        "metadata": {
            "doc_type": "installation_guide",
            "category": "ac_installation",
            "language": "en",
        },
    },
]


async def create_collections() -> None:
    """Create all Qdrant collections."""
    vs = VectorStore()
    await vs.ensure_collections()
    logger.info("All collections created/verified")


async def seed_knowledge_base() -> None:
    """Load initial knowledge base documents into Qdrant."""
    vs = VectorStore()
    embedding_client = EmbeddingClient()

    all_docs = FAQ_DOCUMENTS + PRICING_GUIDES + INSTALLATION_GUIDES

    # Chunk documents
    all_chunks = []
    for doc in all_docs:
        chunks = chunk_document(
            text=doc["text"],
            chunk_size=1024,
            overlap=100,
            metadata=doc["metadata"],
        )
        all_chunks.extend(chunks)

    if not all_chunks:
        logger.warning("No chunks to upload")
        return

    logger.info("Generated %d chunks from %d documents", len(all_chunks), len(all_docs))

    # Generate embeddings
    texts = [c["text"] for c in all_chunks]
    embeddings = await embedding_client.embed_batch(texts)

    # Upload to Qdrant
    ids = list(range(len(all_chunks)))
    payloads = [
        {
            "text": chunk["text"],
            "namespace": "knowledge_base",
            **chunk.get("metadata", {}),
        }
        for chunk in all_chunks
    ]

    await vs.upsert(
        collection="knowledge_base",
        ids=ids,
        vectors=embeddings,
        payloads=payloads,
    )

    logger.info("Uploaded %d knowledge base chunks", len(all_chunks))


async def main() -> None:
    """Run the full vector DB setup."""
    logger.info("Starting vector DB setup...")
    await create_collections()

    settings = get_settings()
    if settings.OPENAI_API_KEY:
        logger.info("Seeding knowledge base...")
        await seed_knowledge_base()
    else:
        logger.warning(
            "OPENAI_API_KEY not set - skipping knowledge base seeding. "
            "Collections created but empty."
        )

    logger.info("Vector DB setup complete")


if __name__ == "__main__":
    asyncio.run(main())
