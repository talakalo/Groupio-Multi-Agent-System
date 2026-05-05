#!/bin/bash
# Auto-fix lint issues after a file is edited
# Receives the edited file path as $1

FILE="$1"

if [[ -z "$FILE" ]]; then
  exit 0
fi

if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
  npx eslint "$FILE" --fix --quiet 2>/dev/null || true
fi

if [[ "$FILE" == *.py ]]; then
  python -m ruff check "$FILE" --fix --quiet 2>/dev/null || true
fi
