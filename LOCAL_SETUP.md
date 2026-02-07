# Groupio Multi-Agent System - Local Setup Guide

This guide walks you through setting up and running the Groupio system locally for development.

## Prerequisites

- **Node.js** 20+ and **pnpm** 8+
- **Python** 3.11+
- **Docker** and **Docker Compose**
- **Git**

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/talakalo/Groupio-Multi-Agent-System.git
cd Groupio-Multi-Agent-System

# 2. Install dependencies
pnpm install              # Frontend dependencies
pip install -e ".[dev]"   # Backend dependencies

# 3. Start infrastructure services
docker compose up -d

# 4. Configure environment
cp docker/.env.example .env
# Edit .env with your API keys (see Configuration section)

# 5. Run database migrations
alembic upgrade head

# 6. Start the backend API
python -m uvicorn src.api.main:app --reload --port 8000

# 7. Start the frontend (in a new terminal)
cd apps/web && pnpm dev
```

---

## Detailed Setup

### 1. Install Dependencies

#### Frontend (Node.js/pnpm)
```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all frontend dependencies
pnpm install
```

#### Backend (Python)
```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install backend with dev dependencies
pip install -e ".[dev]"
```

### 2. Start Infrastructure Services

The system requires several services. Use Docker Compose to start them:

```bash
docker compose up -d
```

This starts:
| Service | Port | Description |
|---------|------|-------------|
| Redis | 6379 | Caching, rate limiting, session storage |
| Qdrant | 6333 | Vector database for RAG |
| Neo4j | 7474 (HTTP), 7687 (Bolt) | Graph database |
| PostgreSQL | 5432 | Main database (via Supabase) |

**Verify services are running:**
```bash
docker compose ps
```

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp docker/.env.example .env
```

Edit `.env` with your settings:

```bash
# Required API Keys
ANTHROPIC_API_KEY=sk-ant-xxxxx          # Get from console.anthropic.com
OPENAI_API_KEY=sk-xxxxx                  # Get from platform.openai.com

# Database Connections (defaults work with docker-compose)
QDRANT_URL=http://localhost:6333
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword              # Change in production!
REDIS_URL=redis://localhost:6379

# Supabase (for PostgreSQL)
SUPABASE_URL=http://localhost:54321      # Or your Supabase project URL
SUPABASE_KEY=your-supabase-key

# JWT Secret (generate a secure random string)
JWT_SECRET_KEY=your-secret-key-min-32-characters

# Development CORS (already set for local dev)
CORS_ORIGINS=["http://localhost:3000","http://localhost:3001"]

# Environment
ENVIRONMENT=development
```

### 4. Run Database Migrations

```bash
# Ensure PostgreSQL/Supabase is running
alembic upgrade head
```

### 5. Start the Backend API

```bash
# Development mode with auto-reload
python -m uvicorn src.api.main:app --reload --port 8000

# Or using the Makefile
make run-api
```

**Verify API is running:**
- Health check: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

### 6. Start Frontend Applications

#### Web App (Residents)
```bash
cd apps/web
pnpm dev
# Open http://localhost:3000
```

#### Admin Dashboard
```bash
cd apps/admin
pnpm dev
# Open http://localhost:3001
```

#### Mobile App (Expo)
```bash
cd apps/mobile
pnpm start
# Scan QR code with Expo Go app
```

---

## Running Tests

### Backend Tests
```bash
# All unit tests
python -m pytest tests/unit/ -v

# With coverage
python -m pytest tests/unit/ --cov=src --cov-report=html

# Integration tests (requires running services)
python -m pytest tests/integration/ -v
```

### Frontend Tests
```bash
# Web app unit tests
cd apps/web && pnpm test

# Admin dashboard tests
cd apps/admin && pnpm test

# E2E tests (requires Playwright)
pnpm exec playwright install
pnpm exec playwright test
```

---

## Development Workflow

### Project Structure
```
Groupio-Multi-Agent-System/
├── apps/
│   ├── web/          # Next.js resident web app
│   ├── admin/        # Next.js admin dashboard
│   └── mobile/       # React Native mobile app
├── packages/
│   ├── ui/           # Shared UI components
│   ├── types/        # Shared TypeScript types
│   └── utils/        # Shared utilities
├── src/
│   ├── agents/       # AI agents (router, matching, pricing, etc.)
│   ├── api/          # FastAPI routes and middleware
│   ├── databases/    # Database clients
│   ├── rag/          # RAG pipeline
│   └── services/     # Business services
├── tests/
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
└── docker/           # Docker configuration
```

### Common Commands

```bash
# Backend
make run-api              # Start API server
make test                 # Run all tests
make lint                 # Run linters (ruff, mypy)

# Frontend
pnpm dev                  # Start all apps
pnpm build                # Build all apps
pnpm test                 # Run all tests
pnpm lint                 # Run ESLint

# Docker
docker compose up -d      # Start services
docker compose down       # Stop services
docker compose logs -f    # View logs
```

### Hot Reload

- **Backend**: Uses `--reload` flag with uvicorn
- **Frontend**: Next.js has built-in hot reload
- **Changes to agents**: Automatically reloaded

---

## Troubleshooting

### Common Issues

#### Port already in use
```bash
# Find process using port
lsof -i :8000
# Kill it
kill -9 <PID>
```

#### Docker services not starting
```bash
# Check logs
docker compose logs <service-name>

# Restart services
docker compose down && docker compose up -d
```

#### Database connection errors
1. Ensure Docker services are running: `docker compose ps`
2. Check environment variables in `.env`
3. Verify network connectivity to services

#### Missing API keys
The system requires valid Anthropic and OpenAI API keys. Without them:
- LLM calls will fail
- Embedding generation will fail

#### Node.js version mismatch
```bash
# Use nvm to switch versions
nvm use 20
```

### Logs

- **API logs**: Console output or `LOG_LEVEL=DEBUG` for verbose
- **Docker logs**: `docker compose logs -f <service>`
- **Next.js logs**: Console output in terminal

---

## Optional Services

### Email (for verification emails)
Add SMTP configuration to `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### WhatsApp Integration
Add WhatsApp Business API credentials:
```bash
WHATSAPP_API_TOKEN=your-token
WHATSAPP_PHONE_ID=your-phone-id
```

### Monitoring (Sentry)
```bash
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## Next Steps

1. **Explore the API**: Visit http://localhost:8000/docs
2. **Create a test user**: Use the `/api/v1/auth/register` endpoint
3. **Try the AI chat**: Access the chat feature in the web app
4. **Review the agents**: Check `src/agents/` for agent implementations

For more information, see the main [README.md](./README.md).
