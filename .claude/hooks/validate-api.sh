#!/bin/bash
# Guards against running integration tests without Docker services running
# Receives the bash command as $1

CMD="$1"

if echo "$CMD" | grep -q "pytest.*integration"; then
  if ! docker ps --format "{{.Names}}" 2>/dev/null | grep -q "groupio\|postgres\|redis"; then
    echo "⚠️  Warning: Docker services may not be running."
    echo "   Integration tests need the full stack."
    echo "   Start with: docker compose -f docker/docker-compose.yml up -d"
    echo "   (Continuing anyway — tests will fail if services are missing)"
  fi
fi
