"""Environment configuration for Groupio Multi-Agent System."""

from functools import lru_cache

from pydantic_settings import BaseSettings


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
    NEO4J_PASSWORD: str = "testpassword"

    # Supabase / PostgreSQL
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

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
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
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

    # Environment
    ENVIRONMENT: str = "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
