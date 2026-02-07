# Contributing to Groupio Multi-Agent System

Thank you for your interest in contributing to Groupio! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Code Style](#code-style)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and professional in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a new branch for your feature/fix
5. Make your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Backend Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Set up environment
cp .env.example .env
# Edit .env with your local settings

# Run database migrations
alembic upgrade head

# Seed test data
python scripts/seed_test_data.py

# Start the backend server
uvicorn src.main:app --reload --port 8000
```

### Frontend Setup

```bash
# Install dependencies
pnpm install

# Set up environment for each app
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local

# Start development servers
pnpm dev
```

### Docker Setup (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
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

1. **Create PR** against the `main` branch
2. **Fill out** the PR template completely
3. **Link** any related issues
4. **Wait** for CI checks to pass
5. **Request** review from maintainers
6. **Address** feedback and update as needed
7. **Squash and merge** when approved

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
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/unit/test_matching_agent.py

# Run integration tests
pytest tests/integration/
```

### Frontend Tests

```bash
# Run all tests
pnpm test

# Run tests for specific app
pnpm --filter @groupio/web test

# Run with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

## Code Style

### Python

- Follow PEP 8
- Use type hints
- Format with Black
- Sort imports with isort
- Lint with Ruff

```bash
# Format code
black src/ tests/
isort src/ tests/

# Lint
ruff src/ tests/
```

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the ESLint configuration
- Format with Prettier

```bash
# Lint and format
pnpm lint
pnpm format
```

### CSS

- Use Tailwind CSS utilities
- Follow the design system in `packages/ui`
- Support RTL (Hebrew) layouts

## Questions?

- Open a [GitHub Issue](https://github.com/groupio/groupio-multi-agent/issues)
- Join our [Discord community](https://discord.gg/groupio)
- Email: developers@groupio.co.il

---

Thank you for contributing to Groupio! 🙏
