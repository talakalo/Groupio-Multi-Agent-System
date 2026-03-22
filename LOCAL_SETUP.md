curl http://localhost:8000/api/v1/health
{"status":"degraded","services":{"vector_db":true,"graph_db":true,"redis":true,"postgres":false}}Mac# Groupio Multi-Agent System - Local Setup Guide

This guide walks you through setting up and running the Groupio system locally for development.

## Prerequisites

- **Node.js** 20+ and **pnpm** 9+
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

# Backend: create venv first, then install
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -e ".[dev]"    # Backend + alembic

# 3. Start infrastructure services (from repo root; compose file is under docker/)
docker compose -f docker/docker-compose.yml up -d

# 4. Configure environment
cp docker/.env.example .env
# Edit .env with your API keys (see Configuration section)

# 5. Run database migrations (with venv activated)
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
# Create virtual environment (required - run from project root)
python -m venv venv

# Activate it (required before pip/alembic)
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install backend with dev dependencies (includes alembic)
pip install -e ".[dev]"
```

**If venv already exists** but `alembic` is not found: activate the venv first, then run `pip install -e ".[dev]"` again.

### 2. Start Infrastructure Services

The system requires several services. Use Docker Compose to start them:

```bash
# Always run from the repository root (not from docker/)
docker compose -f docker/docker-compose.yml up -d
```

If your shell is already in `docker/`, use: `docker compose -f docker-compose.yml up -d`

This starts (typical dev stack):
| Service | Port | Description |
|---------|------|-------------|
| Redis | 6379 | Caching, rate limiting, session storage |
| Qdrant | 6333 | Vector database for RAG |
| Neo4j | 7474 (HTTP), 7687 (Bolt) | Graph database |
| PostgreSQL | 5432 | Main database |
| Prometheus | 9090 | Metrics |
| Alertmanager | 9093 | Alerts |
| Grafana | **3010** | Dashboards (admin UI stays on **3001**) |

**Verify services are running:**
```bash
docker compose -f docker/docker-compose.yml ps
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

**Option A: Local PostgreSQL** (default `postgresql://postgres:postgres@localhost:5432/groupio`)

Ensure PostgreSQL is running. If Homebrew’s service fails (e.g. launchctl bootstrap error), use Docker instead:

```bash
# From repo root:
docker compose -f docker/docker-compose.yml up -d postgres
```

Then **from the project root** (not from `docker/`) run migrations. The Docker Postgres container creates the `groupio` database automatically.

```bash
cd /path/to/Groupio-Multi-Agent-System   # project root, where alembic.ini lives
alembic upgrade head
```

If you use a local PostgreSQL install (not Docker), create the database first:
```bash
./scripts/create-db.sh
# Or: createdb -U postgres groupio
```
Then run `alembic upgrade head` from the project root.

**Option B: Local PostgreSQL with Supabase URL set**

If `docker/.env` has `SUPABASE_URL` but you want to use local PostgreSQL (e.g. when Supabase has connection issues), set:
```
USE_LOCAL_POSTGRES=1
```
This forces the API to use `DATABASE_URL` (local PostgreSQL) instead of Supabase. Requires `pip install asyncpg` (included in project deps).

**Option C: Supabase** (hosted PostgreSQL)

Set `DATABASE_URL` in `.env` to your Supabase connection string:
```
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```
Get this from Supabase Dashboard → Project Settings → Database → Connection string.

Then run migrations **from the project root** (where `alembic.ini` is):
```bash
alembic upgrade head
```

### 4b. Seed predefined user accounts (optional)

To create the standard demo accounts (Buildings Manager, Resident, Contractor, Super Admin):

- **With Supabase** (no `USE_LOCAL_POSTGRES`): ensure `SUPABASE_URL` and `SUPABASE_KEY` are set, then:
  ```bash
  python scripts/seed_user_accounts.py
  ```
- **With local PostgreSQL**: ensure PostgreSQL is running and migrations are applied, then:
  ```bash
  USE_LOCAL_POSTGRES=1 python scripts/seed_user_accounts.py
  ```

If you see "Connection refused" on port 5432, start PostgreSQL (e.g. `brew services start postgresql@14`) or use Supabase instead.

### 5. Start the Backend API

**The web app login and all API calls require the backend to be running.** If you see "Connection refused" or "לא ניתן להתחבר לשרת" on login, start the API:

```bash
# From project root
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

Set `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:8000/api/v1`) in `apps/mobile/.env` so the app talks to your backend. For production, store the auth token in **Expo SecureStore** (or equivalent) instead of in-memory; see [docs/MOBILE_API_ALIGNMENT.md](docs/MOBILE_API_ALIGNMENT.md).

---

## Running Tests

### Backend Tests
```bash
# All unit tests
python -m pytest tests/unit/ -v

# With coverage
python -m pytest tests/unit/ --cov=src --cov-report=html

# Integration tests (mocks Redis when unavailable; some tests require PostgreSQL)
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

# Docker (repo root)
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml logs -f
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
# Find process using port (e.g. 8000 API, 3001 Admin)
lsof -i :8000
lsof -i :3001
# Kill it
kill -9 <PID>
```
Admin uses **3001**; Grafana in Docker is on **3010** so they no longer fight for the same port.

#### `docker compose` “no such file” (`docker/docker/docker-compose.yml`)
You ran compose from inside `docker/` with `-f docker/docker-compose.yml`. Either stay in **repo root** and use `-f docker/docker-compose.yml`, or from `docker/` use `-f docker-compose.yml`.

#### “Cannot connect to the Docker daemon”
Start **Docker Desktop** (or the daemon), then retry.

#### Uvicorn: `Invalid value for '--port': '8000export'` or `Address already in use`
Paste **one command per line**. If `8000` is taken, stop the other API (`lsof -i :8000`) or use another port.

#### Docker services not starting
```bash
# Check logs
docker compose -f docker/docker-compose.yml logs <service-name>

# Restart services
docker compose -f docker/docker-compose.yml down && docker compose -f docker/docker-compose.yml up -d
```

#### Database connection errors
1. Ensure Docker services are running: `docker compose -f docker/docker-compose.yml ps`
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
- **Docker logs**: `docker compose -f docker/docker-compose.yml logs -f <service>`
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

## Git Workflow & Branching Strategy

### Branch Structure

```
main (production)
  ↑ PR with auto-merge
dev (staging)
  ↑ PR with auto-merge
feature/your-feature
```

### Workflow

1. **Create feature branch from `dev`**:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature
   ```

2. **Make changes and push**:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push -u origin feature/your-feature
   ```

3. **Create PR to `dev`**:
   - PRs to `dev` deploy to **staging** environment
   - CI runs automatically (lint, type-check, tests, security scan)
   - Auto-merges when all checks pass

4. **Create PR from `dev` to `main`**:
   - PRs to `main` deploy to **production** environment
   - Same CI checks run
   - Auto-merges when all checks pass

### CI/CD Pipeline

| Stage | What Runs |
|-------|-----------|
| Lint | ESLint, Ruff, TypeScript type-check |
| Security | Trivy vulnerability scan, GitLeaks secret scan |
| Tests | Backend unit tests, Frontend unit tests |
| Build | Docker build, Next.js build |
| Deploy | Vercel (web/admin), Docker (backend) |

### Setting Up Branch Protection (Repository Admin)

Go to GitHub → Settings → Branches → Add rule:

**For `main` branch:**
- Require pull request before merging
- Require status checks: `CI Success`
- Require branches to be up to date
- Include administrators

**For `dev` branch:**
- Require pull request before merging
- Require status checks: `CI Success`

---

## Mobile app

### API base URL

Set `EXPO_PUBLIC_API_URL` (or the default in `apps/mobile/lib/api.ts`) to the backend base URL **including** `/api/v1`, e.g. `https://api.groupio.co.il/api/v1` or `http://localhost:8000/api/v1`.

### Auth token storage

For production, store the auth token in **SecureStore** (or equivalent) instead of in-memory or AsyncStorage. This keeps tokens out of app backups and reduces exposure. Document in the mobile app README how to switch to SecureStore for token persistence.

### Optional / not-yet-implemented endpoints

The mobile client may call these; backend may return 404 until implemented. Handle 404 and show empty/offline state as appropriate:

- `GET /activity` – user activity feed
- `GET /contractors/matches` – contractor matches for user
- `GET /buildings/:id/news` – building news/updates
- `PUT /auth/me/avatar` – upload profile avatar
- `POST /message/stream` – streaming chat response

---

## Next Steps

1. **Explore the API**: Visit http://localhost:8000/docs
2. **Create a test user**: Use the `/api/v1/auth/register` endpoint
3. **Try the AI chat**: Access the chat feature in the web app
4. **Review the agents**: Check `src/agents/` for agent implementations

For more information, see the main [README.md](./README.md).
