#!/bin/bash
# Pre-commit validation: typecheck + lint
# Called by Claude Code before committing

set -e

echo "Running pre-commit checks..."

echo "→ TypeScript typecheck"
pnpm typecheck 2>&1 | tail -10

echo "→ Lint (web + admin)"
pnpm lint --filter=@groupio/web --filter=@groupio/admin 2>&1 | tail -20

echo "Pre-commit checks passed."
