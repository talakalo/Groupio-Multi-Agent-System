"""Environment configuration for Groupio Multi-Agent System."""

import logging
import secrets
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Resolve .env from repo root so CLI scripts work regardless of cwd.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent

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

    # Vector database provider: "qdrant" (default, self-hosted) or "pinecone" (managed cloud)
    VECTOR_DB_PROVIDER: str = "qdrant"
    # Pinecone (required when VECTOR_DB_PROVIDER=pinecone)
    # Get API key from: https://app.pinecone.io → API Keys
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "groupio"
    PINECONE_ENVIRONMENT: str = ""  # only for legacy non-serverless regions

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = ""

    # Supabase / PostgreSQL
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    # Server-only (seed scripts). Never expose to browsers. If set, seed_test_data uses it as SUPABASE_KEY.
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    # Alternate env name some teams use; seed_test_data also reads os.environ["SERVICE_ROLE_KEY"].
    SERVICE_ROLE_KEY: str = ""
    # Some templates use this for the sb_secret_… / legacy server key.
    SUPABASE_SECRET_KEY: str = ""
    # Local PostgreSQL (used when SUPABASE_URL is empty or USE_LOCAL_POSTGRES=1)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/groupio"
    # Set to "1" or "true" to force local PostgreSQL (useful when Supabase has connection issues)
    USE_LOCAL_POSTGRES: str = ""
    # Docker Compose passes these so DATABASE_URL can target the `postgres` service instead of
    # a Supabase URL from .env (avoids asyncpg SSL / routing errors inside the container).
    DOCKER_POSTGRES_HOST: str = ""
    DOCKER_POSTGRES_USER: str = ""
    DOCKER_POSTGRES_PASSWORD: str = ""
    DOCKER_POSTGRES_DB: str = ""
    # Set to "1"/"true" to force asyncpg IPv4 + TLS SNI (see postgres._asyncpg_should_prefer_ipv4).
    # Supabase hosts (*.supabase.co, *pooler.supabase.com) already prefer IPv4 by default.
    DATABASE_PREFER_IPV4: str = ""

    # Redis
    # In production, set REDIS_URL to include credentials, e.g.:
    #   redis://:yourpassword@redis:6379/0
    # Or set REDIS_PASSWORD separately (used when REDIS_URL has no password).
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_PASSWORD: str = ""

    # LLM Settings
    PRIMARY_MODEL: str = "claude-sonnet-4-20250514"
    FALLBACK_MODEL: str = "gpt-4o"
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS: int = 1536
    MAX_TOKENS: int = 4000
    TEMPERATURE: float = 0.7
    # Timeout in seconds for a single LLM API call; 0 disables timeout.
    # On timeout the client automatically retries with FALLBACK_MODEL.
    LLM_TIMEOUT_SECONDS: float = 30.0

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

    # Agent Autonomy Modes: "auto" | "recommend" | "gated"
    # auto: results are applied immediately
    # recommend: results are queued for admin confirmation before action
    # gated: always requires human approval (like outreach)
    MATCHING_AGENT_MODE: str = "recommend"
    PRICING_AGENT_MODE: str = "recommend"
    VETTING_AGENT_MODE: str = "recommend"
    OUTREACH_AGENT_MODE: str = "gated"
    PAYMENT_AGENT_MODE: str = "gated"

    # Feature Flags
    ENABLE_WEB_SEARCH: bool = True
    ENABLE_GRAPH_QUERIES: bool = True
    ENABLE_PREDICTIVE_MODELS: bool = False
    # PERF-11: when True, building similarity materialisation uses a top-K
    # bounded Cypher projection (LIMIT + similarity threshold). When False,
    # falls back to the original all-to-all computation.
    ENABLE_GDS_SIMILARITY: bool = False
    GDS_SIMILARITY_TOP_K: int = 15
    GDS_SIMILARITY_MIN_SCORE: float = 0.7

    # Async messaging / CRM (all default off — enable per environment after verification)
    # RabbitMQ: set ENABLE_RABBITMQ=true and RABBITMQ_URL when using workers + dispatcher.
    ENABLE_RABBITMQ: bool = False
    # Transactional outbox (Postgres outbox_events + dispatcher worker).
    ENABLE_OUTBOX: bool = False
    # Route selected notifications through outbox → RabbitMQ → worker-notifications.
    ENABLE_NOTIFICATION_QUEUE: bool = False
    # CRM sync worker (EspoCRM projection; Groupio DB remains authoritative).
    ENABLE_CRM_SYNC: bool = False
    # Outbox rows for payment / invoice derived events (after Stripe webhook DB success).
    ENABLE_PAYMENT_EVENTS: bool = False

    # RabbitMQ (AMQP URL, e.g. amqp://guest:guest@localhost:5672/)
    RABBITMQ_URL: str = ""
    RABBITMQ_EXCHANGE_EVENTS: str = "groupio.events"
    # Outbox dispatcher poll interval when running as standalone worker.
    OUTBOX_POLL_INTERVAL_MS: int = 500

    # EspoCRM REST API (optional; used only when ENABLE_CRM_SYNC and workers run).
    ESPOCRM_BASE_URL: str = ""
    ESPOCRM_API_KEY: str = ""
    # Entity type names in Espo API paths (e.g. custom module C_GroupioContractor, or native Account).
    ESPOCRM_ENTITY_CONTRACTOR: str = "C_GroupioContractor"
    ESPOCRM_ENTITY_BUILDING: str = "C_GroupioBuilding"
    ESPOCRM_ENTITY_NOTE: str = "Note"
    # Attribute keys sent in JSON bodies — must exist on the target entities in Espo.
    ESPOCRM_FIELD_CONTRACTOR_EXTERNAL_ID: str = "cGroupioContractorId"
    ESPOCRM_FIELD_CONTRACTOR_VERIFICATION: str = "cGroupioVerificationStatus"
    ESPOCRM_FIELD_BUILDING_EXTERNAL_ID: str = "cGroupioBuildingId"
    ESPOCRM_FIELD_BUILDING_ADDRESS: str = "cGroupioAddress"
    ESPOCRM_FIELD_BUILDING_CITY: str = "cGroupioCity"
    ESPOCRM_FIELD_BUILDING_REGION: str = "cGroupioRegion"

    # Monitoring
    SENTRY_DSN: str | None = None
    LOG_LEVEL: str = "INFO"

    # PostgreSQL statement timeout in milliseconds. 0 disables the timeout.
    # Prevents runaway queries from holding connections indefinitely.
    # Default: 30 000 ms (30 s). Tune down for read-heavy list endpoints.
    DB_STATEMENT_TIMEOUT_MS: int = 30_000

    # Rate Limiting
    RATE_LIMIT_PER_USER: int = 60  # requests per minute
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # JWT Authentication
    # Leave empty in development — a warning will be logged.
    # MUST be set to a stable, random secret in production/staging.
    # Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
    JWT_SECRET_KEY: str = ""
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

    # Government / open-data enrichment (optional; stub used when empty)
    GOV_ADDRESS_API_URL: str = ""
    GOV_CONTRACTOR_API_URL: str = ""
    GOV_MUNICIPALITY_API_URL: str = ""
    # Phase 3: data.gov.il integration. Set to "1" or "true" to enable.
    ENABLE_DATAGOV_IL: str = "1"

    # Email Settings (for verification emails)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@groupio.co.il"
    SMTP_FROM_NAME: str = "Groupio"
    # When True, login rejects unverified users with 403. Enabled by default for production safety.
    # Set ENFORCE_EMAIL_VERIFICATION=false in .env to disable during local development.
    ENFORCE_EMAIL_VERIFICATION: bool = True
    # Base URL for verification links in emails (default for production)
    FRONTEND_URL: str = "https://groupio.co.il"
    # Admin inbox for system alerts (vetting escalations, expiry errors, etc.)
    ADMIN_EMAIL: str = ""
    # Resend email API (preferred over SMTP in non-dev environments).
    # Get key from: https://resend.com/api-keys
    # When set, SMTP settings are ignored.
    RESEND_API_KEY: str = ""

    # Push Notifications (Firebase Cloud Messaging)
    # Set FCM_SERVER_KEY to your Firebase project's server key to enable push notifications.
    # When empty, push notifications are silently skipped (log at DEBUG level).
    FCM_SERVER_KEY: str = ""
    # FCM endpoint (override only for testing)
    FCM_ENDPOINT: str = "https://fcm.googleapis.com/fcm/send"

    # Payment provider ("mock" for dev/demos, "stripe" for production)
    # Supported values: "mock" | "stripe" | "bit" | "paybox"
    # "bit" and "paybox" require external merchant onboarding before use.
    # See docs/PAYMENT_PROVIDER_ONBOARDING.md for instructions.
    PAYMENT_PROVIDER: str = "mock"

    # Stripe credentials (required when PAYMENT_PROVIDER=stripe)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    # Stripe webhook signing secret (from Stripe Dashboard → Webhooks → Signing secret)
    # Used by POST /payments/webhook/stripe to verify authentic Stripe events.
    STRIPE_WEBHOOK_SECRET: str = ""
    # Stripe Price ID for recurring contractor marketplace membership (subscription mode checkout).
    # Required to call POST /contractors/me/membership/checkout-session when PAYMENT_PROVIDER=stripe.
    STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID: str = ""

    # Shared HMAC webhook signing secret — must be set in non-dev environments
    # to prevent fraudulent webhook forgery. Generate with:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    PAYMENT_WEBHOOK_SECRET: str = ""

    # ── bit payment integration ──────────────────────────────────────────────
    # NOT YET LIVE — requires onboarding with bit Israel (bit.co.il).
    # Set ENABLE_BIT_PAYMENT=true only after completing merchant onboarding.
    # See docs/PAYMENT_PROVIDER_ONBOARDING.md — section: "bit Integration".
    ENABLE_BIT_PAYMENT: bool = False
    BIT_API_KEY: str = ""
    BIT_MERCHANT_ID: str = ""
    # "sandbox" or "production"
    BIT_ENVIRONMENT: str = "sandbox"

    # ── PayBox payment integration ───────────────────────────────────────────
    # NOT YET LIVE — requires onboarding with PayBox (payboxpayments.com / paybox.co.il).
    # Set ENABLE_PAYBOX_PAYMENT=true only after completing merchant onboarding.
    # See docs/PAYMENT_PROVIDER_ONBOARDING.md — section: "PayBox Integration".
    ENABLE_PAYBOX_PAYMENT: bool = False
    PAYBOX_TERMINAL: str = ""
    PAYBOX_API_KEY: str = ""
    # "sandbox" or "production"
    PAYBOX_ENVIRONMENT: str = "sandbox"

    # Environment
    ENVIRONMENT: str = "development"

    model_config = {
        "env_file": [
            str(_REPO_ROOT / ".env"),
            str(_REPO_ROOT / "docker" / ".env"),
        ],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def _validate_production_config(self) -> "Settings":
        """Prevent insecure defaults in production/staging."""
        is_prod = self.ENVIRONMENT in ("production", "staging")

        # --- Docker: local Postgres service (overrides DATABASE_URL from .env) ---
        force_local_pg = (self.USE_LOCAL_POSTGRES or "").lower() in ("1", "true", "yes")
        if force_local_pg and (self.DOCKER_POSTGRES_HOST or "").strip():
            user = (self.DOCKER_POSTGRES_USER or "postgres").strip()
            password = self.DOCKER_POSTGRES_PASSWORD or ""
            db = (self.DOCKER_POSTGRES_DB or "groupio").strip()
            host = self.DOCKER_POSTGRES_HOST.strip()
            self.DATABASE_URL = (
                f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@{host}:5432/{quote(db, safe='')}"
            )

        # --- JWT secret ---
        if self.ENVIRONMENT not in ("development", "test") and self.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS:
            raise ValueError(
                "JWT_SECRET_KEY must be set to a stable, random value in "
                f"non-development environments (current: ENVIRONMENT={self.ENVIRONMENT}). "
                "An auto-generated key is NOT acceptable — it changes on every restart, "
                "invalidating all active user sessions. "
                'Generate a persistent key with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        if is_prod and len(self.JWT_SECRET_KEY) < 32:
            raise ValueError(
                f"JWT_SECRET_KEY must be at least 32 characters in {self.ENVIRONMENT} for adequate security."
            )
        if self.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS:
            if self.ENVIRONMENT in ("development", "test"):
                # Auto-generate a per-process dev key so the server is usable without config.
                # Tokens will be invalidated on every restart — acceptable for local dev.
                self.JWT_SECRET_KEY = secrets.token_urlsafe(32)
                logger.warning(
                    "JWT_SECRET_KEY not set — generated a temporary dev key. "
                    "Sessions will be invalidated on every restart. "
                    "Set JWT_SECRET_KEY in .env to persist sessions across restarts."
                )
            # Production case is already handled by the raise above.

        # --- Email verification enforcement ---
        if not self.ENFORCE_EMAIL_VERIFICATION and self.ENVIRONMENT not in ("development", "test"):
            logger.warning(
                "ENFORCE_EMAIL_VERIFICATION is disabled in %s. "
                "Unverified users can log in. Enable it to protect the platform.",
                self.ENVIRONMENT,
            )

        # --- Outbound email (staging/production): required when verification is enforced ---
        if is_prod and self.ENFORCE_EMAIL_VERIFICATION:
            has_resend = bool((self.RESEND_API_KEY or "").strip())
            has_smtp = bool(
                (self.SMTP_HOST or "").strip() and (self.SMTP_USER or "").strip() and (self.SMTP_PASSWORD or "").strip()
            )
            if not has_resend and not has_smtp:
                raise ValueError(
                    f"ENFORCE_EMAIL_VERIFICATION is True in {self.ENVIRONMENT} but no email transport is configured. "
                    "Set RESEND_API_KEY (recommended) or SMTP_HOST + SMTP_USER + SMTP_PASSWORD. "
                    "Verification and password-reset emails will not be delivered otherwise."
                )

        # --- Payments: publishable environments (staging + production) ---
        if self.ENVIRONMENT in ("production", "staging"):
            prov = (self.PAYMENT_PROVIDER or "").lower()
            if prov == "mock":
                raise ValueError(
                    f"PAYMENT_PROVIDER=mock is not allowed when ENVIRONMENT={self.ENVIRONMENT!r}. "
                    "Use PAYMENT_PROVIDER=stripe with real Stripe credentials for any publishable deploy."
                )
            if prov in ("bit", "paybox"):
                raise ValueError(
                    f"PAYMENT_PROVIDER={prov!r} is not launch-ready (integration incomplete). "
                    f"Set PAYMENT_PROVIDER=stripe when ENVIRONMENT={self.ENVIRONMENT!r}."
                )
            if prov == "stripe":
                if not self.STRIPE_SECRET_KEY or not self.STRIPE_SECRET_KEY.strip():
                    raise ValueError(
                        "STRIPE_SECRET_KEY must be set when PAYMENT_PROVIDER=stripe "
                        f"and ENVIRONMENT={self.ENVIRONMENT!r}."
                    )
                if not self.STRIPE_WEBHOOK_SECRET or not self.STRIPE_WEBHOOK_SECRET.strip():
                    raise ValueError(
                        "STRIPE_WEBHOOK_SECRET must be set when PAYMENT_PROVIDER=stripe "
                        f"and ENVIRONMENT={self.ENVIRONMENT!r} "
                        "(required for payment + subscription webhook verification)."
                    )

        # --- Required secrets in production ---
        if is_prod:
            if not self.PAYMENT_WEBHOOK_SECRET:
                raise ValueError(
                    f"PAYMENT_WEBHOOK_SECRET must be set in {self.ENVIRONMENT} to prevent "
                    "fraudulent payment webhook forgery. "
                    'Generate with: python -c "import secrets; print(secrets.token_hex(32))"'
                )
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
    if s.ENVIRONMENT == "production" and (s.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS or len(s.JWT_SECRET_KEY) < 32):
        raise ValueError(
            "JWT_SECRET_KEY must be set to a secure value (>= 32 chars, not a known default) in production."
        )
    return s
