"""Document chunking strategies for the RAG pipeline."""

import logging
import re
from typing import Any

import tiktoken

logger = logging.getLogger(__name__)

_encoder = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """Count the number of tokens in a text string."""
    return len(_encoder.encode(text))


def chunk_by_tokens(
    text: str,
    chunk_size: int = 512,
    overlap: int = 50,
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Split text into overlapping chunks based on token count.

    Tries to split at sentence boundaries when possible.
    """
    if not text.strip():
        return []

    sentences = _split_into_sentences(text)
    chunks: list[dict[str, Any]] = []
    current_chunk: list[str] = []
    current_tokens = 0
    chunk_index = 0

    for sentence in sentences:
        sentence_tokens = count_tokens(sentence)

        if current_tokens + sentence_tokens > chunk_size and current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append(
                {
                    "text": chunk_text,
                    "tokens": current_tokens,
                    "chunk_index": chunk_index,
                    "metadata": {**(metadata or {}), "chunk_index": chunk_index},
                }
            )
            chunk_index += 1

            # Keep overlap sentences
            overlap_tokens = 0
            overlap_sentences: list[str] = []
            for sent in reversed(current_chunk):
                sent_tokens = count_tokens(sent)
                if overlap_tokens + sent_tokens > overlap:
                    break
                overlap_sentences.insert(0, sent)
                overlap_tokens += sent_tokens

            current_chunk = overlap_sentences
            current_tokens = overlap_tokens

        current_chunk.append(sentence)
        current_tokens += sentence_tokens

    # Add the last chunk
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        chunks.append(
            {
                "text": chunk_text,
                "tokens": current_tokens,
                "chunk_index": chunk_index,
                "metadata": {**(metadata or {}), "chunk_index": chunk_index},
            }
        )

    return chunks


def chunk_document(
    text: str,
    chunk_size: int = 512,
    overlap: int = 50,
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Chunk a document with appropriate strategy based on content type.

    This is the main entry point for document chunking. It selects the
    best strategy based on the metadata doc_type if available.
    """
    doc_type = (metadata or {}).get("doc_type", "")

    if doc_type in ("faq", "qa"):
        return chunk_faq(text, metadata=metadata)
    elif doc_type == "pricing_guide":
        return chunk_by_sections(text, chunk_size=1024, overlap=100, metadata=metadata)
    else:
        return chunk_by_tokens(
            text, chunk_size=chunk_size, overlap=overlap, metadata=metadata
        )


def chunk_faq(
    text: str,
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Chunk FAQ documents by question-answer pairs.

    Expects format:
    Q: question
    A: answer
    """
    chunks: list[dict[str, Any]] = []
    # Split by Q: markers
    qa_pairs = re.split(r"\n(?=Q:|שאלה:)", text)

    for i, pair in enumerate(qa_pairs):
        pair = pair.strip()
        if not pair:
            continue
        chunks.append(
            {
                "text": pair,
                "tokens": count_tokens(pair),
                "chunk_index": i,
                "metadata": {**(metadata or {}), "chunk_index": i, "type": "faq_pair"},
            }
        )

    return chunks


def chunk_by_sections(
    text: str,
    chunk_size: int = 1024,
    overlap: int = 100,
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Chunk text by sections (headers), falling back to token-based if needed."""
    sections = re.split(r"\n(?=#{1,3}\s|\*\*[A-Z])", text)

    chunks: list[dict[str, Any]] = []
    for i, section in enumerate(sections):
        section = section.strip()
        if not section:
            continue

        section_tokens = count_tokens(section)
        if section_tokens <= chunk_size:
            chunks.append(
                {
                    "text": section,
                    "tokens": section_tokens,
                    "chunk_index": len(chunks),
                    "metadata": {**(metadata or {}), "chunk_index": len(chunks)},
                }
            )
        else:
            # Section too long, sub-chunk it
            sub_chunks = chunk_by_tokens(
                section,
                chunk_size=chunk_size,
                overlap=overlap,
                metadata=metadata,
            )
            for sc in sub_chunks:
                sc["chunk_index"] = len(chunks)
                sc["metadata"]["chunk_index"] = len(chunks)
                chunks.append(sc)

    return chunks


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences, handling Hebrew and English."""
    # Split on sentence-ending punctuation followed by whitespace
    sentences = re.split(r"(?<=[.!?。])\s+", text)
    return [s.strip() for s in sentences if s.strip()]
