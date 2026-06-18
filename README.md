# Groupio Multi-Agent System

A production-ready multi-agent AI system for an Israeli marketplace connecting apartment building residents with verified contractors for group home improvements.

## Overview

Groupio leverages AI agents to automate contractor matching, pricing optimization, vetting, customer support, and analytics. The system supports Hebrew and English, with RTL-first design.

### Key Features

- **11 Registered Backend Agents**: 7 core marketplace agents (Router, Matching, Pricing, Vetting, Support, Outreach, Analytics) plus Architecture, Influencer, Notification, and Payment
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
│   ├── agents/               # Agent implementations used by the orchestrator
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

For full setup (env vars, migrations, Docker, all apps), see **[LOCAL_SETUP.md](LOCAL_SETUP.md)**.

For pilot release verification and go/no-go criteria, see **[FINAL_PILOT_RELEASE_GATE_REPORT.md](FINAL_PILOT_RELEASE_GATE_REPORT.md)** and **[docs/PILOT_RELEASE_CHECKLIST.md](docs/PILOT_RELEASE_CHECKLIST.md)**.

Minimal steps:

```bash
git clone https://github.com/talakalo/Groupio-Multi-Agent-System.git
cd Groupio-Multi-Agent-System

pnpm install
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -e ".[dev]"

docker compose -f docker/docker-compose.yml up -d postgres redis qdrant neo4j
cp docker/.env.example .env   # edit with API keys
alembic upgrade head

python -m uvicorn src.api.main:app --reload --port 8000
# In another terminal: pnpm --filter @groupio/web dev
```

If you need the admin app on `http://localhost:3001`, do not start the full monitoring stack at the same time: `docker/docker-compose.yml` currently maps Grafana to host port `3001`.

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

Additional agents currently registered in `origin/dev`: `architecture`, `influencer`, `notification`, and `payment`.

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
| `/api/v1/message` | POST | Main authenticated orchestration endpoint |
| `/api/v1/offers` | GET/POST | Offer CRUD |
| `/api/v1/contractors` | GET | Contractor search |
| `/api/v1/webhooks/whatsapp` | GET/POST | WhatsApp verification and incoming webhook |
| `/api/v1/admin/status` | GET | Admin system status |
| `/api/v1/escalations` | GET | Escalation queue |
| `/api/v1/health` | GET | Readiness check across Postgres, Redis, Qdrant, and Neo4j |
| `/api/v1/health/live` | GET | Liveness probe |

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
pnpm --filter @groupio/web test

# E2E tests
pnpm test:e2e

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

- [Architecture](docs/architecture.md) - System design (includes Design System reference)
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
