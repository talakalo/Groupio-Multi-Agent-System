"""Alembic migration environment configuration."""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# Load environment variables (matches Settings: .env, docker/.env)
from dotenv import load_dotenv

load_dotenv()
load_dotenv("docker/.env")

# Alembic Config object
config = context.config

# Set up logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Database URL from environment
# Priority 1: DOCKER_POSTGRES_HOST set (e.g. running inside api container) — use postgres:5432
# Priority 2: alembic.docker.ini (running from host) — use 127.0.0.1
# Priority 3: DATABASE_URL
_docker_host = os.getenv("DOCKER_POSTGRES_HOST", "")
if _docker_host:
    _user = os.getenv("DOCKER_POSTGRES_USER") or os.getenv("POSTGRES_USER", "postgres")
    _pw = os.getenv("DOCKER_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD", "postgres")
    _db = os.getenv("DOCKER_POSTGRES_DB") or os.getenv("POSTGRES_DB", "groupio")
    database_url = f"postgresql://{_user}:{_pw}@{_docker_host}:5432/{_db}"
elif "alembic.docker.ini" in (config.config_file_name or ""):
    _user = os.getenv("POSTGRES_USER", "postgres")
    _pw = os.getenv("POSTGRES_PASSWORD", "postgres")
    _db = os.getenv("POSTGRES_DB", "groupio")
    database_url = f"postgresql://{_user}:{_pw}@127.0.0.1:5432/{_db}"
else:
    database_url = os.getenv(
        "DATABASE_URL",
        os.getenv("SUPABASE_URL", "postgresql://postgres:postgres@localhost:5432/groupio"),
    )

# For Supabase, convert the URL format if needed
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well. By skipping the Engine creation
    we don't even need a DBAPI to be available.
    """
    context.configure(
        url=database_url,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = create_engine(
        database_url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=None,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
