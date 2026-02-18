# Contributing to Groupio Multi-Agent System

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Python 3.11+** — backend API and agent system
- **Node.js 20+** with **pnpm 9+** — frontend apps
- **Docker** and **Docker Compose** — for local services
- **Redis 7+**, **PostgreSQL 15+**, **Qdrant**, **Neo4j** — databases (Docker recommended)

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/talakalo/Groupio-Multi-Agent-System.git
cd Groupio-Multi-Agent-System
```

### 2. Backend setup

```bash
# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install dependencies
pip install -e ".[dev]"

# Copy environment template
cp .env.example .env
# Edit .env with your API keys and database URLs
```

### 3. Start infrastructure services

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts Redis, PostgreSQL, Qdrant, and Neo4j.

### 4. Frontend setup

```bash
pnpm install
```

### 5. Run the application

```bash
# Backend
uvicorn src.api.main:app --reload --port 8000

# Frontend (in another terminal)
pnpm --filter @groupio/web dev
```

## Project Structure

```
├── src/                    # Python backend
│   ├── agents/            # AI agents (Router, Matching, etc.)
│   ├── api/               # FastAPI routes
│   ├── config/            # Configuration
│   ├── models/            # Pydantic models
│   ├── rag/               # RAG pipeline
│   └── services/          # Business logic
│
├── apps/                   # Frontend applications
│   ├── web/               # Next.js resident app
│   ├── admin/             # Next.js admin dashboard
│   └── mobile/            # React Native app
│
├── packages/               # Shared packages
│   ├── ui/                # UI components
│   ├── types/             # TypeScript types
│   ├── api-client/        # API client
│   └── utils/             # Utilities
│
├── tests/                  # Backend tests
└── scripts/               # Utility scripts
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-contractor-reviews`
- `fix/auth-token-refresh`
- `docs/update-api-docs`
- `refactor/agent-orchestration`

### Code Changes

1. Write clean, readable code
2. Follow existing patterns and conventions
3. Add tests for new functionality
4. Update documentation as needed
5. Keep changes focused and atomic

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(agents): add contractor vetting agent

fix(auth): resolve token refresh race condition

docs(api): update offers endpoint documentation

test(matching): add unit tests for scoring algorithm
```

## Pull Request Process

### Branch flow

- **Feature/fix PRs** → open against the **`dev`** branch (not `main`).
- After your PR is **merged into `dev`**, CI runs on `dev`. When CI passes, the **Dev to Main PR** workflow automatically opens (or updates) a pull request from `dev` → `main` for production release.
- Merge the **dev → main** PR when you are ready to release to production.

### Steps

1. **Create PR** against the **`dev`** branch (base branch = `dev`).
2. **Fill out** the PR template completely.
3. **Link** any related issues.
4. **Wait** for CI checks to pass.
5. **Request** review from maintainers.
6. **Address** feedback and update as needed.
7. **Merge** into `dev` when approved. After CI passes on `dev`, a **dev → main** PR will be created automatically; merge that when ready for production.

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
How were these changes tested?

## Checklist
- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Documentation updated
- [ ] No sensitive data committed
```

## Testing

### Backend Tests

```bash
# Backend unit tests
pytest tests/unit/ -v

# Backend integration tests (requires Docker services)
pytest tests/integration/ -v --timeout=30

# Frontend tests
pnpm turbo test

# E2E tests
pnpm --filter @groupio/web exec playwright test
```

## Code Quality

We enforce code quality through:

- **Ruff** for Python linting and formatting
- **ESLint** + **Prettier** for TypeScript/JavaScript
- **mypy** for Python type checking
- **TypeScript strict mode** for frontend apps
- **`@typescript-eslint/no-explicit-any`** set to error — never use `any`

### Pre-commit hooks

```bash
pip install pre-commit
pre-commit install
```

## Branch Strategy

- `main` — production branch, protected
- `dev` — integration branch
- Feature branches: `feature/<name>`
- Bug fixes: `fix/<name>`

## Pull Request Guidelines

1. Create a feature branch from `dev`
2. Make your changes with clear, atomic commits
3. Ensure all CI checks pass (lint, typecheck, tests, security scan)
4. Write or update tests for your changes
5. Open a PR targeting `dev` with a clear description

## Common Issues

### Database connection errors

Make sure Docker services are running:
```bash
docker compose -f docker/docker-compose.yml ps
```

### API key errors

Ensure `.env` has valid `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` values (use test keys for local dev).

### pnpm lockfile issues

```bash
pnpm install --frozen-lockfile
```
