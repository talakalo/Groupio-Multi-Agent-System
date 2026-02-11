# Groupio Multi-Agent System

A production-ready multi-agent AI system for an Israeli marketplace connecting apartment building residents with verified contractors for group home improvements.

## Overview

Groupio leverages AI agents to automate contractor matching, pricing optimization, vetting, customer support, and analytics. The system supports Hebrew and English, with RTL-first design.

### Key Features

- **7 Specialized AI Agents**: Router, Matching, Pricing, Vetting, Support, Outreach, Analytics
- **RAG Pipeline**: Semantic, hybrid, contextual, and multi-hop retrieval strategies
- **Multi-Database Architecture**: Qdrant (vector), Neo4j (graph), PostgreSQL, Redis
- **Real-time Updates**: Supabase Realtime for live offer and chat updates
- **Multi-Platform**: Web (Next.js), Mobile (React Native/Expo), Admin Dashboard
- **WhatsApp Integration**: Business API bot for conversational interactions
- **i18n**: Full Hebrew and English support with RTL layouts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Apps                             │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Web (Next.js) │  Mobile (Expo)  │   Admin Dashboard           │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         └─────────────────┴───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  FastAPI    │
                    │  API Layer  │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   LangGraph Orchestrator │
              └────────────┬────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
┌───▼───┐  ┌───────┐  ┌───▼───┐  ┌───────┐  ┌───▼────┐
│Router │  │Matching│  │Pricing│  │Vetting│  │Support │
└───────┘  └───────┘  └───────┘  └───────┘  └────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌─────▼─────┐     ┌────▼────┐
    │ Qdrant  │      │   Neo4j   │     │Postgres │
    │ Vector  │      │   Graph   │     │   DB    │
    └─────────┘      └───────────┘     └─────────┘
```

## Project Structure

```
Groupio-Multi-Agent-System/
├── src/                      # Backend Python source
│   ├── agents/               # 7 specialized agents
│   ├── api/                  # FastAPI routes
│   ├── config/               # Settings & prompts
│   ├── databases/            # DB clients
│   ├── models/               # Pydantic models
│   ├── orchestration/        # LangGraph workflow
│   ├── rag/                  # RAG pipeline
│   ├── services/             # WhatsApp bot
│   └── utils/                # Helpers
├── apps/                     # Frontend monorepo
│   ├── web/                  # Next.js 14 web app
│   ├── admin/                # Admin dashboard
│   └── mobile/               # React Native/Expo
├── packages/                 # Shared packages
│   ├── types/                # TypeScript types
│   ├── api-client/           # API client
│   ├── ui/                   # Design tokens
│   └── utils/                # Formatters
├── tests/                    # Python tests
├── docs/                     # Documentation
├── scripts/                  # Setup scripts
└── docker/                   # Docker configs
```

## Quick Start

For full setup steps (migrations, env, Docker, seed data), see **[LOCAL_SETUP.md](LOCAL_SETUP.md)**.

### Prerequisites

- Python 3.11+
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- Anthropic API key (Claude)
- OpenAI API key (embeddings)

### Backend (minimal)

```bash
cd Groupio-Multi-Agent-System
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies (prefer backend dev install for tests)
pip install -e ".[dev]"
# Or: pip install -r requirements.txt

# Copy environment file
cp docker/.env.example docker/.env
# Edit docker/.env with your API keys
docker compose up -d
alembic upgrade head
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm dev
# Web: http://localhost:3000  |  Admin: http://localhost:3001  |  Mobile: pnpm --filter mobile start
```

## AI Agents

| Agent | Purpose | Key Features |
|-------|---------|--------------|
| **Router** | Intent classification | Confidence-based routing, fallback handling |
| **Matching** | Contractor matching | Weighted scoring (semantic, graph, rating, price, availability) |
| **Pricing** | Group pricing | Tiered discounts (5/10/15/20%), quality safeguards |
| **Vetting** | Trust scoring | License, insurance, experience, reputation (0-100) |
| **Support** | Customer service | FAQ RAG, escalation rules, sentiment analysis |
| **Outreach** | Campaigns | A/B testing, personalization, scheduling |
| **Analytics** | NL queries | Natural language to SQL, trend analysis |

## Database Schema

### Qdrant Collections

- `offers` - Offer embeddings (1536 dims)
- `contractors` - Contractor profiles
- `faq` - Support knowledge base
- `conversations` - Chat history

### Neo4j Graph Model

```cypher
(:Building)-[:LOCATED_IN]->(:Region)
(:Contractor)-[:SERVES]->(:Region)
(:Contractor)-[:SPECIALIZES_IN]->(:Category)
(:Offer)-[:MATCHED_WITH]->(:Contractor)
(:Resident)-[:LIVES_IN]->(:Building)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Main chat endpoint |
| `/api/offers` | GET/POST | Offer CRUD |
| `/api/contractors` | GET | Contractor search |
| `/api/whatsapp/webhook` | POST | WhatsApp incoming |
| `/api/admin/agents` | GET | Agent status |
| `/api/admin/escalations` | GET | Escalation queue |
| `/health` | GET | Health check |

See [API Reference](docs/api_reference.md) for full documentation.

## Testing

### Backend Tests

```bash
# Run all tests
pytest

# With coverage
pytest --cov=src --cov-report=html

# Specific tests
pytest tests/unit/test_matching_agent.py
pytest tests/integration/test_end_to_end.py
```

### Frontend Tests

```bash
# Component tests
pnpm --filter web test

# E2E tests
pnpm --filter web test:e2e

# All tests
pnpm test
```

## Deployment

### Backend (Docker)

```bash
docker build -f docker/Dockerfile -t groupio-backend .
docker run -p 8000:8000 --env-file docker/.env groupio-backend
```

### Frontend (Vercel)

```bash
# Web app
cd apps/web && vercel --prod

# Admin dashboard
cd apps/admin && vercel --prod
```

### Mobile (EAS)

```bash
cd apps/mobile
eas build --platform all --profile production
eas submit --platform all
```

## Configuration

### Environment Variables

Key variables (see `.env.example` files for complete list):

```bash
# LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Databases
QDRANT_URL=http://localhost:6333
NEO4J_URI=bolt://localhost:7687
SUPABASE_URL=https://...
REDIS_URL=redis://localhost:6379

# WhatsApp
WHATSAPP_API_TOKEN=...
WHATSAPP_PHONE_ID=...
WHATSAPP_WEBHOOK_SECRET=...
```

## Monitoring

- **Prometheus**: Metrics at `/metrics`
- **Sentry**: Error tracking
- **Structured Logging**: JSON logs for aggregation

See [Deployment Guide](docs/deployment.md) for production setup.

## Documentation

- [Architecture](docs/architecture.md) - System design
- [Agent Behaviors](docs/agent_behaviors.md) - Agent specifications
- [API Reference](docs/api_reference.md) - Endpoint documentation
- [RAG Guide](docs/rag_guide.md) - Retrieval pipeline
- [Deployment](docs/deployment.md) - Production deployment

## Tech Stack

### Backend
- Python 3.11+
- FastAPI + Pydantic v2
- LangGraph (orchestration)
- Claude Sonnet 4 (LLM)
- OpenAI text-embedding-3-large
- Qdrant, Neo4j, PostgreSQL, Redis

### Frontend
- Turborepo + pnpm
- Next.js 14 (App Router)
- React Native + Expo Router
- TypeScript
- Tailwind CSS
- TanStack Query + Zustand
- next-intl (i18n)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

## Support

- GitHub Issues: [Report bugs](https://github.com/groupio/multi-agent-system/issues)
- Documentation: [docs/](docs/)
