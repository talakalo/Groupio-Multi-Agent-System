# Backend Rules

## Input Validation
- All FastAPI endpoints must use Pydantic models for request bodies
- Use `Field(...)` with constraints (min_length, ge, le) — never validate manually in route handlers
- Sanitize string inputs before DB writes (no raw user strings in queries)

## Architecture
- Routes call services; services call databases — never skip the service layer
- Put business logic in `src/services/`, not in `src/api/routes/`
- Agents (`src/agents/`) handle LLM orchestration only — not DB writes

## Database Access
- Use `src/databases/postgres.py` helpers — never import asyncpg directly in routes or services
- Always use explicit column lists; never `SELECT *`
- Column lists are defined at the top of `postgres.py` — add new ones there
- Connection pool is min 5, max 25 — never create ad-hoc connections

## Error Handling
- Every endpoint must have try/except with appropriate HTTP status codes
- Use `HTTPException` for client errors (4xx), log and return 500 for unexpected errors
- Never expose internal error messages or stack traces to API responses

## Async
- All DB calls and external API calls must be `await`ed
- Never use `time.sleep()` — use `asyncio.sleep()`
- All service methods should be `async def`

## Security
- All protected endpoints must verify JWT via auth middleware
- Check role permissions explicitly — don't rely solely on RLS for business-level access
- Rate limiting is configured globally; don't bypass it for any endpoint

## Testing
- Tests in `tests/unit/` and `tests/integration/`
- Integration tests require Docker services: `docker compose -f docker/docker-compose.yml up -d`
- 50% coverage minimum (configured in `pyproject.toml`)
- Use `pytest-asyncio` for async test functions
