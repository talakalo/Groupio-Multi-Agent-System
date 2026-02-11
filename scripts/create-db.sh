#!/usr/bin/env bash
# Create the groupio PostgreSQL database for local development.
# Run from project root: ./scripts/create-db.sh

set -e

DB_NAME="${DB_NAME:-groupio}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo "Creating database '$DB_NAME' (user=$DB_USER, host=$DB_HOST:$DB_PORT)..."

if command -v psql &>/dev/null; then
  if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    echo "Database '$DB_NAME' already exists."
  else
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"
    echo "Database '$DB_NAME' created successfully."
  fi
elif command -v createdb &>/dev/null; then
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || echo "Database '$DB_NAME' may already exist."
  echo "Done."
else
  echo "Error: psql or createdb not found. Install PostgreSQL client tools."
  exit 1
fi
