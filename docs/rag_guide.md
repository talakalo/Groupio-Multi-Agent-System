# RAG Best Practices

## Chunking Strategies

| Collection | Chunk Size | Overlap | Rationale |
|-----------|-----------|---------|-----------|
| contractors | 512 tokens | 50 | Short profiles, preserve complete descriptions |
| buildings | 512 tokens | 50 | Building profiles with metadata |
| knowledge_base | 1024 tokens | 100 | Longer documents (guides, FAQs) need more context |
| conversations | 256 tokens | 30 | Short messages, minimal overlap needed |

### When to Adjust

- **Increase chunk size** when documents have long, interconnected paragraphs
- **Decrease chunk size** when precision matters more than context
- **Increase overlap** for documents where sentence boundaries are important

## Retrieval Strategies

### Semantic Search
Best for: Open-ended queries, concept matching
```python
results = await rag.retrieve(query, namespace, strategy="semantic")
```

### Hybrid Search
Best for: Queries with specific terms (license numbers, names)
```python
results = await rag.retrieve(query, namespace, strategy="hybrid")
```

### Contextual Search
Best for: Personalized queries using user history
```python
enriched_query = f"{query} {user_preferences}"
results = await rag.retrieve(enriched_query, namespace, strategy="contextual")
```

### Multi-hop Search
Best for: Complex queries requiring multiple information lookups
```python
results = await rag.retrieve(query, namespace, strategy="multi_hop")
```

## Strategy Selection by Agent

| Agent | Primary | Secondary | Reason |
|-------|---------|-----------|--------|
| Matching | hybrid | graph query | Need exact terms (licenses) + semantic similarity |
| Pricing | semantic | SQL query | Pricing guides are conceptual; market data is structured |
| Support | contextual | vector on FAQ | Personalized responses based on user history |
| Vetting | multi_hop | external API | Complex validation needs multiple lookups |
| Analytics | SQL-first | vector for trends | Quantitative data from DB, themes from conversations |

## Prompt Augmentation

Context is injected into the system prompt using this pattern:

```
--- Retrieved Context ---
[Source 1 (relevance: 0.95, source: contractors)]
Contractor profile text...

[Source 2 (relevance: 0.88, source: knowledge_base)]
FAQ content...
--- End of Context ---

Use the above context to inform your response.
```

## Reranking

Cross-encoder reranking is applied after initial retrieval:
1. Retrieve top_k * 2 results from vector search
2. Rerank using similarity scoring between query and each document
3. Return top rerank_top_k results

This improves precision for queries where initial recall is broad.

## Hebrew Considerations

- Hebrew text is normalized before embedding (nikud removed)
- Stopwords are filtered for keyword matching
- Both Hebrew and English queries are supported
- Category and region names are translated automatically
