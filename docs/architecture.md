# Architecture Overview

## System Design

The Groupio Multi-Agent System is a production-grade AI platform that powers intelligent matching, pricing, vetting, and support for a group home improvement marketplace.

## Core Architecture

```
User Message (WhatsApp / Web / App)
          │
          ▼
   ┌─────────────┐
   │  FastAPI     │  ← API Gateway with auth, rate limiting, logging
   │  Layer       │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  LangGraph   │  ← Orchestrator: routes messages through agent graph
   │  Orchestrator│
   └─────┬───────┘
         │
    ┌────┴────────────────────────────┐
    │         Router Agent            │  ← Intent classification
    └────┬────────────────────────────┘
         │ Routes to specialist
         ▼
   ┌───────────────────────────────────────┐
   │         Specialist Agents             │
   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │
   │  │Matching │ │Pricing  │ │Support  │ │
   │  └─────────┘ └─────────┘ └─────────┘ │
   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │
   │  │Vetting  │ │Outreach │ │Analytics│ │
   │  └─────────┘ └─────────┘ └─────────┘ │
   └────┬──────────────┬───────────┬──────┘
        │              │           │
        ▼              ▼           ▼
   ┌─────────┐  ┌──────────┐  ┌───────┐
   │  RAG    │  │  Graph   │  │  SQL  │
   │Pipeline │  │  DB      │  │  DB   │
   │(Qdrant) │  │ (Neo4j)  │  │(PG)  │
   └─────────┘  └──────────┘  └───────┘
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| LLM | Claude Sonnet 4 | Best reasoning for complex agent tasks |
| Orchestration | LangGraph | State machine for multi-agent workflows |
| Vector DB | Qdrant | Fast semantic search, self-hosted |
| Graph DB | Neo4j | Relationship modeling for matching |
| Primary DB | PostgreSQL (Supabase) | Reliable, scalable relational storage |
| Cache | Redis | Fast state management, rate limiting |
| API | FastAPI | Async Python, automatic docs |
| Embeddings | OpenAI text-embedding-3-large | 1536 dimensions, good multilingual support |

## Data Flow

1. **Inbound**: User message arrives via API (REST/WhatsApp webhook)
2. **Routing**: Router Agent classifies intent with confidence scoring
3. **Context**: RAG pipeline retrieves relevant documents from Qdrant
4. **Processing**: Specialist agent processes with RAG context + graph/SQL data
5. **Response**: Formatted response returned to user via original channel

## Agent Communication

Agents communicate through shared `AgentState` (TypedDict):
- Messages, intent, confidence
- RAG results, user profile, building context
- Actions taken, escalation flags

The LangGraph state machine manages transitions:
- Router -> Specialist Agent -> Final Response
- Any agent can escalate to human handoff
- Agents can request follow-up routing

## Vector Collections

| Collection | Content | Chunk Size | Use Case |
|-----------|---------|-----------|----------|
| contractors | Profiles, certs | 512 tokens | Matching agent search |
| buildings | Building info, history | 512 tokens | Context enrichment |
| knowledge_base | FAQs, guides, pricing | 1024 tokens | Support, pricing agents |
| conversations | Past interactions | 256 tokens | Support personalization |

## Security

- API key authentication for all endpoints
- Rate limiting per user (Redis-backed)
- SQL injection prevention (parameterized queries)
- Input validation via Pydantic models
- Escalation rules for sensitive content
