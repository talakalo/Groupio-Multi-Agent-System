"""Docker Compose PostgreSQL URL override (USE_LOCAL_POSTGRES + DOCKER_POSTGRES_*)."""

from src.config.settings import Settings


def test_docker_components_override_database_url_when_local_forced() -> None:
    s = Settings(
        ENVIRONMENT="development",
        USE_LOCAL_POSTGRES="1",
        DOCKER_POSTGRES_HOST="postgres",
        DOCKER_POSTGRES_USER="postgres",
        DOCKER_POSTGRES_PASSWORD="secret",
        DOCKER_POSTGRES_DB="groupio",
        DATABASE_URL="postgresql://user:wrong@db.example.com:5432/cloud",
        SUPABASE_URL="https://abc.supabase.co",
        SUPABASE_KEY="anon",
    )
    assert s.DATABASE_URL == "postgresql://postgres:secret@postgres:5432/groupio"


def test_special_chars_in_password_are_quoted() -> None:
    s = Settings(
        ENVIRONMENT="development",
        USE_LOCAL_POSTGRES="true",
        DOCKER_POSTGRES_HOST="postgres",
        DOCKER_POSTGRES_USER="postgres",
        DOCKER_POSTGRES_PASSWORD="p@ss:w/rd",
        DOCKER_POSTGRES_DB="groupio",
        DATABASE_URL="postgresql://ignored@x:5432/y",
    )
    assert "@postgres:5432/" in s.DATABASE_URL
    assert "p%40ss%3Aw%2Frd" in s.DATABASE_URL
