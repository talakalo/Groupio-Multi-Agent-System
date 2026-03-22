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

## Design System

The project uses a centralized design system documented in `design-system/`. Key files:

- `MASTER.md` — Core tokens, colors, typography, spacing, components
- `ROUTES.md` — Route-by-route redesign specifications
- `COMPONENTS.md` — Component library map
- `NAVIGATION.md` — Per-role navigation design
- `BACKEND.md` — Backend architecture reference
- `AGENTS.md` — AI agent system documentation
- `DATABASE.md` — Database schema reference
- `MOBILE.md` — Mobile app specifications
- `INFRASTRUCTURE.md` — Cross-cutting infrastructure

### New Shared Components (apps/web/components/)

- `ui/Badge` — Semantic badges (7 variants)
- `ui/Button` — Form buttons (6 variants, 3 sizes, loading state)
- `ui/Skeleton` — Loading skeletons (5 variants)
- `shared/Breadcrumb` — RTL-aware breadcrumb navigation
- `shared/TrustBadgeCluster` — Trust indicator badges
- `shared/AttentionBanner` — Alert banners (3 variants)
- `shared/CategoryChips` — Filterable category chips
- `shared/StepIndicator` — Progress step indicator
- `features/payments/EscrowBadge` — Escrow protection indicator
- `features/payments/PriceBreakdown` — Price itemization
- `features/orders/OrderTimeline` — Order lifecycle timeline
- `features/building/BuildingSummaryCard` — Building info card
- `features/contractor/VettingStatusTimeline` — Verification timeline
- `features/contractor/TrustScoreProgress` — Trust score display

### Admin Shared Components (apps/admin/components/)

- `shared/DataTable` — Generic sortable/filterable table
- `shared/AdminActionModal` — Action confirmation dialog
- `features/agents/AgentStatusDot` — Agent health indicator
- `features/agents/AgentModeLabel` — Autonomy mode badge
- `features/agents/PendingDecisionCard` — Decision approval card
- `features/agents/AgentConfigPanel` — Agent configuration panel
- `features/agents/AgentActivityLog` — Agent activity table
