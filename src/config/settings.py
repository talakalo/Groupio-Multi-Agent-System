"""Environment configuration for Groupio Multi-Agent System."""

import logging
import secrets
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_INSECURE_JWT_DEFAULTS = frozenset(
    {
        "your-secret-key-change-in-production",
        "secret",
        "changeme",
        "",
    }
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Keys
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # Qdrant
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str | None = None

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = ""

    # Supabase / PostgreSQL
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    # Local PostgreSQL (used when SUPABASE_URL is empty or USE_LOCAL_POSTGRES=1)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/groupio"
    # Set to "1" or "true" to force local PostgreSQL (useful when Supabase has connection issues)
    USE_LOCAL_POSTGRES: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # LLM Settings
    PRIMARY_MODEL: str = "claude-sonnet-4-20250514"
    FALLBACK_MODEL: str = "gpt-4o"
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS: int = 1536
    MAX_TOKENS: int = 4000
    TEMPERATURE: float = 0.7

    # RAG Settings
    VECTOR_TOP_K: int = 10
    RERANK_TOP_K: int = 5
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50

    # Agent Settings
    ROUTER_CONFIDENCE_THRESHOLD: float = 0.7
    SENTIMENT_ESCALATION_THRESHOLD: float = -0.5
    MAX_SUPPORT_ATTEMPTS_BEFORE_ESCALATION: int = 3
    HUMAN_ESCALATION_ENABLED: bool = True

    # Feature Flags
    ENABLE_WEB_SEARCH: bool = True
    ENABLE_GRAPH_QUERIES: bool = True
    ENABLE_PREDICTIVE_MODELS: bool = False

    # Monitoring
    SENTRY_DSN: str | None = None
    LOG_LEVEL: str = "INFO"

    # Rate Limiting
    RATE_LIMIT_PER_USER: int = 60  # requests per minute
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # JWT Authentication
    JWT_SECRET_KEY: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # WhatsApp
    WHATSAPP_API_TOKEN: str = ""
    WHATSAPP_PHONE_ID: str = ""
    WHATSAPP_WEBHOOK_SECRET: str = ""

    # CORS Settings
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # API Keys for service-to-service auth
    API_KEYS: list[str] = []

    # Email Settings (for verification emails)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@groupio.co.il"
    SMTP_FROM_NAME: str = "Groupio"

    # Payment provider ("mock" for dev/demos, future: "stripe", "payplus")
    PAYMENT_PROVIDER: str = "mock"

    # Environment
    ENVIRONMENT: str = "development"

    model_config = {
        "env_file": [".env", "docker/.env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def _validate_production_config(self) -> "Settings":
        """Prevent insecure defaults in production/staging."""
        is_prod = self.ENVIRONMENT in ("production", "staging")

        # --- JWT secret ---
        if self.ENVIRONMENT not in ("development", "test") and self.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS:
            raise ValueError(
                "JWT_SECRET_KEY must be set to a secure, random value in "
                f"non-development environments (current: ENVIRONMENT={self.ENVIRONMENT}). "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        if is_prod and len(self.JWT_SECRET_KEY) < 32:
            raise ValueError(
                f"JWT_SECRET_KEY must be at least 32 characters in {self.ENVIRONMENT} for adequate security."
            )
        if self.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS:
            logger.warning(
                "JWT_SECRET_KEY is set to an insecure default. "
                "This is acceptable in development but MUST be changed before deploying."
            )

        # --- Required secrets in production ---
        if is_prod:
            if not self.ANTHROPIC_API_KEY and not self.OPENAI_API_KEY:
                raise ValueError(
                    f"At least one LLM API key (ANTHROPIC_API_KEY or OPENAI_API_KEY) must be set in {self.ENVIRONMENT}."
                )
            if not self.API_KEYS:
                raise ValueError(f"API_KEYS must be configured for service-to-service auth in {self.ENVIRONMENT}.")
            placeholder_patterns = ("change-me", "your-", "generate-a-")
            if self.DATABASE_URL and any(p in self.DATABASE_URL for p in placeholder_patterns):
                raise ValueError(
                    f"DATABASE_URL contains a placeholder value. Set a real connection string in {self.ENVIRONMENT}."
                )

        return self


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    s = Settings()
    if s.ENVIRONMENT == "production" and (
        s.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS or len(s.JWT_SECRET_KEY) < 32
    ):
        raise ValueError(
            "JWT_SECRET_KEY must be set to a secure value (>= 32 chars, not a known default) in production."
        )
    return s
